// Computer players. Every game has a small strategy that returns the same kind of action a
// person would send. A strategy only uses what its own seat can see: cards in other hands and
// the opponent's fleet are never read. Levels: 0 easy, 1 normal, 2 hard. `quick` asks for the
// cheapest sensible answer, for hosts that allow very little computing time.
import { play, available, view, fleet, lengths as classicFleet } from './games.mjs';
import { chessMoves, chessApply, checked } from './chess.mjs';
import { boxes, goGroup, goPlacement, bgSteps, bgApply, bgLegal } from './strategy.mjs';
import { pokerHand, compareHands } from './poker.mjs';

const pick=list=>list[Math.floor(Math.random()*list.length)];
const chance=p=>Math.random()<p;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
// The option with the highest score. Equal scores are settled at random.
function best(list,score) {
  let top=-Infinity, chosen=[];
  for(const item of list) {
    const value=score(item);
    if(value>top+1e-9){top=value;chosen=[item];}
    else if(value>top-1e-9)chosen.push(item);
  }
  return pick(chosen);
}

// ---- Search for two-player board games ---------------------------------------------------
// Alpha-beta that deepens one level at a time until `depth` or until `budget` positions were
// visited. The clock is not used: some hosts freeze it while code runs.
// rules: moves(state), apply(state,move), turn(state) and score(state,side,ply,moves,alpha,beta),
// the value for `side` of a position that is not searched further. `moves` is an empty list
// when the player to move has none, and null when the depth ran out.
const WIN=1e6;
function search(rules,root,side,{depth,budget,margin=0}) {
  let visited=0, stopped=false;
  function visit(state,left,alpha,beta,ply) {
    if(++visited>budget){stopped=true;return 0;}
    const moves=left>0?rules.moves(state):null;
    if(!moves||!moves.length)return rules.score(state,side,ply,moves,alpha,beta);
    const mine=rules.turn(state)===side;
    let value=mine?-Infinity:Infinity;
    for(const move of moves) {
      const child=visit(rules.apply(state,move),left-1,alpha,beta,ply+1);
      if(stopped)return 0;
      if(mine){if(child>value)value=child;if(value>alpha)alpha=value;}
      else {if(child<value)value=child;if(value<beta)beta=value;}
      if(alpha>=beta)break;
    }
    return value;
  }
  let ranked=rules.moves(root).map(move=>({move,value:0}));
  for(let level=1;level<=depth&&ranked.length>1;level++) {
    const round=[];
    let top=-Infinity;
    for(const {move} of ranked) {
      // Moves within `margin` of the best one keep their exact value, so one can be picked at random.
      const value=visit(rules.apply(root,move),level-1,top-margin-1,Infinity,1);
      if(stopped)break;
      round.push({move,value});
      if(value>top)top=value;
    }
    if(stopped)break;
    ranked=round.sort((a,b)=>b.value-a.value);
    if(ranked[0].value>WIN/2)break;
  }
  if(!ranked.length)return null;
  const top=ranked[0].value;
  return pick(ranked.filter(entry=>entry.value>=top-margin)).move;
}
// How hard each level thinks: [easy, normal, hard, quick].
const effort=(level,quick,table)=>table[quick?3:level]??table[1];

// ---- Tris --------------------------------------------------------------------------------
const trisLines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function trisBot(s,side,level) {
  const free=s.board.flatMap((v,at)=>v?[]:[at]);
  if(level===0&&chance(.45))return {at:pick(free)};
  const memo=new Map();
  const winner=board=>{
    for(const [a,b,c] of trisLines)if(board[a]&&board[a]===board[b]&&board[a]===board[c])return board[a]-1;
    return board.every(Boolean)?'draw':null;
  };
  // Value for the player about to move: faster wins and slower losses are better.
  function value(board,turn) {
    const key=board.join('')+turn;
    if(memo.has(key))return memo.get(key);
    const result=winner(board);
    let score;
    if(result!==null)score=result==='draw'?0:result===turn?10:-10-board.filter(v=>!v).length;
    else {
      score=-Infinity;
      for(let at=0;at<9;at++) if(!board[at]) {
        board[at]=turn+1;
        score=Math.max(score,-value(board,1-turn));
        board[at]=0;
      }
    }
    memo.set(key,score);
    return score;
  }
  const board=s.board.slice();
  return {at:best(free,at=>{
    board[at]=side+1;
    const score=-value(board,1-side);
    board[at]=0;
    return score;
  })};
}

