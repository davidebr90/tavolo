// Turns two consecutive room snapshots into a list of visual events.
// Pure data in, pure data out: the DOM side lives in motion.mjs and app.mjs.

import { isTeamRoom } from './rooms.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// An initial snapshot from a restored tab describes the table as it is now.
// A last-seat join or one consecutive move can describe cards in transit.
export function cardTransition(prev,next,joining=false) {
  const b=next.game, a=prev?.game, capacity=next.maxPlayers??2;
  if(!['scopa','briscola','uno'].includes(b.id)||next.closed||next.players.length!==capacity)return null;
  if(prev&&(prev.version+1!==next.version||a.id!==b.id))return null;
  const opening=!b.last&&(prev?prev.players.length<capacity:joining);
  if(!opening&&(!a||prev.players.length!==capacity||!b.last))return null;
  const newRound=b.id==='scopa'&&a&&a.round!==b.round;
  const changed=!opening&&!same(a.last,b.last);
  const played=changed&&(b.id==='scopa'||b.last.type==='play')?b.last:null;
  const dealAll=opening||newRound;
  const table=dealAll?(b.id==='scopa'?b.table:b.id==='uno'?[b.top]:[]):[];
  const hand=dealAll?b.hand:b.hand.filter(c=>!a.hand.includes(c));
  const counts=g=>g.handCounts??(next.side===0?[g.hand.length,g.opponentCount]:[g.opponentCount,g.hand.length]);
  const before=dealAll?[]:counts(a);
  const draws=counts(b).map((count,seat)=>dealAll?count:Math.max(0,count-before[seat]+Number(played?.side===seat)));
  if(!played&&!table.length&&!draws.some(Boolean))return null;
  return {played,table,hand,draws,newRound:!!newRound};
}

export function scopaProgress(g) {
  const four=g.handCounts?.length===4;
  const hand=four?1:6-g.remaining/6, total=four?1:6;
  const left=(g.handCounts??[g.hand.length,g.opponentCount]).reduce((n,x)=>n+x,0);
  const label=four?'Distribuzione unica':'Mano '+hand+' di '+total;
  if(g.result!==null)return {label,detail:'Mazzo concluso. Punteggio finale assegnato.'};
  const remaining=left+(left===1?' giocata rimasta. ':' giocate rimaste. ');
  if(four)return {label,detail:'Dieci carte a testa all’inizio. '+remaining+'Poi si contano i punti del mazzo.'};
  const next=g.remaining?'Poi si distribuiscono altre 3 carte a testa.':'Poi si contano i punti del mazzo.';
  return {label,detail:(g.remaining?'':'Mazzo da pescare esaurito · Ultima mano · ')+remaining+next};
}

export function seatHasTurn(room,seat) {
  const g=room?.game;
  return !!g&&!room.closed&&room.players.length===(room.maxPlayers??2)&&g.result===null&&g.turn===seat&&
    (g.id!=='naval'||g.ready.every(Boolean));
}

export function kingSquare(board,turn) {
  return Array.isArray(board)?board.indexOf(turn===0?'K':'k'):-1;
}

function chessEffects(a,b) {
  const {from,to,castle,promote,ep}=b.last;
  if(!Number.isInteger(from)||!Number.isInteger(to))return [];
  const fx=[{type:'slide',from,to}];
  if(castle)fx.push({type:'slide',from:castle===1?from+3:from-4,to:from+castle});
  const at=ep?(from&~7)+to%8:to;
  const piece=a.board?.[at];
  if(piece&&!castle)fx.push({type:'capture',at,piece});
  if(promote)fx.push({type:'promote',at:to});
  return fx;
}

function damaEffects(a,b) {
  const path=Array.isArray(b.last.path)?b.last.path:[b.last.at];
  const fx=[{type:'hop',path}];
  (a.board??[]).forEach((v,i)=>{if(v&&!b.board[i]&&i!==path[0])fx.push({type:'capture',at:i,piece:v});});
  if(a.board?.[path[0]]<3&&b.board[b.last.at]>=3)fx.push({type:'crown',at:b.last.at});
  return fx;
}

function stoneCaptures(a,b) {
  const cells=[];
  (a.board??[]).forEach((v,i)=>{if(v&&!b.board[i])cells.push(i);});
  return cells.length?[{type:'capture-stones',cells,color:a.board[cells[0]]}]:[];
}

