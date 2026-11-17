import { start, play, view } from './games.mjs';
import { parseChat } from '../public/chat-format.mjs';
export const sessionLifetime=24*60*60*1000;
export function create(game,name,token,options,markup,roomName) {
  const createdAt=Date.now();
  return {game:start(game,options),players:[{name,token,markup}],version:0,receipts:{},roomName,createdAt,updatedAt:createdAt};
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
  if(room.players.length===2) throw new Error('La stanza è già al completo.');
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
  return room.moved??[0,1].map(side=>Object.keys(room.receipts).some(key=>key.startsWith(side+':')));
}
function closeRoom(room,side,command) {
  if(command==='request') {
    if(room.closeRequest!=null) throw Error('C’è già una richiesta di chiusura.');
    if(!room.moved[1-side]) room.closed=true;
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
  if(room.closed || room.game.result!==null) throw Error('La partita è terminata.');
  const action=message.action;
  const moved=movedSeats(room);
  if(action?.close) {
    room.moved=moved;
    closeRoom(room,side,action.close);
  } else {
    if(room.players.length!==2) throw Error('La partita attende il secondo giocatore.');
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
  return {side,players:room.players.map(p=>p.name),playerMarkup:room.players.map(p=>p.markup??null),version:room.version,game:view(room.game,side),chat:room.chat??[],chatVersion:room.chatVersion??0,
    roomName:room.roomName??null,createdAt:room.createdAt??null,
    closed:room.closed===true,closeRequest:room.closeRequest??null,requiresConsent:movedSeats(room)[1-side]};
}
export function chat(room,token,data) {
  const side=seat(room,token), text=typeof data?.text==='string'?data.text.trim():'';
  const formatted=data?.format==='basic';
  const visible=formatted&&text.length<=1600?parseChat(text).text.trim():text;
  if(room.closed) throw Error('La partita è stata chiusa.');
  if(room.players.length!==2||!visible||visible.length>280||text.length>1600) throw Error('Scrivi un messaggio da 1 a 280 caratteri con entrambi i giocatori in stanza.');
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