// ---- Forza 4 -----------------------------------------------------------------------------
const fourWindows=[];
for(let r=0;r<6;r++) for(let c=0;c<7;c++) for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
  const cells=[0,1,2,3].map(n=>[r+dr*n,c+dc*n]);
  if(cells.every(([row,col])=>row>=0&&row<6&&col>=0&&col<7))fourWindows.push(cells.map(([row,col])=>row*7+col));
}
const fourOrder=[3,2,4,1,5,0,6];
const fourRules={
  moves:s=>s.won!==null?[]:fourOrder.filter(col=>s.board[col]===0),
  turn:s=>s.turn,
  apply(s,col) {
    const board=s.board.slice(), piece=s.turn+1;
    let at=col;
    while(at+7<42&&board[at+7]===0)at+=7;
    board[at]=piece;
    let won=null;
    for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      let run=1;
      for(const d of [-1,1]) {
        let r=Math.floor(at/7)+dr*d, c=at%7+dc*d;
        while(r>=0&&r<6&&c>=0&&c<7&&board[r*7+c]===piece){run++;r+=dr*d;c+=dc*d;}
      }
      if(run>=4){won=s.turn;break;}
    }
    return {board,turn:1-s.turn,won};
  },
  score(s,side,ply) {
    if(s.won!==null)return s.won===side?WIN-ply:-WIN+ply;
    const mine=side+1;
    let value=0;
    for(const window of fourWindows) {
      let own=0, other=0;
      for(const at of window){const v=s.board[at];if(v===mine)own++;else if(v)other++;}
      if(!other)value+=own===3?50:own===2?10:own;
      else if(!own)value-=other===3?60:other===2?10:other;
    }
    for(let r=0;r<6;r++){const v=s.board[r*7+3];if(v)value+=v===mine?4:-4;}
    return value;
  }
};
function fourBot(s,side,level,quick) {
  const root={board:s.board,turn:s.turn,won:null};
  if(level===0&&chance(.3))return {at:pick(fourRules.moves(root))};
  const [depth,budget]=effort(level,quick,[[2,400],[5,6000],[7,22000],[2,300]]);
  return {at:search(fourRules,root,side,{depth,budget,margin:level===2?0:3})};
}

// ---- Reversi -----------------------------------------------------------------------------
const reversiWeights=[
  120,-20,20,5,5,20,-20,120, -20,-40,-5,-5,-5,-5,-40,-20, 20,-5,15,3,3,15,-5,20, 5,-5,3,3,3,3,-5,5,
  5,-5,3,3,3,3,-5,5, 20,-5,15,3,3,15,-5,20, -20,-40,-5,-5,-5,-5,-40,-20, 120,-20,20,5,5,20,-20,120];
const reversiDirections=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
function reversiMoves(board,piece) {
  const moves=[];
  for(let at=0;at<64;at++) {
    if(board[at])continue;
    const row=at>>3, col=at&7;
    let flips=null;
    for(const [dr,dc] of reversiDirections) {
      let r=row+dr, c=col+dc, run=0;
      while(r>=0&&r<8&&c>=0&&c<8&&board[r*8+c]===3-piece){r+=dr;c+=dc;run++;}
      if(!run||r<0||r>7||c<0||c>7||board[r*8+c]!==piece)continue;
      flips??=[];
      for(let n=1;n<=run;n++)flips.push((row+dr*n)*8+col+dc*n);
    }
    if(flips)moves.push({at,flips});
  }
  return moves.sort((a,b)=>reversiWeights[b.at]-reversiWeights[a.at]);
}
const reversiRules={
  // A player without moves passes; the game ends when neither can move.
  moves(s) {
    let moves=reversiMoves(s.board,s.turn+1);
    if(!moves.length) {
      moves=reversiMoves(s.board,2-s.turn);
      if(moves.length)s.turn=1-s.turn;
    }
    return moves;
  },
  apply(s,move) {
    const board=s.board.slice(), piece=s.turn+1;
    board[move.at]=piece;
    for(const at of move.flips)board[at]=piece;
    return {board,turn:1-s.turn};
  },
  turn:s=>s.turn,
  score(s,side,ply,moves) {
    const mine=side+1;
    let discs=0, places=0, empty=0;
    for(let at=0;at<64;at++) {
      const v=s.board[at];
      if(!v){empty++;continue;}
      const sign=v===mine?1:-1;
      discs+=sign;
      places+=sign*reversiWeights[at];
    }
    if(moves&&!moves.length)return discs?(discs>0?WIN:-WIN)+discs:0;
    return empty<=12?discs*12+places*.3:places;
  }
};
function reversiBot(s,side,level,quick) {
  const root={board:s.board,turn:s.turn};
  if(level===0&&chance(.35))return {at:pick(reversiMoves(s.board,side+1)).at};
  const [depth,budget]=effort(level,quick,[[1,100],[4,2500],[6,12000],[1,100]]);
  return {at:search(reversiRules,root,side,{depth,budget,margin:level===2?0:4}).at};
}

