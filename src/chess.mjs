const inside = (r,c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const own = (p, side) => p && (p === p.toUpperCase()) === (side === 0);
const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const knights = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const initial = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';

function attack(board, at, side) {
  const row = at >> 3, col = at % 8;
  const signal = (r,c,p) => inside(r,c) && board[r*8+c] === (side === 0 ? p.toUpperCase() : p);
  if (knights.some(([r,c]) => signal(row+r,col+c,'n'))) return true;
  if ([-1,1].some(c => signal(row+(side === 0 ? 1 : -1),col+c,'p'))) return true;
  for (const [r,c] of directions) {
    for (let n=1; inside(row+n*r,col+n*c); n++) {
      const p = board[(row+n*r)*8+col+n*c];
      if (!p) continue;
      if (own(p,side) && ('q'+(r && c ? 'b' : 'r')+(n===1?'k':'')).includes(p.toLowerCase())) return true;
      break;
    }
  }
  return false;
}
export function checked(board,side) {
  return attack(board,board.indexOf(side === 0 ? 'K' : 'k'),1-side);
}
function apply(s,m) {
  const {from,to,promote,castle,ep} = m;
  const board = s.board.slice(), piece = board[from], target = board[to];
  let rights = s.rights;
  if (piece.toLowerCase() === 'k') rights &= s.turn === 0 ? 12 : 3;
  for (const [i,bit] of [[63,1],[56,2],[7,4],[0,8]]) if (from===i || to===i) rights &= ~bit;
  board[from]='';
  board[to]=promote ? (s.turn===0 ? promote.toUpperCase() : promote) : piece;
  if (ep) board[(from & ~7) + to%8]='';
  if (castle) {
    const rook = castle===1 ? from+3 : from-4;
    board[from+castle]=board[rook];
    board[rook]='';
  }
  const pawn=piece.toLowerCase()==='p';
  return {...s,board,rights,ep:pawn && Math.abs(to-from)===16 ? (to+from)/2 : -1,
    quiet:pawn || target ? 0 : s.quiet+1,turn:1-s.turn};
}
export function chessMoves(s) {
  const { board, turn } = s, enemy=1-turn, moves=[];
  for (let from=0;from<64;from++) {
    const piece=board[from];
    if (!own(piece,turn)) continue;
    const type=piece.toLowerCase(), row=from>>3,col=from%8;
    const add=(to,extra={})=>{
      if (type==='p' && (to<8 || to>=56)) {
        for (const promote of 'qrbn') moves.push({from,to,promote});
      } else moves.push({from,to,...extra});
    };
    if (type==='p') {
      const d=turn===0?-1:1;
      const ahead=from+d*8;
      if (!board[ahead]) {
        add(ahead);
        if (row===(turn===0?6:1) && !board[ahead+d*8]) add(ahead+d*8);
      }
      for (const c of [col-1,col+1]) if (inside(row+d,c)) {
        const to=(row+d)*8+c;
        if (own(board[to],enemy)) add(to);
        else if (to===s.ep) add(to,{ep:true});
      }
      continue;
    }
    for (const [dr,dc] of type==='n'?knights:directions) {
      if ((type==='r' && dr && dc) || (type==='b' && (!dr || !dc))) continue;
      const limit='nk'.includes(type)?1:7;
      for(let n=1;n<=limit && inside(row+n*dr,col+n*dc);n++) {
        const to=(row+n*dr)*8+col+n*dc;
        if (own(board[to],turn)) break;
        add(to);
        if (board[to]) break;
      }
    }
    if (type==='k' && from===(turn===0?60:4) && !attack(board,from,enemy)) {
      for (const [d,bit] of [[1,1],[-1,2]]) {
        const rook=from+(d===1?3:-4);
        const clear=Array.from({length:Math.abs(rook-from)-1},(_,i)=>from+(i+1)*d).every(i=>!board[i]);
        if ((s.rights & (bit << (turn*2))) && clear && !checked(apply(s,{from,to:from+d}).board,turn)) add(from+2*d,{castle:d});
      }
    }
  }
  return moves.filter(m=>!checked(apply(s,m).board,turn));
}
function position(s,moves) {
  return [s.board.map(p=>p||'.').join(''),s.turn,s.rights,moves.some(m=>m.ep)?s.ep:-1].join('/');
}
export function canClaimDraw(s,moves=chessMoves(s)) {
  return s.result===null && (s.quiet>=100 || s.seen[position(s,moves)]>=3);
}
export function chessStart() {
  const s={id:'chess',board:Array.from(initial,p=>p==='.'?'':p),turn:0,rights:15,ep:-1,quiet:0,result:null,seen:{},history:[]};
  s.seen[position(s,[])]=1;
  return s;
}
export function chessNotation(s,move,legal,inCheck,mate) {
  const suffix=mate?'#':inCheck?'+':'';
  if(move.castle)return (move.castle===1?'O-O':'O-O-O')+suffix;
  const piece=s.board[move.from].toLowerCase();
  const file=i=>'abcdefgh'[i%8];
  const rank=i=>8-(i>>3);
  const capture=Boolean(s.board[move.to]||move.ep);
  let origin='';
  if(piece==='p')origin=capture?file(move.from):'';
  else {
    const rivals=legal.filter(m=>m.to===move.to&&m.from!==move.from&&s.board[m.from]===s.board[move.from]);
    if(rivals.length) {
      if(rivals.every(m=>file(m.from)!==file(move.from)))origin=file(move.from);
      else if(rivals.every(m=>rank(m.from)!==rank(move.from)))origin=rank(move.from);
      else origin=file(move.from)+rank(move.from);
    }
  }
  return (piece==='p'?'':piece.toUpperCase())+origin+(capture?'x':'')+file(move.to)+rank(move.to)+
    (move.promote?'='+move.promote.toUpperCase():'')+suffix;
}
function capturedPiece(s,m) {
  return s.board[m.ep?(m.from&~7)+m.to%8:m.to];
}
// Older rooms only stored SAN. Replay a complete score to recover the actual
// victims, including promoted pieces. A partial score has no known starting board.
function replayCaptures(history,game) {
  let replay=chessStart();
  const taken=[];
  for(const entry of history) {
    const san=entry.san.replace(/[+#]$/,'');
    const legal=chessMoves(replay);
    const move=legal.find(m=>chessNotation(replay,m,legal,false,false)===san);
    if(!move)return null;
    taken.push(capturedPiece(replay,move));
    replay=apply(replay,move);
  }
  return replay.turn===game.turn&&replay.board.every((p,i)=>p===game.board[i])?taken:null;
}
const legacyCaptures=new Map();
export function chessHistory(s) {
  const history=s.history??[];
  if(!history.some(entry=>!entry.captured&&entry.san.includes('x'))||
    !history.every((entry,i)=>entry.ply===i+1))return history;
  // Views for players, spectators and reconnects can read the same legacy room
  // before its next move persists the upgraded history.
  const key=[s.board.map(p=>p||'.').join(''),s.turn,...history.map(entry=>entry.san)].join(' ');
  if(!legacyCaptures.has(key)) {
    if(legacyCaptures.size>=16)legacyCaptures.delete(legacyCaptures.keys().next().value);
    legacyCaptures.set(key,replayCaptures(history,s));
  }
  const taken=legacyCaptures.get(key);
  return taken?history.map((entry,i)=>taken[i]&&!entry.captured?{...entry,captured:taken[i]}:entry):history;
}
function dead(board) {
  const pieces=board.flatMap((p,i)=>p && p.toLowerCase()!=='k' ? [[p.toLowerCase(),(i%8+(i>>3))%2]] : []);
  return pieces.length===0 || (pieces.length===1 && 'bn'.includes(pieces[0][0])) ||
    pieces.every(([p,color])=>p==='b' && color===pieces[0][1]);
}
export function chessPlay(s, action) {
  if (action.draw) {
    if (canClaimDraw(s)) return {...s,result:'draw'};
    throw new Error('La richiesta di patta non è disponibile.');
  }
  const legal=chessMoves(s);
  const m=legal.find(m=>m.from===action.from && m.to===action.to && m.promote===action.promote);
  if (!m) throw new Error('Mossa non valida.');
  const next=apply(s,m), moves=chessMoves(next), key=position(next,moves);
  next.seen={...s.seen,[key]:(s.seen[key]||0)+1};
  next.last=m;
  if (!moves.length) next.result=checked(next.board,next.turn)?s.turn:'draw';
  else if (dead(next.board) || next.quiet>=150 || next.seen[key]>=5) next.result='draw';
  const inCheck=checked(next.board,next.turn);
  const last=s.history?.at(-1);
  const ply=last?last.ply+1:Object.values(s.seen).reduce((sum,n)=>sum+n,0);
  const captured=capturedPiece(s,m);
  next.history=[...chessHistory(s),{ply,san:chessNotation(s,m,legal,inCheck,inCheck&&!moves.length),...(captured?{captured}:{})}];
  return next;
}
// The computer player searches positions without the bookkeeping of a played move.
export { apply as chessApply };
