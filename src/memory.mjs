import { shuffle } from './cards.mjs';

const pairCount=12;
const compareTime=2200;

export function startMemory(options={}) {
  const playerCount=options?.players??2;
  if(![2,3,4].includes(playerCount))throw Error('Memory richiede da 2 a 4 giocatori.');
  const pictures=shuffle(Array.from({length:pairCount*2},(_,at)=>Math.floor(at/2)));
  return {id:'memory',playerCount,pictures,matched:pictures.map(()=>false),open:[],observations:[],
    scores:Array(playerCount).fill(0),turn:0,phase:'first',coverAt:null,last:null,result:null,winners:[]};
}

export function playMemory(state,action,now=Date.now()) {
  const {at}=action, {turn,pictures}=state;
  if(!['first','second'].includes(state.phase)||!Number.isInteger(at)||at<0||at>=pictures.length||
     state.matched[at]||state.open.includes(at))throw Error('Scegli una carta coperta.');
  const open=[...state.open,at];
  // The computer keeps a bounded record of public sightings, in recency order.
  const observations=[...state.observations.filter(card=>card.at!==at),{at,picture:pictures[at]}];
  const next={...state,open,observations,phase:'second',last:{type:'flip',side:turn,at}};
  if(open.length===1)return next;
  if(pictures[open[0]]!==pictures[at]) {
    return {...next,phase:'compare',coverAt:now+compareTime,last:{type:'mismatch',side:turn,at}};
  }
  next.last={type:'match',side:turn,at};
  next.scores=state.scores.slice();
  next.scores[turn]++;
  next.matched=state.matched.slice();
  for(const pos of open)next.matched[pos]=true;
  next.open=[];
  next.observations=observations.filter(card=>!next.matched[card.at]);
  next.phase='first';
  if(next.matched.every(Boolean)) {
    next.phase='complete';
    const highest=Math.max(...next.scores);
    next.winners=next.scores.flatMap((score,side)=>score===highest?[side]:[]);
    next.result=next.winners.length===1?next.winners[0]:'draw';
  }
  return next;
}

export function coverMemory(state,now) {
  if(state.phase!=='compare'||now<state.coverAt)return state;
  return {...state,open:[],phase:'first',coverAt:null,turn:(state.turn+1)%state.playerCount,
    last:{type:'cover',side:state.turn}};
}

export function viewMemory(state) {
  const {id,turn,phase,coverAt,last,result,winners,scores}=state;
  const cards=state.pictures.map((picture,at)=>{
    if(state.matched[at])return {state:'matched',picture};
    if(state.open.includes(at))return {state:'up',picture};
    return {state:'down'};
  });
  return {id,turn,phase,coverAt,last,result,winners,scores,cards};
}