// ---- Dama --------------------------------------------------------------------------------
const damaRules={
  moves:s=>available({id:'dama',result:null,board:s.board,turn:s.turn}).sort((a,b)=>b.taken.length-a.taken.length),
  turn:s=>s.turn,
  apply(s,move) {
    const board=s.board.slice(), from=move.path[0], to=move.path.at(-1), piece=board[from];
    board[from]=0;
    for(const at of move.taken)board[at]=0;
    board[to]=piece<3&&(to>>3)===(s.turn===0?0:7)?piece+2:piece;
    return {board,turn:1-s.turn};
  },
  score(s,side,ply,moves) {
    if(moves&&!moves.length)return s.turn===side?-WIN+ply:WIN-ply;
    let value=0;
    for(let at=0;at<64;at++) {
      const piece=s.board[at];
      if(!piece)continue;
      const owner=(piece-1)%2, row=at>>3, col=at&7;
      // Men gain as they advance and keep the back rank guarded; kings like the middle.
      const advance=owner===0?7-row:row;
      const worth=piece>=3?330+(3.5-Math.max(Math.abs(row-3.5),Math.abs(col-3.5)))*6:
        100+advance*5+(advance===0?10:0)+(col===0||col===7?3:0);
      value+=owner===side?worth:-worth;
    }
    return value+(s.turn===side?4:-4);
  }
};
function damaBot(s,side,level,quick) {
  const root={board:s.board,turn:s.turn};
  const moves=damaRules.moves(root);
  if(moves.length===1||(level===0&&chance(.3)))return {path:pick(moves).path};
  const [depth,budget]=effort(level,quick,[[2,300],[5,2500],[8,14000],[2,200]]);
  return {path:search(damaRules,root,side,{depth,budget,margin:level===2?0:6}).path};
}

// ---- Scacchi -----------------------------------------------------------------------------
const chessWorth={p:100,n:320,b:330,r:500,q:900,k:0};
function chessEval(s,side) {
  const board=s.board;
  let heavy=0, value=0;
  for(let at=0;at<64;at++){const p=board[at];if(p&&p!=='p'&&p!=='P'&&p!=='k'&&p!=='K')heavy+=chessWorth[p.toLowerCase()];}
  const endgame=heavy<=2600;
  for(let at=0;at<64;at++) {
    const piece=board[at];
    if(!piece)continue;
    const white=piece<'a', type=piece.toLowerCase(), row=at>>3, col=at&7;
    // Rows counted from the piece's own back rank, so both colours share the same tables.
    const rank=white?7-row:row;
    const centre=3.5-Math.max(Math.abs(col-3.5),Math.abs(row-3.5));
    let worth=chessWorth[type];
    if(type==='p')worth+=(rank-1)*(rank>=4?9:4)+(col>=2&&col<=5&&rank>=3?12:0);
    else if(type==='n')worth+=centre*12-18-(rank===0?10:0);
    else if(type==='b')worth+=centre*6-(rank===0?10:0);
    else if(type==='r')worth+=rank===6?20:0;
    else if(type==='q')worth+=centre*3;
    else worth+=endgame?centre*14:rank===0?(col<=2||col>=6?28:0):-22*rank;
    value+=white?worth:-worth;
  }
  return side===0?value:-value;
}
function orderChess(s,moves) {
  const gain=m=>{
    const target=s.board[m.to];
    return (target?chessWorth[target.toLowerCase()]*10-chessWorth[s.board[m.from].toLowerCase()]:0)+(m.promote==='q'?9000:0)+(m.ep?1000:0)+(m.castle?50:0);
  };
  return moves.map(m=>[gain(m),m]).sort((a,b)=>b[0]-a[0]).map(entry=>entry[1]);
}
function chessBot(s,side,level,quick) {
  const legal=chessMoves(s);
  if(level===0&&chance(.25))return pick(legal);
  const [depth,budget,quiet]=effort(level,quick,[[1,150,0],[2,1200,2],[3,1800,2],[1,60,0]]);
  let captures=0;
  // Follows the exchanges still open when the depth runs out, so a defended piece is not counted as lost.
  function settle(state,alpha,beta,left) {
    const stand=chessEval(state,side);
    if(left===0||++captures>budget)return stand;
    const mine=state.turn===side;
    if(mine){if(stand>=beta)return stand;if(stand>alpha)alpha=stand;}
    else {if(stand<=alpha)return stand;if(stand<beta)beta=stand;}
    let value=stand;
    for(const move of orderChess(state,chessMoves(state).filter(m=>state.board[m.to]||m.ep||m.promote==='q'))) {
      const child=settle(chessApply(state,move),alpha,beta,left-1);
      if(mine){if(child>value)value=child;if(value>alpha)alpha=value;}
      else {if(child<value)value=child;if(value<beta)beta=value;}
      if(alpha>=beta)break;
    }
    return value;
  }
  const rules={
    moves:state=>orderChess(state,chessMoves(state)),
    apply:chessApply,
    turn:state=>state.turn,
    score(state,_,ply,moves,alpha,beta) {
      const inCheck=checked(state.board,state.turn);
      if(!moves&&inCheck)moves=chessMoves(state);
      if(moves&&!moves.length)return inCheck?(state.turn===side?-WIN+ply:WIN-ply):0;
      return quiet?settle(state,alpha,beta,quiet):chessEval(state,side);
    }
  };
  const move=search(rules,s,side,{depth,budget,margin:level===2?4:14})??legal[0];
  // The engine matches moves by squares and promotion only.
  return {from:move.from,to:move.to,...(move.promote?{promote:move.promote}:{})};
}

