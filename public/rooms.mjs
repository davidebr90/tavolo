const keyPattern=/^tavolo:([a-f0-9]{24})$/;
export function savedSeats() {
  const rooms=[];
  for(let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i), code=keyPattern.exec(key)?.[1];
    if(code) rooms.push({code,token:localStorage.getItem(key)});
  }
  return rooms;
}
export const isTeamRoom=room=>room.maxPlayers===4&&['scopa','briscola'].includes(room.game.id);
export const comparingMemory=game=>game.id==='memory'&&game.phase==='compare';
export function tiedLeaders({game,players}) {
  if(game.id==='memory'&&game.result==='draw'&&game.winners?.length<players.length)return game.winners;
  return null;
}

export function roomStatus(state) {
  const {game,players,side}=state;
  if(state.closed) return {label:'Partita chiusa',tone:'done'};
  const leaders=tiedLeaders(state);
  if(leaders) {
    const label=state.spectator?'Primi a pari merito':leaders.includes(side)?'Primo a pari merito':'Partita conclusa';
    return {label,tone:'done'};
  }
  if(game.result!==null) return {label:game.result==='draw'?'Pareggio':game.result===(isTeamRoom(state)?side%2:side)?'Hai vinto':'Partita conclusa',tone:'done'};
  if(state.closeRequest!=null) return state.closeRequest===side
    ? {label:'Chiusura in attesa',tone:'waiting'} : {label:'Rispondi alla chiusura',tone:'your'};
  if(players.length<(state.maxPlayers??2)) return {label:'In attesa',tone:'waiting'};
  if(comparingMemory(game))return {label:'Confronto delle carte',tone:'waiting'};
  if(game.id==='naval'&&!game.ready.every(Boolean)) return game.ready[side]
    ? {label:'Attesa flotta',tone:'waiting'} : {label:'Schiera la flotta',tone:'your'};
  return game.turn===side?{label:'Tocca a te',tone:'your'}:{label:'Turno avversario',tone:'other'};
}
export function lastChessMove(game) {
  const {from,to,castle,promote}=game.last??{};
  if(![from,to].every(square=>Number.isInteger(square)&&square>=0&&square<64))return null;
  if(castle)return castle===1?'O-O':'O-O-O';
  const square=i=>'abcdefgh'[i%8]+(8-(i>>3));
  return square(from)+' → '+square(to)+(promote?' = '+promote.toUpperCase():'');
}
export function chatEntries(state) {
  const chat=state.chat??[], offset=(state.chatVersion??chat.length)-chat.length;
  return chat.map((message,index)=>({...message,sequence:offset+index+1}));
}
export function unreadChat(state,cursor=0) {
  return chatEntries(state).filter(message=>(state.spectator||message.side!==state.side)&&message.sequence>cursor);
}
export function roomTransport(config) {
  return ['sse','poll'].includes(config?.transport)?'poll':'ws';
}
export function watchRoom(room,transport,receive,fetchState,{interval=5000,onError=()=>{}}={}) {
  let socket, timer, retry=500, closed=false, handshake, reconnect;
  let polling=false, received=false, needsResync=false;
  function deliver(state) {
    const update={reconnect:needsResync};
    received=true;
    needsResync=false;
    receive(state,update);
  }
  async function poll() {
    if(closed||ready||polling)return;
    polling=true;
    try {
      const state=await fetchState();
      if(!closed&&!ready)deliver(state);
    } catch(error) {
      if(!closed&&!ready)onError(error);
    } finally {
      polling=false;
    }
    if(!closed&&!ready) {
      clearTimeout(timer);
      timer=setTimeout(poll,interval);
    }
  }
  let ready=false;
  if(transport==='poll') {
    timer=setTimeout(poll,interval);
    return ()=>{closed=true;clearTimeout(timer);};
  }
  function connect() {
    if(closed)return;
    const address=new URL('/api/rooms/'+room.code+'/live',location.href);
    address.protocol=location.protocol==='https:'?'wss:':'ws:';
    socket=new WebSocket(address);
    handshake=setTimeout(()=>socket.close(),8000);
    socket.onopen=()=>socket.send(room.token);
    socket.onmessage=e=>{
      if(closed)return;
      clearTimeout(handshake);
      ready=true;
      retry=500;
      clearTimeout(timer);
      deliver(JSON.parse(e.data));
    };
    socket.onclose=()=>{
      clearTimeout(handshake);
      if(ready||!received)needsResync=true;
      ready=false;
      if(closed)return;
      clearTimeout(timer);
      timer=setTimeout(poll,1000);
      reconnect=setTimeout(connect,retry);
      retry=Math.min(retry*2,30000);
    };
  }
  connect();
  return ()=>{
    closed=true;
    clearTimeout(timer);
    clearTimeout(handshake);
    clearTimeout(reconnect);
    socket?.close();
  };
}
