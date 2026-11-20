import test from 'node:test';
import assert from 'node:assert/strict';
import { startPoker, playPoker, viewPoker } from '../src/poker.mjs';

const holdem = 'texas-holdem', italian = 'poker-italiano';
const cards = text => text.split(' ');
const move = (state, type, fields = {}) => playPoker(state, {type, ...fields});
const legal = state => viewPoker(state, state.turn).legal;

test('deals private cards, sets blinds and protects turn and bet amounts', () => {
  for (const [id, count, size] of [[italian, 6, 5], [holdem, 10, 2]]) {
    const state = startPoker(id, {players:count});
    const mine = viewPoker(state, 0);
    const dealt = [...state.hands.flat(), ...state.deck];
    assert.equal(new Set(dealt).size, id === italian ? 40 : 52);
    assert.equal(mine.hand.length, size);
    assert.equal(mine.handCounts.length, count);
    assert.ok(!JSON.stringify(mine).includes('"'+state.hands[1][0]+'"'));
    assert.ok(!JSON.stringify(mine).includes('"'+state.deck[0]+'"'));
    assert.throws(() => startPoker(id, {players:count+1}));
  }
  const s = startPoker(holdem);
  assert.deepEqual(s.bets, [1,2]);
  assert.equal(s.turn, 0);
  assert.equal(legal(s).call, 1);
  assert.equal(legal(s).minRaiseTo, 4);
  assert.deepEqual(viewPoker(s, 1).legal, {});
  assert.throws(() => playPoker(s, {type:'call'}, 1));
  for (const amount of [3, 101, NaN, Infinity, 4.1, '8']) assert.throws(() => move(s,'raise',{to:amount}));
  assert.throws(() => move(s,'check'));
  assert.equal(move(s,'raise',{to:8}).currentBet, 8);
  assert.deepEqual(s.bets,[1,2]);
});

test('heads-up big blind has an option and acts first after each board reveal', () => {
  let s = move(startPoker(holdem),'call');
  assert.equal(s.phase,'preflop');
  assert.equal(s.turn,1);
  for (const [phase,length] of [['flop',3],['turn',4],['river',5]]) {
    s = move(s,'check');
    assert.equal(s.phase,phase);
    assert.equal(s.board.length,length);
    assert.equal(s.turn,1);
    s = move(s,'check');
  }
  s = move(s,'check');
  assert.equal(s.phase,'complete');
  assert.equal(s.showdown.payouts.reduce((n,a)=>n+a),4);
  assert.deepEqual(s.showdown.hands,s.hands);
  const next = move(s,'next');
  assert.equal(next.round,2);
  assert.equal(next.dealer,1);
  assert.deepEqual(next.bets,[2,1]);
});

test('fold wins keep private hands hidden and count the returned excess', () => {
  const s = move(startPoker(holdem),'fold');
  assert.deepEqual(s.stacks,[99,101]);
  assert.deepEqual(s.showdown.hands,[null,null]);
  assert.deepEqual(s.showdown.labels,[null,null]);
});

test('partial and cumulative all-ins only reopen action when a full raise is faced', () => {
  const initial = startPoker(holdem,{players:5});
  initial.stacks = [100,12,198,100,99];
  // Seats 3,4,0 have acted for 10, seats 1 and 2 have not.
  let s = move(initial,'raise',{to:10});
  s = move(move(s,'call'),'call');
  s = move(s,'raise',{to:13});
  s = move(s,'call');
  assert.equal(s.turn,3);
  assert.equal(legal(s).minRaiseTo,undefined);
  assert.throws(() => move(s,'raise',{to:19}));
  // A second short all-in accumulating to a full raise reopens all three.
  let other = move(initial,'raise',{to:10});
  other = move(move(other,'call'),'call');
  other = move(other,'raise',{to:13});
  other.stacks[2] = 17;
  other = move(other,'raise',{to:19});
  assert.equal(legal(other).minRaiseTo,27);
});

test('all-in runs out the board and separates a main pot from a side pot and refund', () => {
  let s = startPoker(holdem,{players:3});
  s.stacks = [50,29,18]; // effective starting stacks 50,30,20
  s.hands = [cards('2H 3D'),cards('4H 4D'),cards('AS AH')];
  // Each street burns one card. The engine draws from the end of the stock.
  s.deck = cards('JC 3C 8H 5S QD 9D 7C 6S').reverse();
  s = move(s,'raise',{to:50});
  s = move(move(s,'call'),'call');
  assert.equal(s.phase,'complete');
  assert.equal(s.board.length,5);
  assert.deepEqual(s.showdown.pots.map(p=>p.amount),[60,20]);
  assert.deepEqual(s.showdown.refunds,[20,0,0]);
  assert.deepEqual(s.stacks,[20,20,60]);
});

test('hold’em board plays for all eligible seats and odd chip goes left of dealer', () => {
  let s = startPoker(holdem,{players:3});
  s = move(s,'raise',{to:4});
  s = move(s,'fold');
  s = move(s,'call');
  // The small blind’s dead chip makes a nine-chip pot. Both remaining hands play the board.
  s.board = cards('AS KS QS');
  s.deck = cards('2C JS 3C TS').reverse();
  for(let i=0;i<6;i++) s = move(s,'check');
  assert.deepEqual(s.showdown.payouts,[4,0,5]);
  assert.equal(s.showdown.hands[1],null);
});