// ---- Nim ---------------------------------------------------------------------------------
function nimBot(s,side,level) {
  const piles=s.piles, filled=piles.flatMap((n,pile)=>n?[pile]:[]);
  const anywhere=()=>{const pile=pick(filled);return {pile,count:1+Math.floor(Math.random()*piles[pile])};};
  if(chance([.5,.12,0][level]))return anywhere();
  // Taking the last object wins: leave the piles with a zero nim-sum.
  const sum=piles.reduce((a,b)=>a^b,0);
  if(sum) {
    const pile=filled.find(i=>(piles[i]^sum)<piles[i]);
    return {pile,count:piles[pile]-(piles[pile]^sum)};
  }
  const pile=best(filled,i=>piles[i]);
  return {pile,count:1};
}

// ---- Punti e quadrati ----------------------------------------------------------------------
const boxesOf=Array.from({length:24},(_,edge)=>boxes.flatMap((sides,box)=>sides.includes(edge)?[box]:[]));
function dotsBot(s,side,level,quick) {
  const free=s.edges.flatMap((v,edge)=>v?[]:[edge]);
  const sides=(edges,box)=>boxes[box].reduce((n,edge)=>n+(edges[edge]?1:0),0);
  const closing=free.filter(edge=>boxesOf[edge].some(box=>sides(s.edges,box)===3));
  // How many boxes the opponent can chain together once this edge is drawn.
  const given=edge=>{
    const edges=s.edges.slice();
    edges[edge]=1;
    let count=0;
    for(let again=true;again;) {
      again=false;
      for(let box=0;box<9;box++) if(sides(edges,box)===3) {
        edges[boxes[box].find(e=>!edges[e])]=1;
        count++;
        again=true;
      }
    }
    return count;
  };
  if(level===0&&chance(.4))return {edge:pick(free)};
  if(level===2&&!quick&&free.length<=11) {
    // Few lines left: read the ending out.
    const rules={
      moves:state=>state.result!==null?[]:state.edges.flatMap((v,edge)=>v?[]:[edge]),
      apply:(state,edge)=>play(state,{edge}),
      turn:state=>state.turn,
      score:(state,me)=>{
        const counts=[1,2].map(p=>state.boxes.filter(owner=>owner===p).length);
        return (counts[me]-counts[1-me])*100;
      }
    };
    const edge=search(rules,s,side,{depth:free.length,budget:40000});
    if(edge!==null)return {edge};
  }
  if(closing.length)return {edge:pick(closing)};
  const safe=free.filter(edge=>boxesOf[edge].every(box=>sides(s.edges,box)<2));
  if(safe.length)return {edge:pick(safe)};
  return {edge:best(free,edge=>-given(edge))};
}

// ---- Go ----------------------------------------------------------------------------------
function goArea(board) {
  const scores=[0,7.5], seen=new Set();
  board.forEach((value,at)=>{
    if(value){scores[value-1]++;return;}
    if(seen.has(at))return;
    const area=goGroup(board,at);
    for(const cell of area.cells)seen.add(cell);
    const owners=new Set(Array.from(area.borders,n=>board[n]));
    if(owners.size===1)scores[[...owners][0]-1]+=area.cells.size;
  });
  return scores;
}
function goBot(s,side,level) {
  const legal=view(s,side).moves, board=s.board, color=side+1, foe=3-color;
  const stones=board.reduce((n,v)=>n+(v?1:0),0);
  const around=at=>[at>=9?at-9:-1,at<72?at+9:-1,at%9?at-1:-1,at%9<8?at+1:-1].filter(n=>n>=0);
  const breath=(cells,at)=>{
    const g=goGroup(cells,at);
    let free=0;
    for(const n of g.borders)if(cells[n]===0)free++;
    return {free,size:g.cells.size};
  };
  const options=legal.map(at=>{
    const after=goPlacement(s,at), next=around(at);
    let taken=0;
    for(let i=0;i<81;i++)if(board[i]===foe&&after[i]===0)taken++;
    const own=breath(after,at);
    let value=taken*12;
    // A point surrounded by friendly stones is an eye: filling it throws the group away.
    if(!taken&&next.every(n=>board[n]===color))value-=70;
    if(own.free===1&&!taken)value-=28+own.size*5;
    else value+=Math.min(own.free,5)*1.5;
    for(const n of next) {
      if(board[n]===color) {
        const before=breath(board,n);
        if(before.free===1&&own.free>=2)value+=10+before.size*6;
      } else if(board[n]===foe&&after[n]===foe) {
        const left=breath(after,n).free;
        if(left===1)value+=7+breath(after,n).size*3;
        else if(left===2)value+=2;
      }
    }
    // Early on the third and fourth lines are worth more than the edge.
    const row=Math.floor(at/9), col=at%9, line=Math.min(row,col,8-row,8-col);
    value+=[-6,0,3,3,2][line]*(stones<28?1:.3);
    let friends=0, rivals=0;
    for(let r=-2;r<=2;r++) for(let c=-2;c<=2;c++) {
      const rr=row+r, cc=col+c;
      if((!r&&!c)||rr<0||rr>8||cc<0||cc>8)continue;
      const v=board[rr*9+cc];
      if(v===color)friends++;else if(v===foe)rivals++;
    }
    value+=Math.min(rivals,3)*1.3+Math.min(friends,2)*.8-(friends>=7?4:0);
    return {at,value:value+Math.random()*(level===0?8:1.5)};
  });
  const top=options.length?best(options,o=>o.value):null;
  const [black,white]=goArea(board), ahead=side===0?black>white:white>black;
  // Stop when nothing useful is left, or when the opponent passed and the count is already won.
  if(!top||top.value<1||(s.last?.pass&&ahead&&top.value<8)||(stones>60&&top.value<3))return {pass:true};
  return {at:top.at};
}

