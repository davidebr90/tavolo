import test from 'node:test';
import assert from 'node:assert/strict';
import {create,join,submit,snapshot} from '../src/room.mjs';
import {fleet} from '../src/games.mjs';
import {moveEffects,seatHasTurn,kingSquare} from '../public/effects.mjs';

const A='a'.repeat(32), B='b'.repeat(32);
let counter=0;
function table(game,options) {
  const room=create(game,'Ada',A,options);
  join(room,'Bruno',B);
  return room;
}
function move(room,token,action,viewer=token) {
  const before=snapshot(room,viewer);
  assert.equal(submit(room,token,{id:'m'+(++counter),version:room.version,action}),true);
  return [before,snapshot(room,viewer)];
}
const types=list=>list.map(effect=>effect.type);

test('Joining the last seat starts the match and hands the first turn to the host',()=>{
  const room=create('tris','Ada',A);
  const before=snapshot(room,A);
  join(room,'Bruno',B);
  const fx=moveEffects(before,snapshot(room,A));
  assert.deepEqual(types(fx),['start','your-turn']);
  assert.equal(seatHasTurn(snapshot(room,A),0),true);
});

test('A chess capture slides the piece, removes the victim and flags the check',()=>{
  const room=table('chess');
  for(const [token,from,to] of [[A,52,36],[B,13,29]])move(room,token,{from,to});
  const [q0,q1]=move(room,A,{from:59,to:31},B);
  assert.deepEqual(types(moveEffects(q0,q1)),['slide','check','your-turn']);
  const [before,after]=move(room,B,{from:14,to:22},A);
  assert.deepEqual(types(moveEffects(before,after)),['slide','your-turn']);
  const fx=moveEffects(...move(room,A,{from:31,to:22}));
  assert.deepEqual(fx,[
    {type:'slide',from:31,to:22},
    {type:'capture',at:22,piece:'p'},
    {type:'check',at:4}
  ]);
});

test('Castling slides both the king and the rook',()=>{
  const room=table('chess');
  for(const [token,from,to] of [[A,54,46],[B,8,16],[A,61,54],[B,9,17],[A,62,45],[B,10,18]])move(room,token,{from,to});
  const [before,after]=move(room,A,{from:60,to:62,castle:1});
  const slides=moveEffects(before,after).filter(e=>e.type==='slide');
  assert.deepEqual(slides,[{type:'slide',from:60,to:62},{type:'slide',from:63,to:61}]);
});

test('Checkmate reports defeat to the mated player and victory to the winner',()=>{
  const room=table('chess');
  for(const [token,from,to] of [[A,53,45],[B,12,28],[A,54,38]])move(room,token,{from,to});
  const beforeA=snapshot(room,A), beforeB=snapshot(room,B);
  submit(room,B,{id:'mate',version:room.version,action:{from:3,to:39}});
  const forA=moveEffects(beforeA,snapshot(room,A)), forB=moveEffects(beforeB,snapshot(room,B));
  assert.deepEqual(types(forA),['slide','result']);
  assert.equal(forA.at(-1).outcome,'loss');
  assert.equal(forB.at(-1).outcome,'win');
  assert.equal(kingSquare(snapshot(room,A).game.board,0),60);
});

test('Reversi reports the placed disc and every flipped disc',()=>{
  const room=table('reversi');
  const [before,after]=move(room,A,{at:19});
  const fx=moveEffects(before,after);
  assert.deepEqual(fx.slice(0,2),[{type:'place',at:19},{type:'flip',origin:19,cells:[27]}]);
});

test('Forza 4 drops into the landing row and draws the winning line for the winner',()=>{
  const room=table('four');
  let pair;
  for(const [token,at] of [[A,0],[B,1],[A,0],[B,1],[A,0],[B,1]])pair=move(room,token,{at});
  assert.deepEqual(moveEffects(...pair)[0],{type:'drop',at:22,row:3});
  const [before,after]=move(room,A,{at:0});
  const fx=moveEffects(before,after);
  assert.deepEqual(fx[0],{type:'drop',at:14,row:2});
  assert.deepEqual(fx[1].type,'line');
  assert.deepEqual(fx[1].cells.slice().sort((a,b)=>a-b),[14,21,28,35]);
  assert.deepEqual(fx.at(-1),{type:'result',outcome:'win'});
});

test('Nim and dots describe what left the board and which boxes closed',()=>{
  const nim=table('nim');
  const [n0,n1]=move(nim,A,{pile:2,count:3});
  assert.deepEqual(moveEffects(n0,n1)[0],{type:'remove',pile:2,count:3,from:n0.game.piles[2]});
  const dots=table('dots');
  let last;
  for(const [token,edge] of [[A,0],[B,12],[A,3]])last=move(dots,token,{edge});
  const [d0,d1]=move(dots,B,{edge:13});
  const fx=moveEffects(d0,d1);
  assert.deepEqual(fx.slice(0,2),[{type:'edge',edge:13},{type:'boxes',cells:[0],owner:2}]);
  assert.ok(last);
});

test('Battaglia navale reports the start of the battle and each strike on the right grid',()=>{
  const room=table('naval');
  move(room,A,{ships:fleet()});
  const [b0,b1]=move(room,B,{ships:fleet()});
  assert.deepEqual(types(moveEffects(b0,b1)),['battle']);
  const before=snapshot(room,B);
  submit(room,A,{id:'shot-'+(++counter),version:room.version,action:{at:0}});
  const fx=moveEffects(before,snapshot(room,B));
  assert.equal(fx[0].type,'strike');
  assert.equal(fx[0].grid,'own');
  assert.equal(fx[0].at,0);
  assert.equal(fx.at(-1).type,'your-turn');
});

test('Older or identical snapshots never replay effects',()=>{
  const room=table('tris');
  const [before,after]=move(room,A,{at:4});
  assert.deepEqual(moveEffects(after,before),[]);
  assert.deepEqual(moveEffects(after,after),[]);
  assert.deepEqual(moveEffects(null,after),[]);
});
