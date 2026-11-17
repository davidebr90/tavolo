import { DurableObject } from 'cloudflare:workers';
import { route, answer, handle, validToken } from './service.mjs';
import { snapshot, sessionLifetime } from './room.mjs';

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const match=route.exec(url.pathname);
    if(!match) return answer({error:'Percorso sconosciuto.'},404);
    const origin=request.headers.get('Origin');
    if(origin && origin!==url.origin) return answer({error:'Origine non autorizzata.'},403);
    return env.ROOMS.getByName(match[1]).fetch(request);
  }
};
export class GameRoom extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, json TEXT NOT NULL)');
  }
  read() {
    const row=this.sql.exec('SELECT json FROM state WHERE id=1').toArray()[0];
    return row?JSON.parse(row.json):null;
  }
  publish(room) {
    for(const socket of this.ctx.getWebSockets()) {
      const token=socket.deserializeAttachment();
      if(!token) continue;
      try {socket.send(JSON.stringify(snapshot(room,token)));} catch {try {socket.close(1011,'Sync');} catch {}}
    }
  }
  async fetch(request) {
    const operation=route.exec(new URL(request.url).pathname)?.[2];
    if(operation==='live') {
      if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket') return answer({error:'WebSocket richiesto.'},426);
      if(!this.read()) return answer({error:'Stanza non trovata.'},404);
      const [client,server]=Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      return new Response(null,{status:101,webSocket:client});
    }
    return handle(request,operation,()=>this.read(),room=>{
      this.sql.exec('INSERT OR REPLACE INTO state (id,json) VALUES (1,?)',JSON.stringify(room));
      this.ctx.waitUntil(this.ctx.storage.setAlarm(room.updatedAt+sessionLifetime));
      this.publish(room);
    });
  }
  async alarm() {
    const room=this.read();
    if(!room)return;
    const expires=(room.updatedAt??0)+sessionLifetime;
    if(expires>Date.now()) {await this.ctx.storage.setAlarm(expires);return;}
    this.sql.exec('DELETE FROM state');
    for(const socket of this.ctx.getWebSockets()) socket.close(1000,'Stanza scaduta');
  }
  webSocketMessage(socket,token) {
    if(socket.deserializeAttachment() || !validToken(token)) {
      socket.close(1008,'Accesso non valido');
      return;
    }
    try {
      const state=snapshot(this.read(),token);
      socket.serializeAttachment(token);
      socket.send(JSON.stringify(state));
    } catch {socket.close(1008,'Accesso non valido');}
  }
  webSocketClose(socket,code) {
    socket.close(code===1005||code===1006?1000:code,'');
  }
}
