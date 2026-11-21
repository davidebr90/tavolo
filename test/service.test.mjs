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
test('Both seats and spectators see chess style changes alongside a concurrent move',async ()=>{
  const r=room(), a=token(), b=token();
  const [,initial]=await r.call(a,null,{game:'chess',name:'Ada'});
  assert.deepEqual(initial.chessStyle,{id:'classico',revision:0,author:null});
  await r.call(b,'join',{name:'[b]Leo[/b]',format:'basic'});
  const updates=await Promise.all([
    r.call(b,'chess-style',{id:'art-deco',revision:0}),
    r.call(a,'moves',{id:'e4',version:1,action:{from:52,to:36}})
  ]);
  assert.deepEqual(updates.map(([status])=>status),[200,200]);
  const expected={id:'art-deco',revision:1,author:'Leo'};
  for(const viewer of [a,b,'guarda']){
    const state=r.state(viewer);
    assert.deepEqual(state.chessStyle,expected);
    assert.equal(state.version,2);
    assert.equal(state.game.history.length,1);
    assert.equal(state.game.turn,1);
  }
  await r.call(b,'nickname',{name:'Leonardo'});
  assert.equal(r.state(a).chessStyle.author,'Leo');
});

test('Style retries do not republish or overwrite a later choice; the room enforces the allowed styles',async ()=>{
  const r=room(), a=token(), b=token();
  await r.call(a,null,{game:'chess',name:'Ada'});
  await r.call(b,'join',{name:'Leo'});
  const choose=(who,id,revision)=>r.call(who,'chess-style',{id,revision});
  assert.equal((await choose(a,'classico',0))[0],200);
  const competing=await Promise.all([choose(a,'nordico',0),choose(b,'intarsio',0)]);
  assert.deepEqual(competing.map(([status])=>status).sort(),[200,409]);
  const {id}=r.state(a).chessStyle;
  assert.equal((await choose(a,id,0))[0],200);
  assert.equal((await choose(b,'art-deco',1))[0],200);
  for(const [who,style,rev] of [[a,id,0],[a,'bad',2],[a,'intarsio','2'],[token(),'intarsio',2]]) {
    assert.equal((await choose(who,style,rev))[0],409);
  }
  assert.deepEqual(r.state(a).chessStyle,{id:'art-deco',revision:2,author:'Leo'});
  assert.deepEqual(r.events,[0,1,1,1]);
  await r.call(a,'moves',{id:'close',version:1,action:{close:'request'}});
  assert.equal((await choose(b,'classico',2))[0],409);
  const other=room();
  await other.call(a,null,{game:'tris',name:'Ada'});
  assert.equal('chessStyle' in other.state(a),false);
  assert.equal((await other.call(a,'chess-style',{id:'classico',revision:0}))[0],409);
});

test('The chess style and its author survive a rematch that swaps seats',async ()=>{
  const r=room(), a=token(), b=token();
  await r.call(a,null,{game:'chess',name:'Ada'});
  await r.call(b,'join',{name:'Leo'});
  await r.call(a,'chess-style',{id:'intarsio',revision:0});
  for(const [who,from,to] of [[a,53,45],[b,12,28],[a,54,38],[b,3,39]]) {
    assert.equal((await r.call(who,'moves',{id:'p'+from,version:r.state(who).version,action:{from,to}}))[0],200);
  }
  assert.equal(r.state(a).game.result,1);
  for(const who of [a,b])await r.call(who,'moves',{id:'again',version:r.state(who).version,action:{rematch:true}});
  const next=r.state(a);
  assert.equal(next.games,2);
  assert.equal(next.side,1);
  assert.deepEqual(next.chessStyle,{id:'intarsio',revision:1,author:'Ada'});
});
test('36 concurrent rooms isolate players and state for every game',async ()=>{
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
