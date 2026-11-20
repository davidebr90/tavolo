import { shuffle } from './cards.mjs';

export const pokerIds = ['poker-italiano', 'texas-holdem'];

const ranks = '23456789TJQKA';
const suits = 'SCDH'; // Ascending Italian suit precedence.
const minimumBet = 2;
const italian = s => s.id === 'poker-italiano';
const rank = card => ranks.indexOf(card[0]) + 2;
const suit = card => suits.indexOf(card[1]);
const descending = (a,b) => b-a;
const total = amounts => amounts.reduce((a,b) => a+b,0);
const invalid = () => { throw Error('Mossa di poker non valida.'); };
const seats = s => s.stacks.map((_,side) => side);
const live = s => seats(s).filter(side => !s.folded[side]);
const withChips = s => seats(s).filter(side => s.stacks[side] > 0);
const zeros = s => s.stacks.map(() => 0);

function clockwise(s, after, candidates) {
  const count = s.stacks.length;
  for(let step=1;step<=count;step++) {
    const side = (after+step+count)%count;
    if(candidates.includes(side)) return side;
  }
}

function compare(a,b) {
  for(let i=0;i<a.length;i++) if(a[i] !== b[i]) return a[i]-b[i];
  return 0;
}

function five(cards, lowest, isItalian) {
  const values = cards.map(rank).sort(descending);
  const distinct = [...new Set(values)];
  const groups = distinct.map(value => [values.filter(v => v===value).length,value])
    .sort((a,b) => b[0]-a[0] || b[1]-a[1]);
  const flush = cards.every(card => card[1]===cards[0][1]);
  let high = 0;
  if(distinct.length===5) {
    if(values[0]-values[4]===4) high = values[0];
    else if(values[0]===14 && values[1]===lowest+3 && values[4]===lowest) high = values[1];
  }
  const byGroups = groups.map(([,value]) => value);
  let label, score;
  if(flush && high) {
    label = high===14 || isItalian ? 'Scala reale' : 'Scala colore';
    score = [8,high];
  } else if(groups[0][0]===4) {
    label = 'Poker'; score = [7,...byGroups];
  } else if(flush) {
    label = 'Colore';
    score = isItalian ? [6,suit(cards[0]),...values] : [5,...values];
  } else if(groups[0][0]===3 && groups[1][0]===2) {
    label = 'Full'; score = [isItalian ? 5 : 6,...byGroups];
  } else if(high) {
    label = 'Scala'; score = [4,high];
  } else if(groups[0][0]===3) {
    label = 'Tris'; score = [3,...byGroups];
  } else if(groups[1][0]===2) {
    label = 'Doppia coppia'; score = [2,...byGroups];
  } else if(groups[0][0]===2) {
    label = 'Coppia'; score = [1,...byGroups];
  } else {
    label = 'Carta alta'; score = [0,...values];
  }
  if(isItalian) {
    // Equal pairs are decided by the kickers and their suits. In a minimum
    // straight the ace is below the lowest rank in the shortened deck.
    const kickers = cards.filter(c => groups.some(([n,v]) => n===1 && v===rank(c)));
    const order = c => high && high<14 && rank(c)===14 ? 1 : rank(c);
    kickers.sort((a,b) => order(b)-order(a));
    score.push(...kickers.map(suit));
  }
  return {score,label};
}

function bestHand(s, side) {
  const cards = [...s.hands[side],...s.board];
  if(italian(s)) return five(cards,s.lowest,true);
  // At a Hold’em showdown there are seven cards. Exclude every pair once.
  let best;
  for(let i=0;i<6;i++) for(let j=i+1;j<7;j++) {
    const hand = five(cards.filter((_,n) => n!==i && n!==j),2,false);
    if(!best || compare(hand.score,best.score)>0) best = hand;
  }
  return best;
}

function canOpen(s,side) {
  const hand = s.hands[side];
  const [category, value] = five(hand,s.lowest,true).score;
  if(category>1 || (category===1 && value>=s.openingRank)) return true;
  // Four suited consecutive cards can be completed on both ends, including
  // an ace below the lowest rank or above a king.
  return [...suits].some(symbol => {
    const values = hand.filter(c => c[1]===symbol).map(rank);
    return values.some(low => low+3<=13 && [1,2,3].every(n => values.includes(low+n)));
  });
}

function place(s,side,amount) {
  s.stacks[side] -= amount;
  s.bets[side] += amount;
  s.contributions[side] += amount;
}

function resetBetting(s) {
  s.bets = zeros(s);
  s.actedAt = s.stacks.map(() => null);
  s.currentBet = 0;
  s.minRaise = minimumBet;
}

