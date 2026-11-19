import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { route, answer, handle, settings } from './src/service.mjs';
import { localRooms, localProfiles } from './src/local-rooms.mjs';
import { handleProfile } from './src/profiles.mjs';

const instance=createHash('sha256').update(import.meta.url).digest('hex').slice(0,16);
const directory=process.env.TAVOLO_ROOM_DIR??join(tmpdir(),'Tavolo',instance);
const rooms=localRooms(directory), profiles=localProfiles(join(directory,'profili')), feeds=new Map();
// Locally the core was last updated when a file in src/ last changed on disk.
const core=new URL('./src/',import.meta.url);
const coreUpdated=new Date(Math.max(...readdirSync(core).map(name=>statSync(new URL(name,core)).mtimeMs))).toISOString();
const mime={html:'text/html',css:'text/css',mjs:'text/javascript',webp:'image/webp'};
const server=createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const match=route.exec(url.pathname);
    if(match) {
      const [,code,action]=match;
      if(action==='live') {res.writeHead(426).end();return;}
      if(action==='events') {
        const token=url.searchParams.get('seat');
        let state;
        try {
          const room=rooms.read(code);
          if(!room||Date.now()-room.updatedAt>=sessionLifetime){res.writeHead(404).end();return;}
          state=snapshotFor(room,token);
        } catch {res.writeHead(401).end();return;}
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});
        const emit=next=>res.write('data: '+JSON.stringify(next)+'\n\n');
        emit(state);
        const list=feeds.get(code)??new Set();
        feeds.set(code,list);
        const listener={token,emit,end:()=>res.end()};
        list.add(listener);
        res.on('close',()=>{list.delete(listener);if(!list.size) feeds.delete(code);});
        return;
      }
      const headers=new Headers(req.headers);
      const init={method:req.method,headers};
      if(req.method==='POST') Object.assign(init,{body:Readable.toWeb(req),duplex:'half'});
      const response=await handle(new Request(url,init),action,()=>rooms.read(code),room=>{
        rooms.save(code,room);
        for(const listener of feeds.get(code)??[]) {
          listener.emit(snapshotFor(room,listener.token));
        }
      });
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    if(url.pathname==='/api/profile') {
      const init={method:req.method,headers:new Headers(req.headers)};
      if(req.method==='POST') Object.assign(init,{body:Readable.toWeb(req),duplex:'half'});
      const response=await handleProfile(new Request(url,init),{read:id=>profiles.read(id),save:(id,profile)=>profiles.save(id,profile)});
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    if(url.pathname==='/api/config') {res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(settings('sse',coreUpdated)));return;}
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!/^[\w.-]+\.(html|css|mjs|webp)$/.test(name)) {res.writeHead(404).end();return;}
    const body=await readFile(new URL('./public/'+name,import.meta.url));
    res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)]+(name.endsWith('.webp')?'':'; charset=utf-8')}).end(body);
  } catch(error) {res.writeHead(error.code==='ENOENT'?404:503).end();}
});
import { snapshot as snapshotFor, sessionLifetime } from './src/room.mjs';
function prune() {
  try {
    profiles.prune();
    for(const code of rooms.prune()) {
      for(const listener of feeds.get(code)??[]) listener.end();
      feeds.delete(code);
    }
  } catch(error) {console.warn('Pulizia delle stanze temporanee:',error.code??error.name);}
}
prune();
setInterval(prune,60000).unref();
server.listen(Number(process.env.PORT??8788),process.env.APP_BIND??'127.0.0.1',()=>console.log('Tavolo pronto sulla porta '+server.address().port));
