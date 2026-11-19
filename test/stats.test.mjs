import test from 'node:test';
import assert from 'node:assert/strict';
import {start,play,view} from '../src/games.mjs';
import {create,join,submit,snapshot} from '../src/room.mjs';
import {chessMaterial,discCount,damaCount,pipCount,shipsAfloat,dotsBonus,seatStat,turnNotes} from '../public/stats.mjs';

const A='a'.repeat(32), B='b'.repeat(32);
let id=0;
const move=(room,token,action)=>submit(room,token,{id:'s'+(++id),version:room.version,action});

test('Chess material lists captured pieces and the balance',()=>{
  let s=start('chess');
  for(const [from,to] of [[52,36],[11,27],[36,27]])s=play(s,{from,to});
  const {captured,balance}=chessMaterial(s.board);
  assert.deepEqual(captured,[['p'],[]]);
  assert.equal(balance,1);
  const room=create('chess','Ada',A);join(room,'Bruno',B);
  for(const [token,from,to] of [[A,52,36],[B,11,27],[A,36,27]])move(room,token,{from,to});
  assert.equal(seatStat(snapshot(room,A),0),'+1 materiale');
  assert.equal(seatStat(snapshot(room,A),1),'');
});

test('Disc, piece and pip counts follow the engines',()=>{
  assert.deepEqual(discCount(play(start('reversi'),{at:19}).board),[4,1]);
  assert.deepEqual(damaCount(start('dama').board),[{men:12,kings:0},{men:12,kings:0}]);
  const bg=start('backgammon');
  assert.deepEqual(pipCount(bg.points,bg.bar),[167,167]);
  assert.deepEqual(pipCount(bg.points,[1,0]),[192,167]);
});

test('Ships afloat drop once per sunk ship',()=>{
  assert.equal(shipsAfloat([5,4,3,2,1],[{at:0,hit:true},{at:1,hit:true,sunk:[0,1]},{at:9,hit:false}]),4);
  assert.equal(shipsAfloat([5,4],[]),2);
});

test('Dots grants a bonus note only after closing a box',()=>{
  let s=start('dots');
  for(const edge of [0,3,12])s=play(s,{edge});
  assert.equal(dotsBonus(s),false);
  s=play(s,{edge:13});
  assert.equal(dotsBonus(s),true);
  const room=create('dots','Ada',A);join(room,'Bruno',B);
  for(const [token,edge] of [[A,0],[B,3],[A,12],[B,13]])move(room,token,{edge});
  assert.deepEqual(turnNotes(snapshot(room,A),false),['Bruno ha chiuso un quadrato: gioca ancora.']);
  assert.deepEqual(turnNotes(snapshot(room,B),true),['Hai chiuso un quadrato: giochi ancora.']);
});

test('Dama announces a mandatory capture to the player who must take',()=>{
  const s=start('dama');
  s.board.fill(0);
  for(const [i,v] of [[48,1],[41,2],[27,2],[29,2],[63,1]])s.board[i]=v;
  const room={side:0,players:['Ada','Bruno'],game:view(s,0)};
  const [note]=turnNotes(room,true);
  assert.match(note,/Presa obbligatoria: devi catturare 2 pezzi/);
  assert.deepEqual(turnNotes(room,false),[]);
});