function settle(s) {
  const active = live(s);
  const reveal = active.length>1;
  const evaluated = s.hands.map((_,side) => reveal && !s.folded[side] ? bestHand(s,side) : null);
  const levels = [...new Set(s.contributions.filter(Boolean))].sort((a,b) => a-b);
  const pots = [], refunds = zeros(s), payouts = zeros(s);
  let previous = 0;
  for(const level of levels) {
    const participants = seats(s).filter(side => s.contributions[side]>=level);
    const amount = (level-previous)*participants.length;
    previous = level;
    if(participants.length===1) {
      refunds[participants[0]] += amount;
      continue;
    }
    const eligible = reveal ? participants.filter(side => !s.folded[side]) : active;
    const last = pots.at(-1);
    if(last && last.eligible.length===eligible.length && last.eligible.every((p,i) => p===eligible[i])) last.amount += amount;
    else pots.push({amount,eligible});
  }
  for(const pot of pots) {
    let winners = pot.eligible;
    if(winners.length>1) {
      const best = winners.reduce((a,b) => compare(evaluated[a].score,evaluated[b].score)>=0 ? a : b);
      winners = winners.filter(side => compare(evaluated[side].score,evaluated[best].score)===0);
    }
    const share = Math.floor(pot.amount/winners.length);
    for(const side of winners) payouts[side] += share;
    let after = s.dealer;
    for(let n=0;n<pot.amount%winners.length;n++) {
      after = clockwise(s,after,winners);
      payouts[after]++;
    }
    pot.winners = winners;
    delete pot.eligible;
  }
  for(const side of seats(s)) {
    payouts[side] += refunds[side];
    s.stacks[side] += payouts[side];
  }
  s.showdown = {
    hands:s.hands.map((hand,side) => evaluated[side] ? hand.slice() : null),
    labels:evaluated.map(hand => hand?.label ?? null), payouts, pots, refunds
  };
  s.phase = 'complete';
  const funded = withChips(s);
  s.turn = nextDealer(s,funded);
  if(funded.length===1) s.result = funded[0];
}

function nextDealer(s,funded) {
  if(italian(s) || funded.length===1) return clockwise(s,s.dealer,funded);
  if(funded.length===2) {
    const nextBB = clockwise(s,s.bigBlind,funded);
    return clockwise(s,nextBB,funded);
  }
  // The last live seat before the old big blind has position after the flop,
  // including when the old big blind busts and the next small blind is dead.
  return funded.findLast(side => side<s.bigBlind) ?? funded.at(-1);
}

function newDeal(s, dealer, carry=false) {
  const funded = withChips(s);
  s.round++;
  s.dealer = dealer;
  s.lowest = italian(s) ? 11-funded.length : 2;
  s.deck = shuffle([...suits].flatMap(symbol => [...ranks.slice(s.lowest-2)].map(r => r+symbol)));
  s.hands = s.stacks.map(() => []);
  s.folded = s.stacks.map(n => n===0);
  for(let n=0;n<(italian(s) ? 5 : 2);n++) {
    let side = dealer;
    for(let i=0;i<funded.length;i++) {
      side = clockwise(s,side,funded);
      s.hands[side].push(s.deck.pop());
    }
  }
  s.board = [];
  s.showdown = null;
  s.exchanges = s.stacks.map(() => null);
  if(!carry) s.contributions = zeros(s);
  s.openingRank = carry ? Math.min(s.openingRank+1,13) : 11;
  s.lastAggressor = null;
  resetBetting(s);
  if(italian(s)) {
    s.phase = 'opening';
    for(const side of funded) {
      s.stacks[side]--;
      s.contributions[side]++;
    }
    advance(s,dealer);
  } else {
    s.phase = 'preflop';
    const oldBlind = s.bigBlind;
    const small = funded.length===2 ? dealer : oldBlind ?? clockwise(s,dealer,funded);
    s.bigBlind = clockwise(s,small,funded);
    if(funded.includes(small)) place(s,small,1);
    place(s,s.bigBlind,Math.min(minimumBet,s.stacks[s.bigBlind]));
    s.currentBet = minimumBet;
    advance(s,s.bigBlind);
  }
}

function legalActions(s,side) {
  if(s.result!==null || s.turn!==side) return {};
  if(s.phase==='complete') return {next:true};
  if(s.phase==='draw') return {draw:4};
  const owed = Math.max(0,s.currentBet-s.bets[side]);
  const legal = owed ? {fold:true,call:Math.min(owed,s.stacks[side])} : {check:true};
  const max = s.bets[side]+s.stacks[side];
  const canRaise = s.actedAt[side]===null || s.currentBet-s.actedAt[side]>=s.minRaise;
  if(max>s.currentBet && canRaise && live(s).some(p => p!==side && s.stacks[p]>0)
     && (s.phase!=='opening' || s.currentBet>0 || canOpen(s,side))) {
    legal.maxRaiseTo = max;
    legal.minRaiseTo = Math.min(max,s.currentBet+s.minRaise);
  }
  return legal;
}

