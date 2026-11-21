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
const square=coord=>(8-Number(coord[1]))*8+'abcdefgh'.indexOf(coord[0]);
const move=(game,from,to,promote)=>play(game,{from:square(from),to:square(to),...(promote?{promote}:{})});

test('Chess records the captured piece and its colour, including en passant and promotion captures',()=>{
  let g=start('chess');
  for(const [from,to] of [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5'],['e5','d6'],['c7','d6']])g=move(g,from,to);
  assert.deepEqual(view(g,0).history.slice(-2),[{ply:5,san:'exd6',captured:'p'},{ply:6,san:'cxd6',captured:'P'}]);
  const promotion={...start('chess'),board:Array(64).fill(''),rights:0};
  for(const [position,piece] of [['h1','K'],['a7','P'],['b8','r'],['g8','k']])promotion.board[square(position)]=piece;
  const promoted=move(promotion,'a7','b8','n');
  assert.deepEqual(view(promoted,1).history,[{ply:1,san:'axb8=N',captured:'r'}]);
});

test('Legacy SAN restores capture icons for both colours and skips histories that do not describe the current board',()=>{
  let g=start('chess');
  for(const [from,to] of [['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6'],['f1','b5'],['a7','a6'],['b5','c6'],['d7','c6']])g=move(g,from,to);
  const legacy={...g,history:g.history.map(({ply,san})=>({ply,san}))};
  assert.deepEqual(view(legacy,0).history.slice(-2),[{ply:7,san:'Bxc6',captured:'n'},{ply:8,san:'dxc6',captured:'B'}]);
  assert.deepEqual(view(legacy,1).history,view(legacy,0).history);
  const resumed=move(legacy,'d2','d3');
  assert.equal(resumed.history[6].captured,'n');
  assert.equal(legacy.history[6].captured,undefined);
  const partial={...legacy,history:legacy.history.slice(3)};
  assert.deepEqual(view(partial,1).history,partial.history);
  const incorrect={...legacy,board:start('chess').board};
  assert.deepEqual(view(incorrect,1).history,legacy.history);
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