function cardEffects(a,b,side) {
  const fx=[];
  if(b.id==='scopa') {
    if(b.last.take?.length)fx.push({type:'take',count:b.last.take.length+1,team:b.last.side%2});
    (b.sweeps??[]).forEach((n,team)=>{if(n>(a.sweeps?.[team]??0))fx.push({type:'sweep',team,mine:team===side%2});});
    // A smazzata just ended: the bank pays one chip per point, also on the last one of the game.
    const roundEnded=a.round!==b.round||(a.result===null&&b.result!==null);
    if(roundEnded&&Array.isArray(b.points))fx.push({type:'points',points:b.points,scores:b.scores});
    if(a.round!==b.round)fx.push({type:'round',round:b.round,scores:b.scores,points:b.points??[]});
    return fx;
  }
  if(b.last.type==='play'&&typeof b.last.card==='string') {
    const [, rank]=b.last.card.split(':');
    if(rank==='wild'||rank==='four')fx.push({type:'wild',color:b.color});
    if(rank==='two'||rank==='four')fx.push({type:'penalty',amount:rank==='two'?2:4});
    if(rank==='reverse')fx.push({type:'reverse'});
    if(rank==='skip')fx.push({type:'skip'});
  }
  if(b.last.type==='draw')fx.push({type:'draw',seat:b.last.side});
  (b.handCounts??[]).forEach((n,seat)=>{
    if(n===1&&a.handCounts?.[seat]!==1)fx.push({type:'uno',seat,mine:seat===side});
  });
  return fx;
}

function gameEffects(a,b,side) {
  const last=b.last;
  switch(b.id) {
    case 'chess': return chessEffects(a,b);
    case 'dama': return damaEffects(a,b);
    case 'reversi': {
      const fx=[{type:'place',at:last.at},{type:'flip',origin:last.at,cells:last.changed??[]}];
      if(last.pass!==undefined)fx.push({type:'pass',seat:last.pass});
      return fx;
    }
    case 'four': return [{type:'drop',at:last.at,row:Math.floor(last.at/7)},...(last.line?[{type:'line',cells:last.line}]:[])];
    case 'tris': return [{type:'place',at:last.at},...(last.line?[{type:'line',cells:last.line}]:[])];
    case 'go': return last.pass?[{type:'pass',seat:a.turn}]:[{type:'place',at:last.at},...stoneCaptures(a,b)];
    case 'nim': return [{type:'remove',pile:last.pile,count:last.count,from:a.piles?.[last.pile]??last.count}];
    case 'dots': {
      const cells=(b.boxes??[]).flatMap((owner,i)=>owner&&!a.boxes?.[i]?[i]:[]);
      return [{type:'edge',edge:last.edge},...(cells.length?[{type:'boxes',cells,owner:b.boxes[cells[0]]}]:[])];
    }
    case 'backgammon': {
      if(last.roll)return [{type:'dice',values:last.roll,pass:!!last.pass}];
      if(last.pass)return [{type:'pass',seat:a.turn}];
      const fx=[{type:'checker',from:last.from,to:last.to}];
      if(Number.isInteger(last.to)&&a.points?.[last.to]&&Math.sign(a.points[last.to])!==Math.sign(b.points[last.to]))fx.push({type:'hit',at:last.to});
      if(last.to==='off')fx.push({type:'bear-off',from:last.from});
      return fx;
    }
    case 'scopa':
    case 'uno': return cardEffects(a,b,side);
  }
  return [];
}

function navalEffects(a,b) {
  const fx=[];
  if(!a.ready?.every(Boolean)&&b.ready?.every(Boolean))fx.push({type:'battle'});
  for(const [grid,key] of [['target','outgoing'],['own','incoming']]) {
    const list=b[key]??[];
    if(list.length>(a[key]?.length??0)) {
      const shot=list.at(-1);
      fx.push({type:'strike',grid,at:shot.at,hit:!!shot.hit,sunk:shot.sunk??[]});
    }
  }
  return fx;
}

export function moveEffects(prev,next) {
  const out=[];
  if(!prev?.game||!next?.game||prev.game.id!==next.game.id||!(next.version>prev.version))return out;
  const a=prev.game, b=next.game, side=next.side, capacity=next.maxPlayers??2;
  if(['scopa','briscola','uno'].includes(b.id)&&next.version!==prev.version+1)return out;
  if(prev.players.length<capacity&&next.players.length===capacity)out.push({type:'start'});
  else if(a.result!==null&&b.result===null&&!next.closed)out.push({type:'start',rematch:true});
  else if(next.players.length>prev.players.length)out.push({type:'join',seat:next.players.length-1});
  if(b.id==='naval')out.push(...navalEffects(a,b));
  else if(b.last&&!same(a.last,b.last))out.push(...gameEffects(a,b,side));
  if(b.id==='chess'&&b.check&&b.result===null&&!same(a.last,b.last))out.push({type:'check',at:kingSquare(b.board,b.turn)});
  if(a.result===null&&b.result!==null&&!next.closed) {
    const mine=b.result===(isTeamRoom(next)?side%2:side);
    out.push({type:'result',outcome:b.result==='draw'?'draw':mine?'win':'loss'});
  }
  if(!prev.closed&&next.closed)out.push({type:'closed'});
  if(!seatHasTurn(prev,prev.side)&&seatHasTurn(next,side))out.push({type:'your-turn'});
  return out;
}
