// Live figures shown next to each player and short notes under the banner.
// Pure functions on the room snapshot: nothing here touches the DOM.

const chessValue={p:1,n:3,b:3,r:5,q:9};
const chessStart={p:8,n:2,b:2,r:2,q:1};
const chessOrder='qrbnp';

// Pieces each side has captured, strongest first, and the material balance for White.
export function chessMaterial(board) {
  const count=white=>Object.fromEntries(Object.keys(chessStart).map(type=>[type,board.filter(p=>p===(white?type.toUpperCase():type)).length]));
  const pieces=[count(true),count(false)];
  const taken=side=>chessOrder.split('').flatMap(type=>Array(Math.max(0,chessStart[type]-pieces[1-side][type])).fill(side===0?type:type.toUpperCase()));
  const value=side=>Object.entries(pieces[side]).reduce((sum,[type,n])=>sum+chessValue[type]*n,0);
  return {captured:[taken(0),taken(1)],balance:value(0)-value(1)};
}

export const discCount=board=>[1,2].map(p=>board.filter(v=>v===p).length);

export function damaCount(board) {
  return [0,1].map(side=>({men:board.filter(v=>v===side+1).length,kings:board.filter(v=>v===side+3).length}));
}

// Pips each side still has to travel: light moves towards point 1, dark towards point 24.
export function pipCount(points,bar) {
  const pips=[bar[0]*25,bar[1]*25];
  points.forEach((v,i)=>{
    if(v>0)pips[0]+=v*(i+1);
    if(v<0)pips[1]+=-v*(24-i);
  });
  return pips;
}

export function shipsAfloat(lengths,shots) {
  const sunk=new Set((shots??[]).filter(shot=>shot.sunk?.length).map(shot=>shot.sunk.slice().sort((a,b)=>a-b).join()));
  return lengths.length-sunk.size;
}

const boxEdges=Array.from({length:9},(_,i)=>{
  const r=Math.floor(i/3), c=i%3;
  return [r*3+c,(r+1)*3+c,12+r*4+c,13+r*4+c];
});
// True when the last edge closed a box, so the same player moves again.
export function dotsBonus(g) {
  const edge=g.last?.edge;
  return Number.isInteger(edge)&&g.result===null&&boxEdges.some((edges,i)=>edges.includes(edge)&&g.boxes[i]===g.turn+1);
}

const plural=(n,one,many)=>n+' '+(n===1?one:many);

// Short figure for a seat chip. Returns '' when the game has nothing useful to add.
export function seatStat(room,seat) {
  const g=room.game;
  switch(g.id) {
    case 'chess': {
      const {balance}=chessMaterial(g.board), lead=seat===0?balance:-balance;
      return lead>0?'+'+lead+' materiale':'';
    }
    case 'reversi': case 'go': return plural(discCount(g.board)[seat],g.id==='go'?'pietra':'disco',g.id==='go'?'pietre':'dischi');
    case 'dama': {
      const {men,kings}=damaCount(g.board)[seat];
      return plural(men,'pedina','pedine')+(kings?' · '+plural(kings,'dama','dame'):'');
    }
    case 'dots': return plural(g.counts?.[seat]??0,'quadrato','quadrati');
    case 'backgammon': return 'Pip '+pipCount(g.points,g.bar)[seat]+(g.off[seat]?' · fuori '+g.off[seat]:'');
    case 'naval': {
      if(!g.ready.every(Boolean))return g.ready[seat]?'Flotta pronta':'';
      const shots=seat===room.side?g.incoming:g.outgoing;
      return 'A galla '+shipsAfloat(g.lengths,shots)+'/'+g.lengths.length;
    }
  }
  return '';
}

// Situations worth spelling out under the banner, for the player who must act.
export function turnNotes(room,acting) {
  const g=room.game, notes=[];
  if(g.result!==null)return notes;
  if(g.id==='dama'&&acting&&g.moves?.some(m=>m.taken?.length)) {
    const most=Math.max(...g.moves.map(m=>m.taken.length));
    notes.push('Presa obbligatoria: devi catturare '+(most===1?'un pezzo':most+' pezzi')+'. Sono evidenziati solo i pezzi che possono farlo.');
  }
  if(g.id==='dots'&&dotsBonus(g))notes.push((g.turn===room.side?'Hai':room.players[g.turn]+' ha')+' chiuso un quadrato: '+(g.turn===room.side?'giochi':'gioca')+' ancora.');
  if(g.id==='backgammon'&&acting&&g.bar?.[room.side]&&g.dice.length)notes.push('Hai pedine sulla barra: devi farle rientrare prima di muovere le altre.');
  if(g.id==='backgammon'&&acting&&g.dice.length&&!g.moves.length)notes.push('Nessuna mossa possibile con questi dadi: passa il turno.');
  if(g.id==='go'&&g.last?.pass&&g.turn===room.side)notes.push('L’avversario ha passato. Se passi anche tu la partita finisce e si contano i punti.');
  if(g.id==='uno'&&acting&&g.drawn)notes.push('Puoi giocare la carta appena pescata oppure passare.');
  return notes;
}
