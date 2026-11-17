import test from 'node:test';
import assert from 'node:assert/strict';
import { start, play, view, available, fleet } from '../src/games.mjs';
import { create, join, submit, snapshot } from '../src/room.mjs';

test('Tris finds a diagonal win', () => {
  let s = start('tris');
  for (const at of [0, 1, 4, 2, 8]) s = play(s, { at });
  assert.equal(s.result, 0);
});
test('Forza 4 applies gravity and detects a vertical win', () => {
  let s = start('four');
  for (const at of [0, 1, 0, 1, 0, 1, 0]) s = play(s, { at });
  assert.equal(s.board[35], 1);
  assert.equal(s.result, 0);
});
test('Reversi flips the enclosed disc', () => {
  const s = play(start('reversi'), { at: 19 });
  assert.equal(s.board[27], 1);
  assert.equal(s.turn, 1);
});
test('Dama requires the complete longest capture', () => {
  const s = start('dama');
  s.board.fill(0);
  for (const [i, v] of [[48,1],[41,2],[27,2],[29,2]]) s.board[i] = v;
  assert.deepEqual(available(s).map(m => m.path), [[48,34,20]]);
  const next=play(s, { path: [48,34,20] });
  assert.equal(next.board[20], 1);
  for(const side of [0,1])assert.deepEqual(view(next,side).history,[{ply:1,san:'a2×c4×e6'}]);
});
test('Battaglia navale conceals the opposing fleet', () => {
  const s = play(start('naval'), { ships: fleet() }, 0);
  assert.equal(view(s, 1).mine, null);
  assert.equal(Object.hasOwn(view(s, 1), 'fleets'), false);
});
test('Scacchi validates checkmate', () => {
  let s = start('chess');
  for (const [from,to] of [[53,45],[12,28],[54,38],[3,39]]) s = play(s, { from, to });
  assert.equal(s.result, 1);
});
test('Scacchi generates 400 starting replies and supports en passant', () => {
  const s=start('chess');
  assert.equal(available(s).length,20);
  assert.equal(available(s).reduce((n,m)=>n+available(play(s,m)).length,0),400);
  let next=s;
  for(const [from,to] of [[52,36],[8,16],[36,28],[11,27],[28,19]]) next=play(next,{from,to});
  assert.equal(next.board[19],'P');
  assert.equal(next.board[27],'');
});
test('Scacchi supports castling and claims a current threefold repetition', () => {
  let s=start('chess');
  for(const [from,to] of [[52,36],[8,16],[62,45],[16,24],[61,52],[9,17],[60,62]]) s=play(s,{from,to});
  assert.deepEqual(s.board.slice(60,64),['','R','K','']);
  s=start('chess');
  for(let i=0;i<2;i++) for(const [from,to] of [[62,45],[6,21],[45,62],[21,6]]) s=play(s,{from,to});
  assert.equal(view(s,0).canDraw,true);
  assert.equal(play(s,{draw:true}).result,'draw');
  assert.equal(view(play(s,{from:52,to:36}),1).canDraw,false);
});
test('Battaglia navale gives one shot per turn and rejects repeated coordinates', () => {
  const ships=[5,4,3,3,2].map((_,i)=>({at:10*i,vertical:false}));
  let s=play(start('naval'),{ships},0);
  s=play(s,{ships},1);
  s=play(s,{at:0},0);
  assert.equal(s.turn,1);
  assert.deepEqual(view(s,0).outgoing,[{at:0,hit:true}]);
  s=play(s,{at:99},1);
  assert.throws(()=>play(s,{at:0},0));
});
test('Room deduplicates retries, rejects stale moves and authenticates players', () => {
  const r = create('tris', 'Ada', 'host');
  join(r, 'Leo', 'guest');
  submit(r, 'host', { id: 'move1', version: 1, action: { at: 0 } });
  assert.equal(submit(r, 'host', { id: 'move1', version: 1, action: { at: 0 } }), false);
  assert.throws(() => submit(r, 'guest', { id: 'move2', version: 1, action: { at: 4 } }));
  assert.throws(() => snapshot(r, 'unknown'));
  assert.equal(snapshot(r, 'guest').game.board[0], 1);
});
