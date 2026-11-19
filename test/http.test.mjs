import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';

const random=n=>randomBytes(n).toString('hex');
test('Local HTTP and realtime over TCP', {timeout:15000,skip:!process.env.TAVOLO_HTTP_TEST}, async t=>{
  const server=spawn(process.execPath,['dev.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0'}});
  t.after(()=>server.kill());
  const [out]=await once(server.stdout,'data');
  const base='http://127.0.0.1:'+out.toString().match(/porta (\d+)/)[1];
  const headers=token=>({Authorization:'Bearer '+token,'Content-Type':'application/json'});
  async function call(code,token,path='',body) {
    const res=await fetch(base+'/api/rooms/'+code+path,{headers:headers(token),method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});
    return [res.status,await res.json()];
  }
  const index=await fetch(base);
  assert.match(await index.text(),/Tavolo/);
  assert.equal((await fetch(base+'/app.mjs')).status,200);
  const config=await (await fetch(base+'/api/config')).json();
  assert.equal(config.transport,'sse');
  assert.match(config.version,/^\d+\.\d+\.\d+$/);
  assert.ok(Number.isFinite(Date.parse(config.updated)));
  const profileKey=random(32), profileCall=(body)=>fetch(base+'/api/profile',{method:body?'POST':'GET',headers:headers(profileKey),body:body?JSON.stringify(body):undefined});
  assert.equal((await profileCall()).status,404);
  assert.equal((await profileCall({name:'Ada',add:[{code:random(12),token:random(32)}]})).status,200);
  assert.equal((await (await profileCall()).json()).seats.length,1);
  const code=random(12),host=random(32),guest=random(32);
  assert.equal((await call(code,host,'',{game:'tris',name:'Ada'}))[0],200);
  const stream=await fetch(base+'/api/rooms/'+code+'/events?seat='+host);
  assert.equal(stream.status,200);
  const reader=stream.body.getReader(), decoder=new TextDecoder();
  let buffer='';
  async function event() {
    while(!buffer.includes('\n\n')) {
      const chunk=await reader.read();
      assert.equal(chunk.done,false);
      buffer+=decoder.decode(chunk.value,{stream:true});
    }
    const [line,...rest]=buffer.split('\n\n');
    buffer=rest.join('\n\n');
    return JSON.parse(line.slice(6));
  }
  assert.equal((await event()).version,0);
  assert.equal((await call(code,guest,'/join',{name:'Leo'}))[0],200);
  assert.deepEqual((await event()).players,['Ada','Leo']);
  const move={version:1,id:'m1',action:{at:4}};
  const [a,b]=await Promise.all([call(code,host,'/moves',move),call(code,host,'/moves',move)]);
  assert.equal(a[0],200);assert.equal(b[0],200);
  assert.equal(a[1].version,2);assert.equal(b[1].version,2);
  assert.equal((await event()).game.turn,1);
  assert.equal((await call(code,guest))[1].game.board[4],1);
  assert.equal((await call(code,host,'/moves',{version:2,id:'m2',action:{at:1}}))[0],409);
  assert.equal((await call(code,random(32),'/join',{name:'Intruso'}))[0],409);
  assert.equal((await call(code,guest,'/moves',{version:2,id:'m3',action:{at:1}}))[0],200);
  assert.equal((await event()).game.turn,0);
  await reader.cancel();
  const types=['chess','naval','reversi','four','dama','tris'];
  await Promise.all(Array.from({length:36},async (_,i)=>{
    const code=random(12),first=random(32),second=random(32),game=types[i%types.length];
    assert.equal((await call(code,first,'',{game,name:'Primo'}))[1].game.id,game);
    assert.equal((await call(code,second,'/join',{name:'Secondo'}))[1].version,1);
    assert.deepEqual((await call(code,first))[1].players,['Primo','Secondo']);
  }));
});
