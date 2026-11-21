const empty=n=>Array(n).fill(0);
const invalid=()=>{throw Error('Mossa non valida.');};
const ids=['go','backgammon','nim','dots'];
export const strategyIds=ids;
const die=()=>1+crypto.getRandomValues(new Uint32Array(1))[0]%6;
export const boxes=Array.from({length:9},(_,i)=>{
  const r=Math.floor(i/3),c=i%3;
  return [r*3+c,(r+1)*3+c,12+r*4+c,13+r*4+c];
});
export function strategyStart(id) {
  const s={id,turn:0,result:null,last:null};
  if(id==='go') return {...s,board:empty(81),positions:['0'.repeat(81)],passes:0};
  if(id==='nim') return {...s,piles:[1,3,5,7]};
  if(id==='dots') return {...s,edges:empty(24),boxes:empty(9)};
  const points=empty(24);
  for(const [i,n] of [[23,2],[12,5],[7,3],[5,5]]) {points[i]=n;points[23-i]=-n;}
  let a=die(),b=die();
  while(a===b){a=die();b=die();}
  return {...s,turn:Number(b>a),points,bar:[0,0],off:[0,0],dice:[a,b]};
}
function group(board,at) {
  const value=board[at], cells=new Set([at]), borders=new Set(), stack=[at];
  while(stack.length) {
    const i=stack.pop();
    for(const n of [i>=9?i-9:-1,i<72?i+9:-1,i%9?i-1:-1,i%9<8?i+1:-1]) {
      if(n<0)continue;
      if(board[n]!==value) borders.add(n);
      else if(!cells.has(n)){cells.add(n);stack.push(n);}
    }
  }
  return {cells,borders};
}
const hasLiberty=(board,g)=>Array.from(g.borders).some(n=>board[n]===0);
function goPlay(s,a) {
  if(a.pass===true) {
    const next={...s,turn:1-s.turn,passes:s.passes+1,last:{pass:true}};
    if(next.passes<2)return next;
    const scores=[0,7.5], seen=new Set();
    s.board.forEach((value,i)=>{
      if(value){scores[value-1]++;return;}
      if(seen.has(i))return;
      const area=group(s.board,i);
      for(const n of area.cells)seen.add(n);
      const sides=new Set(Array.from(area.borders,n=>s.board[n]));
      if(sides.size===1)scores[[...sides][0]-1]+=area.cells.size;
    });
    return {...next,scores,result:Number(scores[1]>scores[0])};
  }
  const board=goPlacement(s,a.at);
  if(!board)invalid();
  const key=board.join('');
  if(s.positions.includes(key))throw Error('La mossa ripete una posizione precedente.');
  return {...s,board,positions:[...s.positions,key],passes:0,last:{at:a.at},turn:1-s.turn};
}
function goPlacement(s,at) {
  if(!Number.isInteger(at)||s.board[at]!==0)return null;
  const board=s.board.slice(), color=s.turn+1;
  board[at]=color;
  for(const n of group(board,at).borders) if(board[n]===3-color) {
    const g=group(board,n);
    if(!hasLiberty(board,g))for(const stone of g.cells)board[stone]=0;
  }
  if(!hasLiberty(board,group(board,at)))return null;
  return board;
}
function bgSteps(s,dieValue) {
  const side=s.turn, sign=side===0?1:-1;
  const own=s.points.flatMap((p,i)=>p*sign>0?[i]:[]);
  if(s.bar[side]) {
    const to=side===0?24-dieValue:dieValue-1;
    return s.points[to]*sign>=-1?[{from:'bar',to,die:dieValue}]:[];
  }
  const distance=i=>side===0?i+1:24-i;
  return own.flatMap(from=>{
    const to=from-sign*dieValue;
    if(to>=0&&to<24) return s.points[to]*sign>=-1?[{from,to,die:dieValue}]:[];
    if(!own.every(i=>distance(i)<=6))return [];
    return (dieValue===distance(from)||own.every(i=>distance(i)<=distance(from)))?[{from,to:'off',die:dieValue}]:[];
  });
}
function bgApply(s,m) {
  const {turn}=s, sign=turn===0?1:-1;
  const points=s.points.slice(), bar=s.bar.slice(), off=s.off.slice(), dice=s.dice.slice();
  dice.splice(dice.indexOf(m.die),1);
  if(m.from==='bar')bar[turn]--;
  else points[m.from]-=sign;
  if(m.to==='off')off[turn]++;
  else {
    if(points[m.to]===-sign){points[m.to]=0;bar[1-turn]++;}
    points[m.to]+=sign;
  }
  return {...s,points,bar,off,dice,last:m};
}
function bgLegal(s) {
  function best(state) {
    let depth=0, moves=[];
    for(const d of new Set(state.dice)) for(const m of bgSteps(state,d)) {
      const count=1+best(bgApply(state,m)).depth;
      if(count<depth)continue;
      if(count>depth){depth=count;moves=[];}
      moves.push(m);
    }
    return {depth,moves};
  }
  const {depth,moves}=best(s);
  if(depth===1&&s.dice.length===2&&moves.length) {
    const max=Math.max(...moves.map(m=>m.die));
    return moves.filter(m=>m.die===max);
  }
  return moves;
}
function bgPlay(s,a) {
  if(a.roll===true&&s.dice.length===0) {
    const first=die(), second=die(), dice=first===second?Array(4).fill(first):[first,second];
    const next={...s,dice,last:{roll:dice}};
    return bgLegal(next).length?next:{...next,dice:[],turn:1-s.turn,last:{roll:dice,pass:true}};
  }
  if(a.pass===true&&s.dice.length&&!bgLegal(s).length) return {...s,dice:[],turn:1-s.turn,last:{pass:true}};
  const m=bgLegal(s).find(m=>m.from===a.from&&m.to===a.to&&m.die===a.die);
  if(!m)invalid();
  const next=bgApply(s,m);
  if(next.off[s.turn]===15)return {...next,result:s.turn};
  return bgLegal(next).length?next:{...next,turn:1-s.turn,dice:[]};
}
export function strategyPlay(s,a) {
  if(s.id==='go')return goPlay(s,a);
  if(s.id==='backgammon')return bgPlay(s,a);
  if(s.id==='nim') {
    const {pile,count}=a;
    if(!Number.isInteger(pile)||!Number.isInteger(count)||count<1||!(s.piles[pile]>=count))invalid();
    const piles=s.piles.slice();
    piles[pile]-=count;
    return {...s,piles,turn:1-s.turn,result:piles.some(Boolean)?null:s.turn,last:{pile,count}};
  }
  if(!Number.isInteger(a.edge)||s.edges[a.edge]!==0)invalid();
  const edges=s.edges.slice(), side=s.turn+1;
  edges[a.edge]=side;
  const claimed=s.boxes.map((owner,i)=>owner||(boxes[i].every(e=>edges[e])?side:0));
  const counts=[1,2].map(p=>claimed.filter(c=>c===p).length);
  return {...s,edges,boxes:claimed,counts,turn:claimed.some((c,i)=>c!==s.boxes[i])?s.turn:1-s.turn,
    result:claimed.every(Boolean)?Number(counts[1]>counts[0]):null,last:{edge:a.edge}};
}
export function strategyView(s,side) {
  const {positions,...view}=s;
  if(s.id==='go') {
    view.moves=[];
    if(s.turn===side&&s.result===null) {
      const played=new Set(positions);
      for(let at=0;at<s.board.length;at++) {
        const board=goPlacement(s,at);
        if(board&&!played.has(board.join('')))view.moves.push(at);
      }
    }
  }
  if(s.id==='backgammon')view.moves=s.turn===side&&s.result===null?bgLegal(s):[];
  return view;
}
// Building blocks for the computer player.
export { group as goGroup, goPlacement, bgSteps, bgApply, bgLegal };