// ---- Backgammon --------------------------------------------------------------------------
function bgValue(s,side) {
  const sign=side===0?1:-1, foe=1-side;
  const far=(at,who)=>who===0?at+1:24-at;
  let mine=s.bar[side]*25, theirs=s.bar[foe]*25, value=0, home=0;
  for(let at=0;at<24;at++) {
    const n=s.points[at]*sign;
    if(n>0) {
      mine+=n*far(at,side);
      if(n>=2) {
        const inside=far(at,side)<=6;
        value+=inside?5:far(at,side)<=12?3:1.5;
        if(inside)home++;
      }
    } else if(n<0)theirs+=-n*far(at,foe);
  }
  value+=theirs-mine;
  for(let at=0;at<24;at++) {
    if(s.points[at]*sign!==1)continue;
    // A lone checker can be hit by anything the opponent still has behind it.
    let risk=0;
    const shot=gap=>{risk+=gap<=6?(11+gap)/36:gap<=12?(13-gap)/72:0;};
    for(let from=0;from<24;from++) if(s.points[from]*sign<0) {
      const gap=foe===1?at-from:from-at;
      if(gap>0)shot(gap);
    }
    if(s.bar[foe])shot(foe===1?at+1:24-at);
    value-=Math.min(risk,.85)*((25-far(at,side))*.9+4);
  }
  return value+s.bar[foe]*(4+home*2)+s.off[side]*3;
}
function bgBot(s,side,level,quick) {
  if(!s.dice.length)return {roll:true};
  const opening=bgLegal(s);
  if(!opening.length)return {pass:true};
  if(opening.length===1||(level===0&&chance(.35)))return pick(opening);
  const limit=effort(level,quick,[150,500,1400,80]), noise=[6,1.5,0,1.5][quick?3:level];
  const seen=new Set();
  let top=-Infinity, choice=opening[0], visited=0;
  // Plays the remaining dice out and keeps the first step of the best final position.
  function explore(state,first) {
    const steps=visited<limit?[...new Set(state.dice)].flatMap(die=>bgSteps(state,die)):[];
    if(!steps.length) {
      const value=bgValue(state,side)+Math.random()*noise;
      if(value>top){top=value;choice=first;}
      return;
    }
    for(const step of steps) {
      const next=bgApply(state,step), key=next.points.join()+'/'+next.bar+'/'+next.off+'/'+next.dice;
      if(seen.has(key))continue;
      seen.add(key);
      visited++;
      explore(next,first);
    }
  }
  for(const step of opening)explore(bgApply(s,step),step);
  return {from:choice.from,to:choice.to,die:choice.die};
}

// ---- Battaglia navale ----------------------------------------------------------------------
function navalBot(s,side,level) {
  const size=s.size??10, fleetLengths=s.lengths??classicFleet, total=size*size;
  if(!s.fleets[side])return {ships:fleet(size,fleetLengths)};
  const shots=s.shots[side], fired=new Set(shots.map(shot=>shot.at));
  const water=new Set(shots.filter(shot=>!shot.hit).map(shot=>shot.at));
  const sunk=new Set(shots.flatMap(shot=>shot.sunk??[]));
  const wounded=new Set(shots.filter(shot=>shot.hit&&!sunk.has(shot.at)).map(shot=>shot.at));
  const afloat=fleetLengths.slice();
  for(const shot of shots) if(shot.sunk) {
    const index=afloat.indexOf(shot.sunk.length);
    if(index>=0)afloat.splice(index,1);
  }
  const open=Array.from({length:total},(_,at)=>at).filter(at=>!fired.has(at));
  if(level===0&&!wounded.size&&chance(.6))return {at:pick(open)};
  // Count, for every free cell, the ways the ships still afloat could lie across it.
  function density(chasing) {
    const weight=new Float64Array(total);
    for(const length of afloat) for(let at=0;at<total;at++) for(const vertical of [false,true]) {
      if(vertical?Math.floor(at/size)+length>size:at%size+length>size)continue;
      let hits=0, possible=true;
      for(let n=0;n<length&&possible;n++) {
        const cell=vertical?at+n*size:at+n;
        if(water.has(cell)||sunk.has(cell))possible=false;
        else if(wounded.has(cell))hits++;
      }
      if(!possible||(chasing&&!hits))continue;
      const gain=chasing?hits*hits*10:1;
      for(let n=0;n<length;n++) {
        const cell=vertical?at+n*size:at+n;
        if(!fired.has(cell))weight[cell]+=gain;
      }
    }
    return weight;
  }
  let weight=density(wounded.size>0);
  if(!open.some(at=>weight[at]>0))weight=density(false);
  return {at:best(open,at=>weight[at]+Math.random()*(level===2?.01:.6))};
}