test('Italian opening is restricted and a passed-out deal carries the ante', () => {
  let s = startPoker(italian,{players:4});
  assert.equal(s.turn,1);
  s.hands[1] = cards('7H 7D 8S JC AH');
  assert.equal(legal(s).minRaiseTo,undefined);
  assert.throws(() => move(s,'raise',{to:2}));
  s.hands[1] = cards('JH JD 8S QC AH');
  assert.equal(legal(s).minRaiseTo,2);
  for(let i=0;i<4;i++) s = move(s,'check');
  assert.equal(s.round,2);
  assert.equal(s.openingRank,12);
  assert.equal(viewPoker(s,0).pot,8);
});

test('Italian exchanges up to four distinct owned cards and keeps discards private', () => {
  let s = startPoker(italian,{players:6});
  // Swap a real qualifying pair into the opener’s hand, conserving the deck.
  const locations = [...s.hands,s.deck];
  for(const [slot,card] of ['JH','JD'].entries()){
    const source = locations.find(hand=>hand.includes(card));
    const index = source.indexOf(card);
    [s.hands[1][slot],source[index]]=[card,s.hands[1][slot]];
  }
  s = move(s,'raise',{to:2});
  for(let i=0;i<5;i++) s = move(s,'call');
  assert.equal(s.phase,'draw');
  const prior = structuredClone(s.hands);
  assert.throws(()=>move(s,'draw',{cards:prior[s.turn]}));
  assert.throws(()=>move(s,'draw',{cards:[prior[s.turn][0],prior[s.turn][0]]}));
  assert.throws(()=>move(s,'draw',{cards:[prior[(s.turn+1)%6][0]]}));
  for(let i=0;i<6;i++){
    const side = s.turn, exchanged = prior[side].slice(0,4);
    s = move(s,'draw',{cards:exchanged});
    assert.equal(s.last.count,4);
    assert.ok(!('cards' in s.last));
  }
  assert.equal(s.phase,'final');
  assert.equal(s.turn,1);
  for(let i=0;i<6;i++){
    assert.ok(s.hands[i].includes(prior[i][4]));
    assert.ok(!prior[i].slice(0,4).some(c=>s.hands[i].includes(c)));
  }
  assert.equal(new Set(s.hands.flat()).size,30);
  // Controlled final hands verify flush > full and precedence between flush suits.
  s.hands = ['AS QS TS 8S 6S','KH JH TH 8H 5H','AC AD AH QC QH','JC JD 7C 7D 6H','5D 6D 8C 9H KC','5C 6C 7H 9D KS'].map(cards);
  for(let i=0;i<6;i++) s = move(s,'check');
  assert.deepEqual(s.showdown.payouts,[0,18,0,0,0,0]);
  assert.equal(s.showdown.labels[1],'Colore');
});

test('hold’em evaluates the best five, including kickers, low aces and the board', () => {
  const cases = [
    ['8D QS','KS JS','AS AH 8S 8H 2S',[200,0],['Full','Colore']],
    ['5S KD','6H 7C','AS 2D 3H 4C 9H',[200,0],['Scala','Carta alta']],
    ['KD JC','KH QS','AC AD 8S 3H 2S',[0,200],['Coppia','Coppia']],
    ['KH 2C','2S 3C','AS AD AH KC KS',[100,100],['Full','Full']],
    ['AS 3D','KS 7C','QS JS TS 9S 2H',[0,200],['Colore','Scala colore']]
  ];
  for(const [a,b,community,payouts,labels] of cases) {
    let s = startPoker(holdem);
    s.hands = [cards(a),cards(b)];
    const [flop1,flop2,flop3,turn,river] = cards(community);
    const burned = s.deck.concat(...s.hands).filter(c => ![...s.hands.flat(),...cards(community)].includes(c));
    s.deck = [burned[0],flop1,flop2,flop3,burned[1],turn,burned[2],river].reverse();
    s = move(move(s,'raise',{to:100}),'call');
    assert.deepEqual(s.showdown.labels,labels);
    assert.deepEqual(s.showdown.payouts,payouts);
    assert.equal(s.result,payouts.includes(200) ? payouts.indexOf(200) : null);
    if(s.result!==null) assert.throws(()=>move(s,'next'));
  }
});

test('Italian all-in seats keep the right to exchange and a short ante cannot deadlock the game', () => {
  let s = startPoker(italian);
  s.stacks = [1,197]; // plus the two antes already posted
  s = move(move(s,'check'),'check');
  assert.equal(s.round,2);
  assert.equal(s.phase,'draw');
  assert.deepEqual(s.stacks,[0,196]);
  assert.equal(legal(s).draw,4);
  s = move(move(s,'draw',{cards:[]}),'draw',{cards:[]});
  assert.equal(s.phase,'complete');
  assert.equal(s.stacks[0]+s.stacks[1],200);
});

test('eliminating the big blind leaves a dead small blind and charges the next seat correctly', () => {
  let s = startPoker(holdem,{players:4});
  s.hands[0] = cards('AS AH');
  s.hands[2] = cards('4H 4D');
  s.deck = cards('JC 3C 8H 5S QD 9D 7C 6S').reverse();
  assert.equal(s.turn,3);
  s = move(s,'fold');
  s = move(s,'raise',{to:100});
  s = move(s,'fold');
  s = move(s,'call');
  assert.equal(s.stacks[2],0);
  s = move(s,'next');
  assert.deepEqual(s.bets,[0,0,0,2]);
  assert.deepEqual(s.hands[2],[]);
  assert.equal(s.turn,0);
});
