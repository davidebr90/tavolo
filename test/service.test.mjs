import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handle } from '../src/service.mjs';
import { snapshot } from '../src/room.mjs';
import { games } from '../src/games.mjs';

const token=()=>randomBytes(32).toString('hex');
function room() {
  let saved;
  const events=[];
  return {events,async call(seat,operation,body) {
    const request=new Request('https://example.test',{
      method:body?'POST':'GET',headers:{Authorization:'Bearer '+seat},
      body:body?JSON.stringify(body):undefined
    });
    const res=await handle(request,operation,()=>structuredClone(saved),value=>{
      saved=value;
      events.push(saved.version);
    });
    return [res.status,await res.json()];
  },state(seat){return snapshot(saved,seat);}};
}
test('Duplicate HTTP move requests persist and publish one version',async ()=>{
  const r=room(), a=token(), b=token();
  assert.equal((await r.call(a,null,{game:'tris',name:'Uno'}))[0],200);
  assert.equal((await r.call(b,'join',{name:'Due'}))[0],200);
  const move={version:1,id:'one',action:{at:4}};
  const replies=await Promise.all([r.call(a,'moves',move),r.call(a,'moves',move)]);
  assert.deepEqual(replies.map(([status,data])=>[status,data.version]),[[200,2],[200,2]]);
  assert.deepEqual(r.events,[0,1,2]);
  assert.equal((await r.call(b,'moves',{...move,id:'stale'}))[0],409);
  assert.equal((await r.call(b,'moves',{version:2,id:'two',action:{at:1}}))[0],200);
  assert.equal(r.state(a).game.turn,0);
  assert.equal(r.state(b).game.board[4],1);
  assert.equal((await r.call(token(),'join',{name:'Tre'}))[0],409);
});
test('36 concurrent rooms isolate players and state for all twelve games',async ()=>{
  await Promise.all(Array.from({length:36},async (_,i)=>{
    const r=room(),a=token(),b=token(),game=games[i%games.length];
    assert.equal((await r.call(a,null,{game,name:'Giocatore '+i}))[1].game.id,game);
    assert.equal((await r.call(b,'join',{name:'Ospite'}))[1].version,1);
    assert.deepEqual(r.state(a).players,['Giocatore '+i,'Ospite']);
    assert.equal((await r.call(token(),null))[0],409);
  }));
});
test('Chat and a concurrent move each commit without invalidating the other',async ()=>{
  const r=room(),a=token(),b=token();
  await r.call(a,null,{game:'tris',name:'Ada'});
  await r.call(b,'join',{name:'Leo'});
  const replies=await Promise.all([
    r.call(a,'moves',{id:'first',version:1,action:{at:0}}),
    r.call(b,'chat',{id:'c'.repeat(32),text:'Ciao'})
  ]);
  assert.deepEqual(replies.map(([status])=>status),[200,200]);
  const state=r.state(a);
  assert.equal(state.version,2);
  assert.equal(state.chat[0].text,'Ciao');
  assert.equal(state.game.board[0],1);
});
test('The production request handler closes a room with no guest and returns the final state',async ()=>{
  const r=room(),a=token(),b=token();
  const [,start]=await r.call(a,null,{game:'chess',name:'Ada'});
  const message={id:'close',version:start.version,action:{close:'request'}};
  const [status,closed]=await r.call(a,'moves',message);
  assert.equal(status,200);
  assert.equal(closed.closed,true);
  assert.equal(closed.closeRequest,null);
  assert.equal((await r.call(a,'moves',message))[1].closed,true);
  assert.equal((await r.call(b,'join',{name:'Leo'}))[0],409);
});
test('A concurrent guest move cannot be bypassed by a stale dashboard close',async ()=>{
  const r=room(),a=token(),b=token();
  await r.call(a,null,{game:'tris',name:'Ada'});
  await r.call(b,'join',{name:'Leo'});
  await r.call(a,'moves',{id:'first',version:1,action:{at:0}});
  await r.call(b,'moves',{id:'second',version:2,action:{at:1}});
  assert.equal((await r.call(a,'moves',{id:'close',version:2,action:{close:'request'}}))[0],409);
  const [,requested]=await r.call(a,'moves',{id:'close',version:3,action:{close:'request'}});
  assert.equal(requested.closed,false);
  assert.equal(requested.closeRequest,0);
  assert.equal((await r.call(b,'moves',{id:'accept',version:4,action:{close:'accept'}}))[1].closed,true);
});

test('Room identity survives joins, nickname updates and moves',async ()=>{
  const r=room(),host=token(),guest=token();
  const [status,created]=await r.call(host,null,{game:'tris',name:'Ada',roomName:' Pausa pranzo '});
  assert.equal(status,200);
  assert.equal(created.roomName,'Pausa pranzo');
  assert.ok(Number.isFinite(created.createdAt));
  await r.call(guest,'join',{name:'Leo'});
  await r.call(guest,'nickname',{name:'Leonardo'});
  const state=r.state(host);
  await r.call(host,'moves',{id:'first',version:state.version,action:{at:0}});
  const next=r.state(host);
  assert.equal(next.roomName,created.roomName);
  assert.equal(next.createdAt,created.createdAt);
  assert.deepEqual(next.players,['Ada','Leonardo']);
});
