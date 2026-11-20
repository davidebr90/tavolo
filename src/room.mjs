import { start, play, view } from './games.mjs';
import { parseChat } from '../public/chat-format.mjs';
// A room lives for a week after its last move, join or message.
export const sessionLifetime=7*24*60*60*1000;
const capacity=room=>room.game.hands?.length??2;
export function create(game,name,token,options,markup,roomName) {
  const createdAt=Date.now();
  return {game:start(game,options),players:[{name,token,markup}],version:0,receipts:{},roomName,options:options??null,createdAt,updatedAt:createdAt};
}
// Options to start the same kind of game again, also for rooms created before they were stored.
function restartOptions(room) {
  if(room.options)return room.options;
  const g=room.game;
  if(g.id==='naval')return {size:g.size??10,ships:g.lengths?.length??5};
  if(g.hands)return {players:g.hands.length};
  return undefined;
}
// Every player must ask. Then the seats rotate, so whoever moved second now moves first.
function rematch(room,side) {
  if(room.closed||room.game.result===null) throw Error('La rivincita è disponibile a partita conclusa.');
  const asked=new Set(room.rematch??[]);
  asked.add(side);
  if(asked.size<room.players.length) {room.rematch=[...asked].sort();return false;}
  const seats=room.players.length;
  room.players.push(room.players.shift());
  for(const message of room.chat??[]) message.side=(message.side+seats-1)%seats;
  room.game=start(room.game.id,restartOptions(room));
  room.rematch=[];
  room.moved=room.players.map(()=>false);
  room.closeRequest=null;
  room.games=(room.games??1)+1;
  return true;
}
function seat(room,token) {
  if(typeof token!=='string'||!token) throw new Error('Accesso alla stanza non valido.');
  const side=room.players.findIndex(p=>p.token===token);
  if(side<0) throw new Error('Accesso alla stanza non valido.');
  return side;
}
export function join(room,name,token,markup) {
  if(room.players.some(p=>p.token===token)) return false;
  if(room.closed) throw Error('La partita è stata chiusa.');
  if(room.players.length>=capacity(room)) throw new Error('La stanza è già al completo.');
  room.players.push({name,token,markup});
  room.version++;
  return true;
}
export function renameSeat(room,token,name,markup) {
  const side=seat(room,token), player=room.players[side];
  if(player.name===name&&player.markup===markup)return false;
  for(const message of room.chat??[]) if(message.side===side&&!message.author) {
    message.author=player.name;
    message.authorMarkup=player.markup;
  }
  player.name=name;
  player.markup=markup;
  room.chatVersion??=0;
  room.version++;
  return true;
}
function movedSeats(room) {
  return room.moved??room.players.map((_,side)=>Object.keys(room.receipts).some(key=>key.startsWith(side+':')));
}
function closeRoom(room,side,command) {
  if(command==='request') {
    if(room.closeRequest!=null) throw Error('C’è già una richiesta di chiusura.');
    if(!room.moved.some((value,i)=>value&&i!==side)) room.closed=true;
    else room.closeRequest=side;
    return;
  }
  if(room.closeRequest==null || room.closeRequest===side || !['accept','decline'].includes(command))
    throw Error('Non hai una richiesta di chiusura a cui rispondere.');
  room.closed=command==='accept';
  room.closeRequest=null;
}
export function submit(room,token,message) {
  const side=seat(room,token);
  if(typeof message?.id!=='string'||!/^[\w-]{1,80}$/.test(message.id)) throw new Error('Identificativo mossa non valido.');
  const key=side+':'+message.id;
  if(Object.hasOwn(room.receipts,key)) return false;
  if(message.version!==room.version) throw new Error('La partita è cambiata. Riprova.');
  const action=message.action;
  if(action?.rematch===true) {
    const restarted=rematch(room,side);
    room.version++;
    room.receipts[key]=room.version;
    // After the seats rotate, a retry of this request arrives from the new seat.
    if(restarted) room.receipts[seat(room,token)+':'+message.id]=room.version;
    return true;
  }
  if(room.closed || room.game.result!==null) throw Error('La partita è terminata.');
  const moved=movedSeats(room);
  if(action?.close) {
    room.moved=moved;
    closeRoom(room,side,action.close);
  } else {
    if(room.players.length!==capacity(room)) throw Error('La partita attende tutti i giocatori.');
    if(action?.resign) throw Error('Usa il comando Chiudi partita.');
    room.game=play(room.game,action,side);
    room.moved=moved;
    room.moved[side]=true;
    if(room.game.result!==null) room.closeRequest=null;
  }
  room.version++;
  room.receipts[key]=room.version;
  return true;
}
export function snapshot(room,token) {
  const side=seat(room,token);
  const maxPlayers=capacity(room), game=view(room.game,side);
  if(room.players.length<maxPlayers&&Array.isArray(game.hand)) {
    // A seat sees the intact pack until the last player joins.
    game.awaitingDeal=true;
    if('remaining' in game)game.remaining+=game.handCounts.reduce((a,b)=>a+b,0)+(game.table?.length??(game.id==='uno'?1:0));
    if('table' in game)game.table=[];
    if('top' in game){game.top='';game.color='';}
    if('trumpCard' in game)game.trumpCard=null;
    game.hand=[];
    game.handCounts=Array(maxPlayers).fill(0);
    if('opponentCount' in game)game.opponentCount=0;
    if('legal' in game)game.legal={};
    if('takes' in game)game.takes={};
    if('playable' in game)game.playable=[];
  }
  return {side,maxPlayers,players:room.players.map(p=>p.name),playerMarkup:room.players.map(p=>p.markup??null),version:room.version,game,chat:room.chat??[],chatVersion:room.chatVersion??0,
    roomName:room.roomName??null,createdAt:room.createdAt??null,rematch:room.rematch??[],games:room.games??1,
    closed:room.closed===true,closeRequest:room.closeRequest??null,requiresConsent:movedSeats(room).some((value,i)=>value&&i!==side)};
}
export function chat(room,token,data) {
  const side=seat(room,token), text=typeof data?.text==='string'?data.text.trim():'';
  const formatted=data?.format==='basic';
  const visible=formatted&&text.length<=1600?parseChat(text).text.trim():text;
  if(room.closed) throw Error('La partita è stata chiusa.');
  if(room.players.length<2||!visible||visible.length>280||text.length>1600) throw Error('Scrivi un messaggio da 1 a 280 caratteri con entrambi i giocatori in stanza.');
  if(typeof data.id!=='string'||!/^[a-f0-9]{32}$/.test(data.id)) throw Error('Messaggio non valido.');
  const messages=room.chat??[], last=messages.findLast(m=>m.side===side);
  if(messages.some(m=>m.side===side&&m.id===data.id)) return false;
  const now=Date.now();
  if(last&&now-last.at<700) throw Error('Attendi un istante prima di inviare un altro messaggio.');
  const {name:author,markup:authorMarkup}=room.players[side];
  room.chat=[...messages,{id:data.id,text,side,at:now,author,authorMarkup,...(formatted?{format:'basic'}:{})}].slice(-50);
  room.chatVersion=(room.chatVersion??0)+1;
  return true;
}
