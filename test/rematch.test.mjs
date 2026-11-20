import test from 'node:test';
import assert from 'node:assert/strict';
import {create,join,submit,snapshot,chat,sessionLifetime} from '../src/room.mjs';
import {moveEffects} from '../public/effects.mjs';

const A='a'.repeat(64), B='b'.repeat(64), C='c'.repeat(64);
let id=0;
const send=(room,token,action)=>submit(room,token,{id:'r'+(++id),version:room.version,action});
function finishedTris() {
  const room=create('tris','Ada',A);
  join(room,'Bruno',B);
  for(const [token,at] of [[A,0],[B,1],[A,4],[B,2],[A,8]])send(room,token,{at});
  assert.equal(room.game.result,0);
  return room;
}

test('Rooms stay available for a week without activity',()=>{
  assert.equal(sessionLifetime,7*24*60*60*1000);
});

test('A rematch needs every player, then rotates the seats and starts a new game',()=>{
  const room=finishedTris();
  chat(room,A,{id:'c'.repeat(32),text:'Bella partita'});
  assert.throws(()=>send(room,B,{at:5}),/terminata/);
  send(room,A,{rematch:true});
  assert.deepEqual(snapshot(room,B).rematch,[0]);
  assert.notEqual(snapshot(room,B).game.result,null);
  const before=snapshot(room,B);
  const last={id:'again',version:room.version,action:{rematch:true}};
  assert.equal(submit(room,B,last),true);
  const ada=snapshot(room,A), bruno=snapshot(room,B);
  assert.equal(ada.game.result,null);
  assert.deepEqual(ada.game.board,Array(9).fill(0));
  assert.deepEqual(ada.players,['Bruno','Ada']);
  assert.equal(bruno.side,0);
  assert.equal(ada.side,1);
  assert.equal(ada.games,2);
  assert.deepEqual(ada.rematch,[]);
  assert.equal(ada.chat[0].side,1,'the message follows its author to the new seat');
  assert.equal(submit(room,B,last),false,'a retried request is not applied twice');
  assert.throws(()=>send(room,A,{at:4}),/turno/);
  send(room,B,{at:4});
  assert.equal(snapshot(room,A).game.board[4],1);
  const effects=moveEffects(before,bruno);
  assert.deepEqual(effects[0],{type:'start',rematch:true});
  assert.equal(effects.at(-1).type,'your-turn');
});

test('A rematch is refused during a game and after the room is closed',()=>{
  const playing=create('tris','Ada',A);
  join(playing,'Bruno',B);
  assert.throws(()=>send(playing,A,{rematch:true}),/conclusa/);
  const closed=create('tris','Ada',A);
  join(closed,'Bruno',B);
  send(closed,A,{close:'request'});
  assert.equal(closed.closed,true);
  assert.throws(()=>send(closed,A,{rematch:true}),/conclusa/);
});

test('A rematch keeps the options the room was created with',()=>{
  const sea=create('naval','Ada',A,{size:8,ships:6});
  join(sea,'Bruno',B);
  sea.game.result=1;
  send(sea,A,{rematch:true});
  send(sea,B,{rematch:true});
  assert.equal(sea.game.size,8);
  assert.equal(sea.game.lengths.length,6);
  assert.deepEqual(sea.game.fleets,[null,null]);
  const uno=create('uno','Ada',A,{players:3});
  join(uno,'Bruno',B);
  join(uno,'Carla',C);
  uno.game.result=2;
  delete uno.options;
  for(const token of [A,B])send(uno,token,{rematch:true});
  assert.deepEqual(snapshot(uno,C).rematch,[0,1]);
  send(uno,C,{rematch:true});
  assert.equal(uno.game.hands.length,3);
  assert.deepEqual(snapshot(uno,A).players,['Bruno','Carla','Ada']);
});

test('The end of a smazzata pays the points before the next deal',()=>{
  const room=create('scopa','Ada',A);
  join(room,'Bruno',B);
  const g=room.game;
  g.turn=0;
  g.captured[0].push(...g.deck.splice(0,17));
  g.captured[1].push(...g.deck.splice(0));
  g.hands=[g.hands[0].slice(0,1),g.hands[1].slice(0,1)];
  g.table=[];
  g.lastCapture=0;
  send(room,A,{card:g.hands[0][0],take:[]});
  const before=snapshot(room,A);
  const card=room.game.hands[1][0];
  const take=snapshot(room,B).game.takes[card][0];
  send(room,B,{card,take});
  const after=snapshot(room,A), effects=moveEffects(before,after);
  assert.equal(after.game.round,2);
  const points=effects.find(effect=>effect.type==='points');
  assert.deepEqual(points.points,after.game.points);
  assert.deepEqual(points.scores,after.game.scores);
  assert.ok(effects.findIndex(effect=>effect.type==='points')<effects.findIndex(effect=>effect.type==='round'));
});
