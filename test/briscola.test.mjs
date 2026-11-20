import test from 'node:test';
import assert from 'node:assert/strict';
import { start, play, view } from '../src/games.mjs';

function position(hands, extra={}) {
  return {...start('briscola',{players:hands.length}), hands, deck:[], trumpCard:31, ...extra};
}

for (const players of [2,4]) {
  test(`Briscola with ${players} players accounts for every card and all 120 points`, () => {
    let state=start('briscola',{players});
    const initial=view(state,0);
    assert.deepEqual(initial.handCounts,Array(players).fill(3));
    assert.equal(initial.remaining,40-3*players);
    assert.equal(initial.trumpCard,state.deck.at(-1));
    assert.equal(new Set([...state.hands.flat(),...state.deck]).size,40);
    assert.equal('deck' in initial,false);
    assert.equal('hands' in initial,false);
    assert.deepEqual(view(state,1).playable,[]);
    const played=new Set();
    for (let move=0;move<40;move++) {
      const seatView=view(state,state.turn);
      assert.equal(seatView.result,null);
      assert.deepEqual(seatView.playable,seatView.hand);
      const card=seatView.hand[0];
      assert.ok(!played.has(card));
      played.add(card);
      state=play(state,{card});
    }
    assert.equal(played.size,40);
    assert.equal(state.trickCounts[0]+state.trickCounts[1],40/players);
    assert.equal(state.scores[0]+state.scores[1],120);
    const [a,b]=state.scores;
    assert.equal(state.result,a===b?'draw':a>b?0:1);
    assert.deepEqual(view(state,state.turn).playable,[]);
    assert.throws(()=>play(state,{card:0}));
  });
}

test('Briscola rejects unsupported sizes, cards from another hand and moves out of turn', () => {
  assert.throws(()=>start('briscola',{players:3}));
  const state=position([[0,3],[10,13]]);
  assert.throws(()=>play(state,{card:10},1));
  assert.throws(()=>play(state,{card:10},0));
  assert.throws(()=>play(state,{card:'0'},0));
  const next=play(state,{card:0},0);
  assert.deepEqual(state.trick,[]);
  assert.deepEqual(state.hands[0],[0,3]);
  assert.deepEqual(view(next,1).trick,[{card:0,side:0}]);
  assert.deepEqual(view(next,1).last,{type:'play',side:0,card:0});
});

test('An off-suit ace loses to the lead, and even the lowest trump beats an ace', () => {
  for (const [lead,reply,winner,points] of [[5,10,0,11],[0,31,1,11],[9,2,1,14],[2,0,1,21],[31,36,1,0],[8,7,0,5]]) {
    const state=position([[lead],[reply]]);
    const finished=play(play(state,{card:lead}),{card:reply});
    assert.equal(finished.previousTrick.winner,winner);
    assert.equal(finished.scores[winner],points);
  }
});

test('A player may discard off-suit while holding the lead suit', () => {
  const state=position([[9,6],[8,10]]);
  const response=play(state,{card:9});
  assert.deepEqual(view(response,1).playable,[8,10]);
  const next=play(response,{card:10});
  assert.deepEqual(next.scores,[15,0]);
});

test('A trick goes to the winning team, the winner draws first and the exposed trump is drawn last', () => {
  let state=position([[12],[9],[37],[15]],{trumpCard:31,deck:[11,22,3,31]});
  for (const card of [12,9,37,15]) state=play(state,{card});
  assert.equal(state.turn,2);
  assert.deepEqual(state.scores,[16,0]);
  assert.deepEqual(state.trickCounts,[1,0]);
  assert.deepEqual(state.hands,[[3],[31],[11],[22]]);
  const publicView=view(state,1);
  assert.equal(publicView.remaining,0);
  assert.equal(publicView.trumpCard,31);
  assert.deepEqual(publicView.trick,[]);
  assert.deepEqual(publicView.previousTrick,{
    number:1,winner:2,points:16,
    plays:[{side:0,card:12},{side:1,card:9},{side:2,card:37},{side:3,card:15}]
  });
  assert.deepEqual(view(play(state,{card:11}),1).previousTrick,publicView.previousTrick);
});

test('Briscola finishes a 60–60 tie without awarding a bonus for the last trick', () => {
  const state=position([[4],[35]],{scores:[60,60],trickCounts:[9,10]});
  const end=play(play(state,{card:4}),{card:35});
  assert.deepEqual(end.scores,[60,60]);
  assert.equal(end.result,'draw');
});
