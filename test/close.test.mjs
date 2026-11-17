import test from 'node:test';
import assert from 'node:assert/strict';
import {create,join,submit,snapshot,chat} from '../src/room.mjs';

const action=(r,seat,id,fields)=>submit(r,seat,{id,version:r.version,action:fields});
function room() {const r=create('tris','Ada','a');join(r,'Leo','b');return r;}

test('closes immediately when the opponent has not moved, even if the requester moved',()=>{
  const r=room();
  action(r,'a','one',{at:0});
  action(r,'a','close',{close:'request'});
  assert.equal(snapshot(r,'b').closed,true);
  assert.equal(r.game.result,null);
  assert.throws(()=>action(r,'b','later',{at:1}));
  assert.throws(()=>chat(r,'b',{id:'a'.repeat(32),text:'ciao'}));
});
test('an opponent move requires consent; refusal leaves the game playable',()=>{
  const r=room();
  action(r,'a','one',{at:0});
  action(r,'b','two',{at:1});
  action(r,'a','request',{close:'request'});
  assert.equal(snapshot(r,'b').closeRequest,0);
  assert.throws(()=>action(r,'a','self',{close:'accept'}));
  action(r,'b','decline',{close:'decline'});
  assert.equal(snapshot(r,'a').closed,false);
  action(r,'a','three',{at:2});
  action(r,'a','request2',{close:'request'});
  action(r,'b','accept',{close:'accept'});
  assert.equal(snapshot(r,'a').closed,true);
});
test('a waiting room can be closed and cannot be joined afterwards',()=>{
  const r=create('tris','Ada','a');
  action(r,'a','close',{close:'request'});
  assert.throws(()=>join(r,'Leo','b'));
});