// ---- Scopa -------------------------------------------------------------------------------
const cardRank=card=>card%10+1, cardSuit=card=>Math.floor(card/10);
function scopaBot(s,side,level) {
  const v=view(s,side), {hand,table}=v;
  const known=[...hand,...table,...v.captured[0],...v.captured[1]];
  const unseen=rank=>4-known.filter(card=>cardRank(card)===rank).length;
  // Settebello, denari and the cards that count for the primiera are worth holding.
  const worth=card=>1+(card===6?7:0)+(cardSuit(card)===0?1.3:0)+({7:2,6:1.2,1:1}[cardRank(card)]??.2);
  const lastPlay=v.remaining===0&&v.handCounts.every((n,seat)=>n===(seat===side?1:0));
  const options=hand.flatMap(card=>v.takes[card].map(take=>({card,take})));
  if(level===0&&chance(.35))return pick(options);
  return best(options,({card,take})=>{
    const left=take.length?table.filter(c=>!take.includes(c)):[...table,card];
    const sum=left.reduce((n,c)=>n+cardRank(c),0);
    let value=take.length?worth(card)+take.reduce((n,c)=>n+worth(c),0):-worth(card)*.8;
    if(take.length&&!left.length&&!lastPlay)value+=9;
    // A table that adds up to ten or less can be swept by one card.
    if(left.length&&sum<=10&&!lastPlay)value-=1.6*unseen(sum)+(take.length?0:1);
    if(!take.length&&hand.some(c=>c!==card&&cardRank(c)===cardRank(card)))value+=1.2;
    return value+Math.random()*(level===2?.05:.5);
  });
}

// ---- Briscola ----------------------------------------------------------------------------
const briscolaPower=[10,1,9,2,3,4,5,6,7,8], briscolaPoints=[11,0,10,0,0,0,0,2,3,4];
function briscolaBot(s,side,level) {
  const v=view(s,side), {hand,trick}=v, trump=cardSuit(v.trumpCard), count=v.handCounts.length;
  if(level===0&&chance(.35))return {card:pick(hand)};
  const power=(card,lead)=>cardSuit(card)===trump?10+briscolaPower[card%10]:cardSuit(card)===lead?briscolaPower[card%10]:0;
  const cost=card=>briscolaPoints[card%10]*1.5+(cardSuit(card)===trump?6+briscolaPower[card%10]*.6:briscolaPower[card%10]*.05);
  if(!trick.length)return {card:best(hand,card=>-cost(card)+Math.random()*.3)};
  const lead=cardSuit(trick[0].card), last=trick.length===count-1;
  const points=trick.reduce((n,p)=>n+briscolaPoints[p.card%10],0);
  const leader=trick.reduce((top,p)=>power(p.card,lead)>power(top.card,lead)?p:top);
  return {card:best(hand,card=>{
    const taking=power(card,lead)>power(leader.card,lead);
    const ours=taking||(count===4&&leader.side%2===side%2);
    const stake=points+briscolaPoints[card%10];
    // Before the last card the trick can still change hands.
    const sure=last?1:taking&&cardSuit(card)===trump?.8:.55;
    const spent=cardSuit(card)===trump?3+briscolaPoints[card%10]*.4+briscolaPower[card%10]*.3:briscolaPower[card%10]*.04;
    return (ours?stake*sure:-stake)-spent+Math.random()*(level===2?.05:.4);
  })};
}

// ---- UNO ---------------------------------------------------------------------------------
function unoBot(s,side,level) {
  const v=view(s,side), {hand,playable}=v;
  if(!playable.length)return v.drawn?{pass:true}:{draw:true};
  const seats=v.handCounts.length, next=(side+v.direction+seats)%seats, danger=v.handCounts[next]<=2;
  const colours=['R','B','G','Y'];
  const held=colour=>hand.filter(card=>card[0]===colour).length;
  const card=level===0&&chance(.4)?pick(playable):best(playable,card=>{
    const [colour,value]=card.split(':');
    let score=/^\d$/.test(value)?1+Number(value)/10:value==='two'?4:value==='four'?.8:value==='wild'?.5:3;
    if(colour!=='W')score+=held(colour)*.6;
    else if(hand.length<=3)score+=2.5;
    if(danger)score+=value==='four'?7:value==='two'?6:value==='skip'||(value==='reverse'&&seats===2)?5:0;
    return score+Math.random()*.3;
  });
  if(card[0]!=='W')return {card};
  const rest=hand.filter(c=>c!==card);
  return {card,color:best(colours,colour=>rest.filter(c=>c[0]===colour).length)};
}

