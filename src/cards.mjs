function shuffle(cards) {
  const random=new Uint32Array(cards.length);
  crypto.getRandomValues(random);
  for(let i=cards.length-1;i>0;i--) {
    const j=random[i]%(i+1);
    [cards[i],cards[j]]=[cards[j],cards[i]];
  }
  return cards;
}
const numbers=n=>Array.from({length:n},(_,i)=>i);
const rank=card=>card%10+1;
const suit=card=>Math.floor(card/10);
const invalid=()=>{throw Error('Mossa non valida.');};
function scopaDeal(s,first) {
  const deck=shuffle(numbers(40));
  if(s.playerCount===4)return {...s,first,turn:first,table:[],hands:numbers(4).map(()=>deck.splice(0,10)),deck,captured:[[],[]],sweeps:[0,0],lastCapture:null};
  const table=deck.splice(0,4);
  while(table.filter(c=>rank(c)===10).length>=3) {
    deck.push(...table.splice(0));
    shuffle(deck);
    table.push(...deck.splice(0,4));
  }
  return {...s,first,turn:first,table,deck,hands:[deck.splice(0,3),deck.splice(0,3)],captured:[[],[]],sweeps:[0,0],lastCapture:null};
}
function takes(table,card) {
  const target=rank(card), exact=table.filter(c=>rank(c)===target);
  if(exact.length) return exact.map(c=>[c]);
  const options=[];
  function search(index,left,path) {
    if(!left){options.push(path);return;}
    for(let i=index;i<table.length;i++) if(rank(table[i])<=left) search(i+1,left-rank(table[i]),[...path,table[i]]);
  }
  search(0,target,[]);
  return options.length?options:[[]];
}
function scoreScopa(s) {
  const rankPoints=[0,16,12,13,14,15,18,21,10,10,10];
  const points=s.sweeps.slice();
  const award=([a,b])=>{if(a!==b) points[Number(b>a)]++;};
  award(s.captured.map(cards=>cards.length));
  award(s.captured.map(cards=>cards.filter(c=>suit(c)===0).length));
  const sette=s.captured.findIndex(cards=>cards.includes(6));
  if(sette>=0) points[sette]++;
  award(s.captured.map(cards=>{
    const best=[0,0,0,0];
    for(const c of cards) best[suit(c)]=Math.max(best[suit(c)],rankPoints[rank(c)]);
    return best.every(Boolean)?best.reduce((a,b)=>a+b,0):0;
  }));
  return points;
}
function scopaPlay(state,action) {
  const {card,take}=action,{turn}=state;
  if(!state.hands[turn].includes(card)||!Array.isArray(take)) invalid();
  if(!takes(state.table,card).some(t=>t.length===take.length&&t.every(c=>take.includes(c)))) invalid();
  const s=structuredClone(state), hand=s.hands[turn];
  hand.splice(hand.indexOf(card),1);
  const final=!s.deck.length&&s.hands.every(h=>!h.length);
  if(take.length) {
    s.table=s.table.filter(c=>!take.includes(c));
    s.captured[turn%2].push(card,...take);
    s.lastCapture=turn%2;
    if(!final&&!s.table.length) s.sweeps[turn%2]++;
  } else s.table.push(card);
  s.last={card,side:turn,take:[...take]};
  s.turn=(turn+1)%s.hands.length;
  if(s.hands.every(h=>!h.length)&&s.deck.length) s.hands=[s.deck.splice(0,3),s.deck.splice(0,3)];
  if(!final) return s;
  if(s.lastCapture!==null) s.captured[s.lastCapture].push(...s.table.splice(0));
  s.points=scoreScopa(s);
  s.scores=s.scores.map((n,i)=>n+s.points[i]);
  if(Math.max(...s.scores)>=11&&s.scores[0]!==s.scores[1]) {
    s.result=Number(s.scores[1]>s.scores[0]);
    return s;
  }
  return scopaDeal({...s,round:s.round+1},(s.first+1)%s.hands.length);
}
export const colors=['R','B','G','Y'];
const fields=card=>card.split(':');
function unoStart(count) {
  const deck=shuffle([
    ...colors.flatMap(c=>[c+':0:0',...['1','2','3','4','5','6','7','8','9','skip','reverse','two'].flatMap(v=>[c+':'+v+':0',c+':'+v+':1'])]),
    ...numbers(4).flatMap(i=>['W:wild:'+i,'W:four:'+i])
  ]);
  const hands=numbers(count).map(()=>deck.splice(0,7));
  const [top]=deck.splice(deck.findIndex(c=>/^.[\u003a]\d:/.test(c)),1);
  shuffle(deck);
  return {id:'uno',turn:0,result:null,hands,deck,discard:[top],color:fields(top)[0],drawn:null,last:null};
}
function unoLegal(s,card) {
  const [color,value]=fields(card), top=fields(s.discard.at(-1))[1];
  if(s.drawn!==null&&card!==s.drawn) return false;
  if(value==='four') return !s.hands[s.turn].some(c=>fields(c)[0]===s.color);
  return color==='W'||color===s.color||value===top;
}
function unoDraw(s,side,count) {
  let card=null;
  for(let i=0;i<count;i++) {
    if(!s.deck.length&&s.discard.length>1) s.deck=shuffle(s.discard.splice(0,s.discard.length-1));
    if(!s.deck.length) break;
    card=s.deck.pop();
    s.hands[side].push(card);
  }
  return card;
}
function unoPlay(state,action) {
  const s=structuredClone(state), side=s.turn;
  const advance=(steps=1)=>(side+steps*(s.direction??1)+s.hands.length*2)%s.hands.length;
  if(action.draw===true&&s.drawn===null) {
    const card=unoDraw(s,side,1);
    if(card&&unoLegal(s,card)) s.drawn=card;
    else s.turn=advance();
    s.last={type:'draw',side};
    return s;
  }
  if(action.pass===true&&s.drawn!==null) {
    s.drawn=null;
    s.turn=advance();
    s.last={type:'pass',side};
    return s;
  }
  const card=action.card;
  if(!s.hands[side].includes(card)||!unoLegal(s,card)) invalid();
  const [color,value]=fields(card);
  if(color==='W'&&!colors.includes(action.color)) invalid();
  s.color=color==='W'?action.color:color;
  s.hands[side].splice(s.hands[side].indexOf(card),1);
  s.discard.push(card);
  s.drawn=null;
  s.last={type:'play',side,card};
  if(value==='reverse')s.direction=-(s.direction??1);
  const penalty=value==='two'?2:value==='four'?4:0;
  if(penalty)unoDraw(s,advance(),penalty);
  s.turn=advance(penalty||value==='skip'||(value==='reverse'&&s.hands.length===2)?2:1);
  if(!s.hands[side].length) s.result=side;
  return s;
}
export function startCards(id,options) {
  const count=options?.players??2;
  if(!(id==='scopa'?[2,4]:numbers(9).map(i=>i+2)).includes(count))invalid();
  return id==='scopa'?scopaDeal({id,playerCount:count,result:null,round:1,scores:[0,0],points:null,last:null},0):unoStart(count);
}
export function playCards(s,action) {
  return s.id==='scopa'?scopaPlay(s,action):unoPlay(s,action);
}
export function viewCards(s,side) {
  const {id,turn,result,last}=s, hand=s.hands[side], own=turn===side&&result===null;
  const out={id,turn,result,last,hand,handCounts:s.hands.map(h=>h.length),opponentCount:s.hands[(side+1)%s.hands.length].length,remaining:s.deck.length};
  if(id==='scopa') return {...out,table:s.table,captureCounts:s.captured.map(cards=>cards.length),scores:s.scores,points:s.points,round:s.round,sweeps:s.sweeps,
    takes:own?Object.fromEntries(hand.map(c=>[c,takes(s.table,c)])):{}};
  return {...out,top:s.discard.at(-1),color:s.color,drawn:own&&s.drawn!==null,
    playable:own?hand.filter(c=>unoLegal(s,c)):[]};
}
