import test from 'node:test';
import assert from 'node:assert/strict';
import {start,play,view} from '../src/games.mjs';
import {chessNotation} from '../src/chess.mjs';
import {unreadChat,lastChessMove} from '../public/rooms.mjs';

test('Chess records numbered SAN through checkmate in both seat views',()=>{
  let s=start('chess');
  for(const [from,to] of [[53,45],[12,28],[54,38],[3,39]])s=play(s,{from,to});
  assert.deepEqual(view(s,0).history,[{ply:1,san:'f3'},{ply:2,san:'e5'},{ply:3,san:'g4'},{ply:4,san:'Qh4#'}]);
  assert.deepEqual(view(s,0).history,view(s,1).history);
});
test('SAN distinguishes two legal pieces and shows promotion and castling',()=>{
  const s={board:Array(64).fill('')};
  s.board[57]=s.board[61]='N';
  const fromB={from:57,to:51}, fromF={from:61,to:51};
  assert.equal(chessNotation(s,fromB,[fromB,fromF],false,false),'Nbd2');
  s.board[8]='P';
  assert.equal(chessNotation(s,{from:8,to:0,promote:'q'},[],true,false),'a8=Q+');
  assert.equal(chessNotation(s,{castle:-1},[],false,false),'O-O-O');
});
test('Unread chat excludes your own messages and works after old messages have expired',()=>{
  const state={side:0,chatVersion:54,chat:[{side:1},{side:0},{side:1}]};
  assert.deepEqual(unreadChat(state,52).map(m=>m.sequence),[54]);
  assert.deepEqual(unreadChat(state,54),[]);
});
test('The last move remains visible for legacy snapshots without a history',()=>{
  assert.equal(lastChessMove({last:{from:52,to:36}}),'e2 → e4');
  assert.equal(lastChessMove({last:{from:60,to:62,castle:1}}),'O-O');
  assert.equal(lastChessMove({last:null}),null);
});