// ---- Poker -------------------------------------------------------------------------------
const pokerRanks='23456789TJQKA';
// Rank of the best five cards among five to seven, as one comparable number.
export function holdemStrength(cards) {
  const counts=Array(15).fill(0), suits={S:[],C:[],D:[],H:[]};
  let all=0;
  for(const card of cards) {
    const rank=pokerRanks.indexOf(card[0])+2;
    counts[rank]++;
    suits[card[1]].push(rank);
    all|=1<<rank;
  }
  const straight=mask=>{
    if(mask&1<<14)mask|=2;
    for(let high=14;high>=5;high--)if((mask>>(high-4)&31)===31)return high;
    return 0;
  };
  const pack=(category,ranks)=>{
    let value=category;
    for(let i=0;i<5;i++)value=value*15+(ranks[i]??0);
    return value;
  };
  const flush=Object.values(suits).find(ranks=>ranks.length>=5);
  if(flush) {
    const high=straight(flush.reduce((mask,rank)=>mask|1<<rank,0));
    if(high)return pack(8,[high]);
  }
  const fours=[], threes=[], pairs=[], singles=[];
  for(let rank=14;rank>=2;rank--) {
    const n=counts[rank];
    if(n)(n===4?fours:n===3?threes:n===2?pairs:singles).push(rank);
  }
  if(fours.length)return pack(7,[fours[0],Math.max(0,...threes,...pairs,...singles)]);
  if(threes.length&&(threes.length>1||pairs.length))return pack(6,[threes[0],Math.max(threes[1]??0,pairs[0]??0)]);
  if(flush)return pack(5,flush.slice().sort((a,b)=>b-a));
  const high=straight(all);
  if(high)return pack(4,[high]);
  if(threes.length)return pack(3,[threes[0],...[...pairs,...singles].sort((a,b)=>b-a)]);
  if(pairs.length>=2)return pack(2,[pairs[0],pairs[1],Math.max(pairs[2]??0,singles[0]??0)]);
  if(pairs.length)return pack(1,[pairs[0],...singles]);
  return pack(0,singles);
}
function shuffleFront(deck,count) {
  for(let i=0;i<count;i++) {
    const j=i+Math.floor(Math.random()*(deck.length-i));
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
}
// Share of random deals in which the hand beats every opponent still in.
function pokerEquity(s,hand,opponents,samples) {
  const italian=s.id==='poker-italiano', known=new Set([...hand,...s.board]);
  const deck=[...'SCDH'].flatMap(suit=>[...pokerRanks.slice(s.lowest-2)].map(rank=>rank+suit)).filter(card=>!known.has(card));
  const own=italian?pokerHand(hand,s.lowest,true).score:null, missing=5-s.board.length, each=italian?5:2;
  let won=0;
  for(let n=0;n<samples;n++) {
    const need=(italian?0:missing)+opponents*each;
    if(need>deck.length)break;
    shuffleFront(deck,need);
    let at=0, result=1;
    const board=italian?[]:[...s.board,...deck.slice(0,at=missing)];
    const mine=italian?0:holdemStrength([...hand,...board]);
    for(let o=0;o<opponents&&result;o++) {
      const cards=deck.slice(at,at+=each);
      const gap=italian?compareHands(pokerHand(cards,s.lowest,true).score,own):holdemStrength([...cards,...board])-mine;
      if(gap>0)result=0;
      else if(gap===0)result=.5;
    }
    won+=result;
  }
  return won/samples;
}
// Cards to change in the draw: keep what is made, or the best start of a hand.
function pokerDiscards(hand) {
  const rank=card=>pokerRanks.indexOf(card[0]), byRank={}, bySuit={};
  for(const card of hand){(byRank[card[0]]??=[]).push(card);(bySuit[card[1]]??=[]).push(card);}
  const groups=Object.values(byRank).sort((a,b)=>b.length-a.length||rank(b[0])-rank(a[0]));
  const values=[...new Set(hand.map(rank))].sort((a,b)=>a-b);
  const flush=Object.values(bySuit).some(cards=>cards.length===5);
  const straight=values.length===5&&values[4]-values[0]===4;
  if(flush||straight||(groups[0].length===3&&groups[1]?.length===2)||groups[0].length===4)return [];
  if(groups[0].length>=2) {
    const keep=new Set(groups.filter(g=>g.length>=2).flat());
    return hand.filter(card=>!keep.has(card));
  }
  const suited=Object.values(bySuit).find(cards=>cards.length===4);
  if(suited)return hand.filter(card=>!suited.includes(card));
  for(let i=0;i+3<values.length;i++) if(values[i+3]-values[i]===3)
    return hand.filter(card=>rank(card)<values[i]||rank(card)>values[i+3]);
  const kept=hand.slice().sort((a,b)=>rank(b)-rank(a)).slice(0,2);
  return hand.filter(card=>!kept.includes(card));
}
function pokerBot(s,side,level,quick) {
  const v=view(s,side), legal=v.legal;
  if(legal.next)return {type:'next'};
  if(legal.draw!=null)return {type:'draw',cards:level===0&&chance(.3)?[]:pokerDiscards(v.hand).slice(0,legal.draw)};
  const rivals=s.folded.filter((out,seat)=>!out&&seat!==side).length;
  const samples=effort(level,quick,[60,140,320,40]);
  let equity=pokerEquity(s,v.hand,Math.min(rivals,4),samples)+(Math.random()-.5)*[.3,.08,.06,.08][quick?3:level];
  const owed=legal.call??0, pot=v.pot, bet=Math.max(...v.bets), stack=v.stacks[side];
  const canRaise=Number.isInteger(legal.minRaiseTo);
  const raise=share=>({type:'raise',to:clamp(Math.round(bet+Math.max(2,pot*share)),legal.minRaiseTo,legal.maxRaiseTo)});
  // A strong hand against one player is an ordinary one against four.
  const strong=[0,.66,.52,.43,.37][Math.min(rivals,4)]??.37;
  const pushed=s.lastAggressor===side;
  if(!owed) {
    if(canRaise&&equity>strong)return raise(equity>strong+.2?.75:.5);
    if(canRaise&&level>0&&chance(level===2?.09:.06))return raise(.5);
    return {type:'check'};
  }
  // A small call into a pot shared by many is worth more than its bare odds.
  const price=owed/(pot+owed)*(owed<=Math.max(2,stack*.04)?.55:1)+(owed>stack*.5?.12:.04);
  if(canRaise&&equity>strong+.14&&(!pushed||equity>.9)&&chance(.65))return raise(equity>.85?1:.6);
  if(equity>=price||(level===0&&chance(.3)))return {type:'call'};
  return {type:'fold'};
}

function memoryBot(game,side,level) {
  const {cards}=view(game,side);
  const down=cards.flatMap((card,at)=>card.state==='down'?[at]:[]);
  const up=cards.find(card=>card.state==='up');
  const remembered=game.observations.slice(-[3,9,24][level]).filter(card=>down.includes(card.at));
  if(up) {
    const mate=remembered.find(card=>card.picture===up.picture);
    if(mate)return {at:mate.at};
  } else {
    const pair=remembered.find(card=>remembered.some(other=>other.at!==card.at&&other.picture===card.picture));
    if(pair)return {at:pair.at};
  }
  const unseen=down.filter(at=>!remembered.some(card=>card.at===at));
  return {at:pick(unseen.length?unseen:down)};
}

// ---- Entry points --------------------------------------------------------------------------
const strategies={chess:chessBot,dama:damaBot,reversi:reversiBot,tris:trisBot,four:fourBot,nim:nimBot,dots:dotsBot,go:goBot,
  backgammon:bgBot,naval:navalBot,scopa:scopaBot,briscola:briscolaBot,uno:unoBot,'poker-italiano':pokerBot,'texas-holdem':pokerBot,memory:memoryBot};
// An action that is certainly legal, chosen without thinking.
export function anyAction(game,side) {
  const v=view(game,side);
  switch(game.id) {
    case 'memory': return {at:pick(v.cards.flatMap((card,at)=>card.state==='down'?[at]:[]))};
    case 'chess': {const {from,to,promote}=pick(available(game));return promote?{from,to,promote}:{from,to};}
    case 'dama': return {path:pick(available(game)).path};
    case 'reversi': case 'tris': case 'four': return {at:pick(available(game)).at};
    case 'nim': {const pile=game.piles.findIndex(Boolean);return {pile,count:1};}
    case 'dots': return {edge:game.edges.indexOf(0)};
    case 'go': return v.moves.length?{at:pick(v.moves)}:{pass:true};
    case 'backgammon': return !game.dice.length?{roll:true}:v.moves.length?pick(v.moves):{pass:true};
    case 'naval': {
      if(!game.fleets[side])return {ships:fleet(game.size??10,game.lengths??classicFleet)};
      const fired=new Set(game.shots[side].map(shot=>shot.at)), size=game.size??10;
      return {at:pick(Array.from({length:size*size},(_,at)=>at).filter(at=>!fired.has(at)))};
    }
    case 'scopa': return {card:v.hand[0],take:v.takes[v.hand[0]][0]};
    case 'briscola': return {card:v.hand[0]};
    case 'uno': {
      if(!v.playable.length)return v.drawn?{pass:true}:{draw:true};
      const card=v.playable[0];
      return card[0]==='W'?{card,color:'R'}:{card};
    }
    default: {
      const legal=v.legal;
      return legal.next?{type:'next'}:legal.draw!=null?{type:'draw',cards:[]}:legal.check?{type:'check'}:legal.call?{type:'call'}:{type:'fold'};
    }
  }
}
// The action a computer player takes for `side`. The seat must be the one to act.
export function botAction(game,side,{level=1,quick=false}={}) {
  return strategies[game.id](game,side,[0,1,2].includes(level)?level:1,quick);
}
// Names for the computer seats: one opponent is simply the computer, a full table gets names.
const botNames=['Ada','Leonardo','Ipazia','Galileo','Artemisia','Fibonacci','Rita','Marconi','Volta'];
export const botName=(index,count)=>count===1?'Computer':botNames[index%botNames.length];
