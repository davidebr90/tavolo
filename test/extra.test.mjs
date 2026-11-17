import test from 'node:test';
import assert from 'node:assert/strict';
import {start, play, view, games, fleet} from '../src/games.mjs';
import {create, join, chat, submit, snapshot} from '../src/room.mjs';
import {guides} from '../public/guides.mjs';
import {catalog} from '../public/catalog.mjs';

test('Catalog entries are playable and arranged in multiples of three',()=>{
  assert.equal(games.length,12);
  assert.deepEqual([...games].sort(),Object.keys(catalog).sort());
  assert.deepEqual([...games].sort(),Object.keys(guides).sort());
  for(const sections of Object.values(guides))assert.ok(sections.length>=3);
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