function advance(s,after) {
  const active = live(s);
  if(active.length===1) return settle(s);
  const able = active.filter(side => s.stacks[side]>0);
  // A lone stack only acts if someone actually put in more chips this street.
  if(able.length===1) s.currentBet = Math.max(...s.bets);
  const pending = able.filter(side => s.bets[side]<s.currentBet || (able.length>1 && s.actedAt[side]===null));
  if(pending.length) {
    s.turn = clockwise(s,after,pending);
    return;
  }
  if(s.phase==='opening') {
    if(!s.currentBet && able.length===active.length) return newDeal(s,nextDealer(s,able),true);
    s.phase = 'draw';
    resetBetting(s);
    s.turn = clockwise(s,s.dealer,active);
    return;
  }
  if(s.phase==='river' || s.phase==='final') return settle(s);
  const next = {preflop:'flop',flop:'turn',turn:'river'};
  s.phase = next[s.phase];
  s.deck.pop(); // burn before each community street
  for(let i=0;i<(s.phase==='flop' ? 3 : 1);i++) s.board.push(s.deck.pop());
  resetBetting(s);
  advance(s,s.dealer);
}

function exchange(s,cards) {
  const side = s.turn;
  if(!Array.isArray(cards) || cards.length>4 || new Set(cards).size!==cards.length || cards.some(c => !s.hands[side].includes(c))) invalid();
  s.exchanges[side] = cards.slice();
  s.last = {type:'draw',side,count:cards.length};
  const active = live(s), remaining = active.filter(p => s.exchanges[p]===null);
  if(remaining.length) {
    s.turn = clockwise(s,side,remaining);
    return;
  }
  const order = [];
  let seat = s.dealer;
  for(let i=0;i<active.length;i++) {
    seat = clockwise(s,seat,active);
    order.push(seat);
  }
  // Keep discards out of the fresh stock, and never return a player's own
  // discard. The fourth replacement follows everyone else's first three.
  const discards = [];
  const replacement = (owner,card) => {
    let fresh = s.deck.pop();
    if(!fresh) {
      const possible = discards.filter(item => item.owner!==owner);
      const chosen = possible[crypto.getRandomValues(new Uint32Array(1))[0]%possible.length];
      fresh = chosen.card;
      discards.splice(discards.indexOf(chosen),1);
    }
    s.hands[owner][s.hands[owner].indexOf(card)] = fresh;
    discards.push({owner,card});
  };
  for(const owner of order) for(const card of s.exchanges[owner].slice(0,3)) replacement(owner,card);
  for(const owner of order) if(s.exchanges[owner].length===4) replacement(owner,s.exchanges[owner][3]);
  s.phase = 'final';
  const first = s.lastAggressor ?? clockwise(s,s.dealer,active);
  advance(s,(first+s.stacks.length-1)%s.stacks.length);
}

export function startPoker(id,options={}) {
  const count = options?.players ?? 2;
  if(!pokerIds.includes(id) || !Number.isInteger(count) || count<2 || count>(id===pokerIds[0] ? 6 : 10)) invalid();
  const s = {id,stacks:Array(count).fill(100),round:0,result:null,last:null};
  newDeal(s,0);
  return s;
}

export function playPoker(state,action,side=state.turn) {
  const legal = legalActions(state,side);
  if(!action || typeof action!=='object') invalid();
  const s = structuredClone(state);
  if(action.type==='next' && legal.next) {
    s.last = {type:'next',side};
    newDeal(s,side);
    return s;
  }
  if(action.type==='draw' && legal.draw) {
    exchange(s,action.cards);
    return s;
  }
  s.last = {type:action.type,side};
  if(action.type==='fold' && legal.fold) s.folded[side] = true;
  else if(action.type==='call' && legal.call) {
    place(s,side,legal.call);
    s.last.amount = legal.call;
  } else if(action.type==='raise' && legal.minRaiseTo!==undefined) {
    const to = action.to;
    if(!Number.isSafeInteger(to) || to<legal.minRaiseTo || to>legal.maxRaiseTo) invalid();
    s.minRaise = Math.max(s.minRaise,to-s.currentBet);
    s.currentBet = to;
    s.lastAggressor = side;
    place(s,side,to-s.bets[side]);
    s.last.to = to;
  } else if(action.type!=='check' || !legal.check) invalid();
  s.actedAt[side] = s.bets[side];
  advance(s,side);
  return s;
}

export function viewPoker(s,side) {
  const {id,turn,result,last,round,dealer,phase,board,stacks,bets,contributions,folded,showdown,openingRank} = s;
  return {id,turn,result,last,round,dealer,phase,board,stacks,bets,contributions,folded,showdown,openingRank,
    hand:s.hands[side],handCounts:s.hands.map(hand => hand.length),pot:total(contributions),legal:legalActions(s,side)};
}
