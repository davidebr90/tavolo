import { shuffle } from './cards.mjs';

// Cards use the regional decks' existing numbering: 0–9 denari, then coppe, bastoni, spade.
const suit=card=>Math.floor(card/10);
const strengths=[10,1,9,2,3,4,5,6,7,8];
const points=[11,0,10,0,0,0,0,2,3,4];

export function startBriscola(options={}) {
  const players=options?.players??2;
  if (![2,4].includes(players)) throw Error('La Briscola richiede 2 o 4 giocatori.');
  const deck=shuffle(Array.from({length:40},(_,i)=>i));
  const hands=Array.from({length:players},()=>[]);
  for (let i=0;i<3;i++) {
    for (const hand of hands) hand.push(deck.shift());
  }
  const trumpCard=deck.shift();
  deck.push(trumpCard);
  return {id:'briscola',turn:0,result:null,hands,deck,trumpCard,trick:[],previousTrick:null,
    scores:[0,0],trickCounts:[0,0],last:null};
}

function winningPlay(trick,trumpCard) {
  const trump=suit(trumpCard), lead=suit(trick[0].card);
  function strength(card) {
    const color=suit(card);
    if (color===trump) return 10+strengths[card%10];
    return color===lead?strengths[card%10]:0;
  }
  return trick.reduce((best,play)=>strength(play.card)>strength(best.card)?play:best);
}

export function playBriscola(state,action,side=state.turn) {
  if (side!==state.turn) throw Error('Aspetta il tuo turno.');
  const card=action?.card;
  if (state.result!==null||!state.hands[side].includes(card)) throw Error('Mossa non valida.');
  const next=structuredClone(state), hand=next.hands[side], count=next.hands.length;
  hand.splice(hand.indexOf(card),1);
  next.trick.push({side,card});
  next.last={type:'play',side,card};
  if (next.trick.length<count) {
    next.turn=(side+1)%count;
    return next;
  }

  const winner=winningPlay(next.trick,next.trumpCard).side;
  const earned=next.trick.reduce((sum,play)=>sum+points[play.card%10],0);
  const number=(next.previousTrick?.number??0)+1;
  next.previousTrick={number,plays:next.trick,winner,points:earned};
  next.trick=[];
  next.scores[winner%2]+=earned;
  next.trickCounts[winner%2]++;
  next.turn=winner;
  if (next.deck.length) {
    for (let offset=0;offset<count;offset++) next.hands[(winner+offset)%count].push(next.deck.shift());
  } else if (!next.hands[winner].length) {
    const [a,b]=next.scores;
    next.result=a===b?'draw':Number(b>a);
  }
  return next;
}

export function viewBriscola(state,side) {
  const {id,turn,result,trick,previousTrick,trumpCard,scores,trickCounts,last}=state;
  const hand=state.hands[side], handCounts=state.hands.map(cards=>cards.length);
  return {id,turn,result,trick,previousTrick,trumpCard,scores,trickCounts,last,hand,handCounts,
    remaining:state.deck.length,playable:side===turn&&result===null?hand:[]};
}
