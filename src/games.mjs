import { chessStart, chessMoves, chessPlay, checked, canClaimDraw } from './chess.mjs';
import { startCards, playCards, viewCards } from './cards.mjs';
import { strategyIds, strategyStart, strategyPlay, strategyView } from './strategy.mjs';

const cards=['scopa','uno'];
export const games=['chess','naval','four','reversi','tris','dama',...cards,...strategyIds];
const grid=(n)=>Array(n).fill(0);
const adjacent=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const diagonals=adjacent.filter(([r,c])=>r&&c);
const same=(a,b)=>a.length===b.length && a.every((v,i)=>v===b[i]);
const invalid=()=>{throw new Error('Mossa non valida.');};
const step=(i,dr,dc,n=8,h=n)=>{
  const r=Math.floor(i/n)+dr,c=i%n+dc;
  return r>=0&&r<h&&c>=0&&c<n ? r*n+c : -1;
};
export const lengths=[5,4,3,3,2];
export function shipCells(ship,length,size=10) {
  if (!ship || !Number.isInteger(ship.at) || ship.at<0 || ship.at>=size*size || typeof ship.vertical!=='boolean') return [];
  return Array.from({length},(_,i)=>step(ship.at,ship.vertical?i:0,ship.vertical?0:i,size));
}
export function fleet(size=10,fleetLengths=lengths) {
  const ships=[], used=new Set();
  for (const length of fleetLengths) {
    const options=[];
    for(let at=0;at<size*size;at++) for(const vertical of [true,false]) {
      const ship={at,vertical};
      if(shipCells(ship,length,size).every(i=>i>=0&&!used.has(i))) options.push(ship);
    }
    const ship=options[Math.floor(Math.random()*options.length)];
    shipCells(ship,length,size).forEach(i=>used.add(i));
    ships.push(ship);
  }
  return ships;
}
export function start(id,options={}) {
  if(!games.includes(id)) throw new Error('Gioco non disponibile.');
  if(id==='chess') return chessStart();
  if(cards.includes(id)) return startCards(id);
  if(strategyIds.includes(id)) return strategyStart(id);
  const s={id,turn:0,result:null,last:null};
  if(id==='naval') {
    const {size=10,ships=5}=options??{};
    if(![8,10,12].includes(size)||![3,4,5,6].includes(ships)) throw Error('Configurazione della flotta non valida.');
    const fleetLengths=ships===6?[...lengths,1]:Array.from({length:ships},(_,i)=>ships-i);
    return {...s,size,lengths:fleetLengths,fleets:[null,null],shots:[[],[]]};
  }
  s.board=grid(({tris:9,four:42})[id]||64);
  if(id==='reversi') for (const [i,p] of [[27,2],[28,1],[35,1],[36,2]]) s.board[i]=p;
  if(id==='dama') {
    s.board=s.board.map((_,i)=>((i>>3)+i%8)%2===0?(i<24?2:i>=40?1:0):0);
    s.quiet=0;
  }
  return s;
}
function flips(board,at,p) {
  if(board[at]!==0) return [];
  return adjacent.flatMap(([dr,dc])=>{
    const row=[];
    let i=step(at,dr,dc);
    while(board[i]===3-p){row.push(i);i=step(i,dr,dc);}
    return board[i]===p?row:[];
  });
}
const reversible=(board,p)=>board.flatMap((_,at)=>flips(board,at,p).length?[{at}]:[]);
function damaMoves(board,turn) {
  const player=turn+1, captures=[], simple=[];
  function search(at,p,b,path,taken,kings) {
    let continued=false;
    for(const [dr,dc] of diagonals) {
      if(p<3 && dr!==(turn===0?-1:1)) continue;
      const mid=step(at,dr,dc), dest=step(at,dr*2,dc*2), v=b[mid];
      if(!v || (v-1)%2===turn || (p<3 && v>=3) || b[dest]!==0) continue;
      continued=true;
      const next=b.slice();
      next[at]=next[mid]=0;
      next[dest]=p;
      search(dest,p,next,[...path,dest],[...taken,mid],kings+Number(v>=3));
    }
    if(!continued && taken.length) captures.push({path,taken,rank:[taken.length,Number(p>=3),kings,...taken.map(i=>Number(board[i]>=3))]});
  }
  for(let i=0;i<64;i++) {
    const p=board[i];
    if(p!==player && p!==player+2) continue;
    search(i,p,board,[i],[],0);
    for(const [dr,dc] of diagonals) {
      const dest=step(i,dr,dc);
      if((p>=3||dr===(turn===0?-1:1))&&board[dest]===0) simple.push({path:[i,dest],taken:[]});
    }
  }
  if(!captures.length) return simple;
  captures.sort((a,b)=>{
    for(let i=0;i<a.rank.length;i++) if(a.rank[i]!==b.rank[i]) return b.rank[i]-a.rank[i];
    return 0;
  });
  return captures.filter(m=>same(m.rank,captures[0].rank));
}
export function available(s) {
  if(s.result!==null) return [];
  switch(s.id) {
    case 'chess': return chessMoves(s);
    case 'dama': return damaMoves(s.board,s.turn);
    case 'reversi': return reversible(s.board,s.turn+1);
    case 'tris': return s.board.flatMap((v,at)=>v?[]:[{at}]);
    case 'four': return s.board.slice(0,7).flatMap((v,at)=>v?[]:[{at}]);
    default: return [];
  }
}
function navalPlay(s,action,side) {
  const next=structuredClone(s);
  const size=s.size??10, fleetLengths=s.lengths??lengths;
  if(!s.fleets.every(Boolean)) {
    if(s.fleets[side] || !Array.isArray(action.ships) || action.ships.length!==fleetLengths.length) invalid();
    const all=action.ships.flatMap((ship,i)=>shipCells(ship,fleetLengths[i],size));
    if(all.length!==fleetLengths.reduce((a,b)=>a+b,0) || all.includes(-1) || new Set(all).size!==all.length) invalid();
    next.fleets[side]=action.ships.map(({at,vertical,reversed})=>reversed===true?{at,vertical,reversed:true}:{at,vertical});
    return next;
  }
  const {at}=action;
  if(s.turn!==side || !Number.isInteger(at) || at<0 || at>=size*size || s.shots[side].some(m=>m.at===at)) invalid();
  const ships=s.fleets[1-side].map((ship,i)=>shipCells(ship,fleetLengths[i],size));
  const ship=ships.find(cells=>cells.includes(at));
  const shot={at,hit:!!ship};
  next.shots[side].push(shot);
  const targets=new Set(next.shots[side].map(m=>m.at));
  if(ship?.every(i=>targets.has(i))) shot.sunk=ship;
  if(ships.every(cells=>cells.every(i=>targets.has(i)))) next.result=side;
  next.last={...shot,side};
  next.turn=1-side;
  return next;
}
export function play(s,action,side=s.turn) {
  if(s.result!==null || !action || typeof action!=='object') invalid();
  if(s.id==='naval') return navalPlay(s,action,side);
  if(side!==s.turn) throw new Error('Aspetta il tuo turno.');
  if(s.id==='chess') return chessPlay(s,action);
  if(cards.includes(s.id)) return playCards(s,action);
  if(strategyIds.includes(s.id)) return strategyPlay(s,action);
  const board=s.board.slice(), p=side+1;
  const next={...s,board,turn:1-side};
  if(s.id==='dama') {
    const m=Array.isArray(action.path)&&damaMoves(board,side).find(m=>same(m.path,action.path));
    if(!m) invalid();
    const from=m.path[0], to=m.path.at(-1), piece=board[from];
    board[from]=0;
    m.taken.forEach(i=>board[i]=0);
    board[to]=piece<3 && (to>>3)===(side===0?0:7)?piece+2:piece;
    next.last={at:to,path:m.path};
    const history=s.history??[];
    const ply=(history.at(-1)?.ply??side)+1;
    const san=m.path.map(i=>'abcdefgh'[i%8]+(8-(i>>3))).join(m.taken.length?'×':'–');
    next.history=[...history,{ply,san}];
    next.quiet=piece>=3&&!m.taken.length?s.quiet+1:0;
    if(!damaMoves(board,next.turn).length) next.result=side;
    else if(next.quiet>=80) next.result='draw';
    return next;
  }
  let {at}=action;
  if(!Number.isInteger(at) || board[at]!==0 || (s.id==='four'&&at>=7)) invalid();
  if(s.id==='four') while(board[at+7]===0) at+=7;
  if(s.id==='reversi') {
    const changed=flips(board,at,p);
    if(!changed.length) invalid();
    changed.forEach(i=>board[i]=p);
    board[at]=p;
    next.last={at,changed};
    if(!reversible(board,3-p).length) {
      if(reversible(board,p).length) {next.turn=side;next.last.pass=1-side;}
      else {
        const score=board.reduce((sum,v)=>sum+(v===1?1:v===2?-1:0),0);
        next.result=score===0?'draw':Number(score<0);
      }
    }
    return next;
  }
  board[at]=p;
  next.last={at};
  const n=s.id==='four'?7:3,h=s.id==='four'?6:3, target=s.id==='four'?4:3;
  for(const [r,c] of [[0,1],[1,0],[1,1],[1,-1]]) {
    const line=[at];
    for(const d of [-1,1]) for(let i=step(at,r*d,c*d,n,h);board[i]===p;i=step(i,r*d,c*d,n,h)) line.push(i);
    if(line.length>=target) {next.result=side;next.last.line=line;break;}
  }
  if(next.result===null && board.every(Boolean)) next.result='draw';
  return next;
}
export function view(s,side) {
  if(cards.includes(s.id)) return viewCards(s,side);
  if(strategyIds.includes(s.id)) return strategyView(s,side);
  const {id,turn,result,last,board}=s;
  if(id==='naval') return {id,turn,result,last,size:s.size??10,lengths:s.lengths??lengths,ready:s.fleets.map(Boolean),mine:s.fleets[side],incoming:s.shots[1-side],outgoing:s.shots[side]};
  const output={id,turn,result,last,board,moves:turn===side?available(s):[]};
  if(id==='chess'||id==='dama')output.history=s.history??[];
  if(id==='chess') {
    output.check=checked(board,turn);
    output.canDraw=turn===side&&canClaimDraw(s,output.moves);
  }
  return output;
}
