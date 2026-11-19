import test from 'node:test';
import assert from 'node:assert/strict';
import {start, play, view} from '../src/games.mjs';

test('Scopa prioritizes a matching card over a sum and hides the opponent hand', () => {
  const s=start('scopa');
  s.hands=[[6],[15]];
  s.table=[16,2,3];
  assert.deepEqual(view(s,0).takes[6],[[16]]);
  assert.throws(()=>play(s,{card:6,take:[2,3]}));
  assert.deepEqual(play(s,{card:6,take:[16]}).table,[2,3]);
  assert.equal(view(s,0).opponentCount,1);
  assert.equal('hands' in view(s,0),false);
});
test('UNO validates +4, hides hands, and applies the two-player reverse', () => {
  const s=start('uno');
  s.hands=[['R:reverse:0','R:5:0','W:four:0'],['B:2:0']];
  s.color='R';s.discard=['R:8:0'];
  assert.throws(()=>play(s,{card:'W:four:0',color:'B'}));
  const next=play(s,{card:'R:reverse:0'});
  assert.equal(next.turn,0);
  assert.equal('hands' in view(next,0),false);
  assert.equal('deck' in view(next,0),false);
});
test('UNO shows the direction of play after a reverse with three players', () => {
  const s=start('uno',{players:3});
  s.hands[0]=['R:reverse:0','B:2:0'];
  s.color='R';s.discard=['R:8:0'];
  assert.equal(view(s,1).direction,1);
  const next=play(s,{card:'R:reverse:0'});
  assert.equal(next.turn,2);
  for(const seat of [0,1,2])assert.equal(view(next,seat).direction,-1);
});
