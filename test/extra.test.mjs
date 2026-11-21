import test from 'node:test';
import assert from 'node:assert/strict';
import {start, play, view, games, fleet} from '../src/games.mjs';
import {create, join, chat, submit, snapshot} from '../src/room.mjs';
import {guides} from '../public/guides.mjs';
import {catalog} from '../public/catalog.mjs';

test('Every game in the catalog has a playable room and a guide',()=>{
  for(const id of ['memory','briscola','poker-italiano','texas-holdem'])assert.ok(games.includes(id),id);
  assert.deepEqual([...games].sort(),Object.keys(catalog).sort());
  assert.deepEqual([...games].sort(),Object.keys(guides).sort());
  for(const sections of Object.values(guides))assert.ok(sections.length>=3);
});

test('New card rooms wait for every seat, keep hands private and resume after a move',()=>{
  for(const [id,players] of [['briscola',4],['poker-italiano',6],['texas-holdem',10]]) {
    const room=create(id,'Posto 1','seat0',{players});
    const before=snapshot(room,'seat0');
    assert.equal(before.maxPlayers,players);
    assert.deepEqual(before.game.hand,[]);
    assert.ok(!Object.keys(before.game.legal??{}).length);
    assert.throws(()=>submit(room,'seat0',{id:'early',version:0,action:{}}),/attende/);
    for(let n=1;n<players;n++)join(room,'Posto '+(n+1),'seat'+n);
    const side=room.game.turn, token='seat'+side, mine=snapshot(room,token).game;
    assert.ok(mine.hand.length);
    const others=snapshot(room,'seat'+((side+1)%players)).game;
    assert.ok(others.hand.every(card=>!mine.hand.includes(card)));
    for(const key of ['stock','deck','hands'])assert.equal(key in others,false);
    const message={id:'action1',version:room.version,action:id==='briscola'?{card:mine.hand[0]}:mine.legal.call?{type:'call'}:{type:'check'}};
    assert.equal(submit(room,token,message),true);
    const restored=JSON.parse(JSON.stringify(room));
    assert.equal(submit(restored,token,message),false);
    assert.deepEqual(snapshot(restored,token),snapshot(room,token));
  }
});

test('An incomplete room exposes the intact pack and no opening cards',()=>{
  for(const [id,total] of [['scopa',40],['uno',108],['briscola',40]]) {
    const room=create(id,'Ada','host',{players:4});
    const {game}=snapshot(room,'host');
    assert.equal(game.remaining,total);
    assert.equal(game.awaitingDeal,true);
    assert.deepEqual(game.hand,[]);
    assert.ok(!game.table?.length&&!game.top&&game.trumpCard==null);
    for(let i=1;i<4;i++)join(room,'Guest '+i,'guest'+i);
    assert.ok(snapshot(room,'host').game.hand.length);
    assert.ok(!snapshot(room,'host').game.awaitingDeal);
  }
});
test('Nim can remove counters from one pile and ends on the last counter',()=>{
  const s={...start('nim'),piles:[0,0,2,0]};
  assert.throws(()=>play(s,{pile:2,count:3}));
  assert.equal(play(s,{pile:2,count:2}).result,0);
});
test('Dots and boxes grants another turn when an edge completes a box',()=>{
  let s=start('dots');
  for(const edge of [0,3,12,13])s=play(s,{edge});
  assert.equal(s.boxes[0],2);
  assert.equal(s.turn,1);
});
test('Go captures a surrounded stone and rejects self capture',()=>{
  let s=start('go');
  for(const action of [{at:1},{at:0},{at:9}])s=play(s,action);
  assert.equal(s.board[0],0);
  assert.ok(!view(s,1).moves.includes(0));
  assert.ok(view(s,1).moves.includes(80));
  assert.deepEqual(view(s,0).moves,[]);
  assert.throws(()=>play(s,{at:0}));
  s=play(play(s,{pass:true}),{pass:true});
  assert.notEqual(s.result,null);
});
test('Backgammon forces bar entry and the higher die when only one fits',()=>{
  const s={...start('backgammon'),turn:0,dice:[1,2],bar:[1,0],off:[14,13],points:Array(24).fill(0)};
  s.points[21]=-2;
  assert.deepEqual(view(s,0).moves,[{from:'bar',to:22,die:2}]);
  assert.throws(()=>play(s,{from:'bar',to:23,die:1}));
  assert.equal(play(s,{from:'bar',to:22,die:2}).bar[0],0);
});
test('Naval presets accept matching fleets and reject invalid sizes',()=>{
  assert.throws(()=>start('naval',{size:9,ships:3}));
  const s=start('naval',{size:8,ships:6});
  const ships=fleet(s.size,s.lengths);
  assert.equal(view(play(s,{ships},0),0).mine.length,6);
  assert.throws(()=>play(s,{ships:ships.slice(0,5)},0));
});
test('Chat is seat-authenticated, deduplicated and independent of move versions',()=>{
  const r=create('tris','Host','host');
  join(r,'Guest','guest');
  const data={id:'a'.repeat(32),text:' Ciao '};
  assert.throws(()=>chat(r,'third',data));
  assert.equal(chat(r,'host',data),true);
  assert.equal(chat(r,'host',data),false);
  submit(r,'host',{id:'m1',version:1,action:{at:0}});
  const s=snapshot(r,'guest');
  assert.equal(s.chat[0].text,'Ciao');
  assert.equal(s.chatVersion,1);
  assert.equal(s.version,2);
});
