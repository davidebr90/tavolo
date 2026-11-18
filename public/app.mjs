import { guides } from './guides.mjs';
import { catalog } from './catalog.mjs';
import { savedSeats, roomStatus, roomTransport, watchRoom, chatEntries, unreadChat, lastChessMove } from './rooms.mjs';
import { icon } from './icons.mjs';
import { parseChat, chatColors, renderChatMessage } from './chat-format.mjs';
import { cardKey, cardSvg, loadDeck, scopaDecks } from './card-art.mjs';

const app=document.querySelector('#app'), modal=document.querySelector('#modal'), joinButton=document.querySelector('#join-room');
const codePattern=/^[a-f0-9]{24}$/;
const codeParam=new URLSearchParams(location.search).get('stanza');
let code=codePattern.test(codeParam)?codeParam:null, token=code?localStorage.getItem('tavolo:'+code):null;
let state, tab='play', navalView='target', prefix=[], drawnVersion=-1, connected=false, pending=null, busy=false, draft=[], editingShip=null, anchor=null, vertical=false;
let toastTimer, stopLive, restoring=false, restoreError='', expired=false, transport='ws';
const seenRooms=new Map(), monitors=new Map(), unavailable=new Set();
const closingRooms=new Set();
let chatOpen=false, chatDraft='', selectedCard=null, hoverAt=null, drag=null;
const compactRoom=matchMedia('(max-width: 900px)');
let movesOpen=!compactRoom.matches;
const chatCursor=room=>Number(localStorage.getItem('tavolo:chat-read:'+room))||0;
const unreadCount=(room,s)=>unreadChat(s,chatCursor(room)).length;
function markChatRead() {
  if(chatOpen&&state&&!document.hidden) localStorage.setItem('tavolo:chat-read:'+code,Math.max(chatCursor(code),state.chatVersion??state.chat?.length??0));
}
function chatLabel(s) {
  const count=unreadCount(code,s);
  return icon('chat')+'Chat'+(count?'<span class="unread-pill" aria-label="'+count+' messaggi non letti">'+count+'</span>':'');
}
let boardDrag=null, ignoreClick=false;
let cardGesture=null;
let scopaDeck=localStorage.getItem('tavolo:scopa-deck');
if(!Object.hasOwn(scopaDecks,scopaDeck))scopaDeck='napoletane';
const deckCache=new Map();
const sizes=()=>game()?.lengths??[5,4,3,3,2];
const seaSize=()=>game()?.size??10;
const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const coord=(i,width)=>String.fromCharCode(65+i%width)+(Math.floor(i/width)+1);
const square=i=>String.fromCharCode(97+i%8)+(8-(i>>3));
const pieceLabel={k:'re',q:'donna',r:'torre',b:'alfiere',n:'cavallo',p:'pedone'};
const glyph={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const game=()=>state?.game;
const href=()=>location.origin+'/?stanza='+code;
function savePending(value) {
  pending=value;
  try {
    const key='tavolo:pending:'+code;
    if(value)sessionStorage.setItem(key,JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch {}
}
if(code&&token) {
  try {
    const cached=JSON.parse(sessionStorage.getItem('tavolo:pending:'+code));
    if(cached?.id&&Number.isInteger(cached.version)&&cached.action)pending=cached;
  } catch {}
}
const settings=fetch('/api/config',{signal:AbortSignal.timeout(2000)}).then(r=>r.ok?r.json():null).then(config=>{transport=roomTransport(config);}).catch(()=>{});

function toast(message) {
  const el=document.querySelector('#toast');
  el.textContent=message;
  el.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.hidden=true;},4200);
}
async function api(path='',body,room=code,seat=token) {
  const response=await fetch('/api/rooms/'+room+path,{
    method:body===undefined?'GET':'POST',
    headers:{Authorization:'Bearer '+seat,...(body===undefined?{}:{'Content-Type':'application/json'})},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(9000)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw Object.assign(new Error(data?.error||'Richiesta non riuscita.'),{status:response.status});
  if(!data)throw Error('Risposta del server incompleta.');
  return data;
}
function closeMessage(current,command) {
  if(typeof current.closed!=='boolean') throw Error('Il server usa una versione precedente. Riavvia node dev.mjs per abilitare la chiusura.');
  return {id:random(16),version:current.version,action:{close:command}};
}
function accept(next) {
  if(state && next.version<state.version) return;
  if(state && next.version===state.version) {
    if((next.chatVersion??0)>(state.chatVersion??0)) {
      if((!chatOpen||document.hidden)&&unreadChat(next,state.chatVersion??0).length)toast('Nuovo messaggio in chat.');
      state={...state,chat:next.chat,chatVersion:next.chatVersion};
      paintChat();
    }
    return;
  }
  if((state?.chatVersion??0)>(next.chatVersion??0)) next={...next,chat:state.chat,chatVersion:state.chatVersion};
  const incoming=next.game.id==='naval'&&state?.game.id==='naval'&&next.game.incoming.length>state.game.incoming.length?next.game.incoming.at(-1):null;
  if(incoming)navalView='own-fleet';
  const previousRoom=state;
  const cardOrigins=cardSnapshot(next.game.id);
  notifyClosure(state,next);
  state=next;
  prefix=[];
  selectedCard=null;
  seenRooms.set(code,next);
  render();
  if(incoming)showStrike(incoming);
  animateCards(previousRoom,next,cardOrigins);
}
function setConnected(value) {
  if(connected===value)return;
  connected=value;
  render();
}
async function live() {
  await settings;
  if(!code||!token||state?.closed||state?.game.result!==null)return;
  stopLive?.();
  stopLive=watchRoom({code,token},transport,next=>{
    if(!connected) {
      connected=true;
      if(state?.version===next.version)render();
    }
    accept(next);
    if(state?.closed||state?.game.result!=null)stopLive?.();
  },()=>api(),{interval:1200,onError:error=>{
    if(error.status===404) {
      stopLive?.();
      state=null;
      expired=true;
    } else if(!connected)return;
    connected=false;
    render();
  }});
}
async function restoreRoom() {
  if(!code||!token||restoring)return;
  restoring=true;
  restoreError='';
  render();
  try {
    const next=await api();
    expired=false;
    connected=true;
    if(state?.version===next.version) {accept(next);render();}
    else accept(next);
    live();
  } catch(error) {
    expired=error.status===404;
    restoreError='Connessione alla stanza non riuscita.';
    connected=false;
    if(expired)state=null;
    else if(state)live();
  } finally {
    restoring=false;
    if(!state||restoreError)render();
  }
}
function showModal(content) {
  modal.innerHTML='<form method="dialog" class="dialog-close"><button aria-label="Chiudi">×</button></form>'+content;
  modal.showModal();
}
function editorTools() {
  return '<div class="editor-tools" role="group" aria-label="Formattazione">'+
    [['b','Grassetto','B'],['i','Corsivo','I'],['u','Sottolineato','U'],['s','Barrato','S']].map(([tag,label,text])=>'<button type="button" class="outline format-'+tag+'" data-format="'+tag+'" aria-label="'+label+'" title="'+label+'">'+text+'</button>').join('')+
    '<select class="editor-color" aria-label="Colore del testo"><option value="">Colore</option>'+Object.entries(chatColors).map(([color,label])=>'<option value="'+color+'">'+label+'</option>').join('')+'</select>'+
    '<details class="emoji-picker"><summary aria-label="Emoji" title="Emoji">☺</summary><div class="emoji-grid">'+['😀','😂','😉','😎','🤔','😮','😅','😬','👍','👏','🙌','❤️','🔥','🎉','🤝','🎯','🏆','♟️'].map(emoji=>'<button type="button" data-emoji="'+emoji+'">'+emoji+'</button>').join('')+'</div></details></div>';
}
function editorPreview(value,limit) {
  const parsed=parseChat(value);
  return '<div class="editor-preview" '+(parsed.text===value?'hidden':'')+'>'+parsed.html+'</div><small class="editor-limit" '+(parsed.text.trim().length<=limit?'hidden':'')+'>Massimo '+limit+' caratteri.</small>';
}
function dialogForm(title,label,submitText,handler,value='',rich=false) {
  const field=rich?'<textarea id="room-field" rows="1" required maxlength="240" data-editor-limit="24" aria-describedby="room-error">'+escape(value)+'</textarea>':
    '<input id="room-field" required maxlength="100" autocomplete="off" aria-describedby="room-error" value="'+escape(value)+'">';
  showModal('<h2>'+title+'</h2><form class="form"><label for="room-field">'+label+'</label>'+(rich?editorTools():'')+'<div class="form-row">'+field+'<button class="primary">'+submitText+'</button></div>'+(rich?editorPreview(value,24):'')+'<p id="room-error" role="alert" class="error"></p></form>');
  const form=modal.querySelector('.form'), input=form.querySelector('#room-field');
  if(value)input.select();else input.focus();
  form.onsubmit=async e=>{
    e.preventDefault();
    const button=form.querySelector('button');
    button.disabled=true;
    try {await handler(input.value.trim());modal.close();}
    catch(error){form.querySelector('.error').textContent=error.message;}
    finally {button.disabled=false;}
  };
}
function enterDialog() {
  dialogForm('Entra in una stanza','Link o codice stanza','Continua',value=>{
    let target=value;
    try{target=new URL(value).searchParams.get('stanza')??'';}catch{}
    if(!codePattern.test(target)) throw Error('Inserisci un link o un codice stanza valido.');
    location.assign('/?stanza='+target);
  });
}
function nameDialog(gameId) {
  let room=code??random(12), seat=token??random(32);
  dialogForm(gameId?'Crea stanza · '+catalog[gameId].name:'Entra nella partita','Il tuo nickname',gameId?'Crea stanza':'Entra',async name=>{
    const options=gameId==='naval'?{size:Number(modal.querySelector('#sea-size').value),ships:Number(modal.querySelector('#ship-count').value)}:undefined;
    const roomName=modal.querySelector('#room-name')?.value;
    const next=await api(gameId?'':'/join',gameId?{game:gameId,name,options,roomName,format:'basic'}:{name,format:'basic'},room,seat);
    code=room;token=seat;
    localStorage.setItem('tavolo:'+code,token);
    localStorage.setItem('tavolo:nickname',name);
    history.replaceState({},'',href());
    setConnected(true);
    accept(next);
    live();
  },localStorage.getItem('tavolo:nickname')??'',true);
  if(gameId)modal.querySelector('.form').insertAdjacentHTML('afterbegin','<label class="room-name-label" for="room-name">Nome della stanza <input id="room-name" maxlength="48" placeholder="Facoltativo"></label>');
  if(gameId==='naval') modal.querySelector('.form-row').insertAdjacentHTML('afterend','<div class="sea-options"><label for="sea-size">Griglia<select id="sea-size"><option value="8">8 × 8</option><option value="10" selected>10 × 10</option><option value="12">12 × 12</option></select></label><label for="ship-count">Navi<select id="ship-count"><option>3</option><option>4</option><option selected>5</option><option>6</option></select></label></div>');
}
function renameDialog() {
  dialogForm('Cambia nickname','Il tuo nickname','Salva',async name=>{
    const visible=parseChat(name).text.trim();
    if(!visible||visible.length>24)throw Error('Inserisci un nickname da 1 a 24 caratteri.');
    const seats=savedSeats();
    const results=await Promise.allSettled(seats.map(async entry=>{
      try {
        const next=await api('/nickname',{name,format:'basic'},entry.code,entry.token);
        if(entry.code===code)accept(next);
        else if(!seenRooms.has(entry.code)||seenRooms.get(entry.code).version<=next.version)seenRooms.set(entry.code,next);
      } catch(error) {if(error.status!==404)throw error;}
    }));
    localStorage.setItem('tavolo:nickname',name);
    paintRooms();
    if(results.some(result=>result.status==='rejected'))throw Error('Alcune stanze non sono state aggiornate. Riprova quando la connessione è disponibile.');
    toast('Nickname aggiornato.');
  },state?.playerMarkup?.[state.side]??state?.players?.[state.side]??localStorage.getItem('tavolo:nickname')??'',true);
}
function art(id,g) {
  if(id==='scopa'||id==='uno') return '<div class="card-art '+id+'"><i>'+g.art+'</i><i>'+g.art+'</i><i>'+g.art+'</i></div>';
  if(['backgammon','go','nim','dots'].includes(id))return '<div class="symbol-art">'+g.art+'</div>';
  if(id==='four') return '<div class="four-art">'+Array.from({length:20},(_,i)=>'<i class="a'+i+'"></i>').join('')+'</div>';
  if(id==='tris') return '<div class="tris-art"><span>×</span><span>○</span><span>×</span></div>';
  if(id==='dama') return '<div class="dama-art"><i></i><i></i><i></i></div>';
  if(id==='reversi') return '<div class="reversi-art"><i></i><i></i></div>';
  if(id==='naval') return '<div class="naval-art"><i></i><i></i><i></i><span>✦</span></div>';
  return '<div class="chess-art">'+g.art+'</div>';
}
function lobby() {
  const seats=savedSeats();
  const requested=new URLSearchParams(location.search).get('vista');
  const dashboard=requested==='partite'||(!requested&&seats.length>0);
  const nav='<nav class="dashboard-nav" aria-label="Menu Home"><a href="/?vista=partite" '+(dashboard?'aria-current="page"':'')+'>Partite in corso</a><a href="/?vista=giochi" '+(!dashboard?'aria-current="page"':'')+'>Esplora giochi</a></nav>';
  if(dashboard) return nav+'<section class="catalog"><div class="section-head"><div><h1>Partite in corso</h1><p>Riprendi una stanza o controlla a chi tocca.</p></div><a class="primary" href="/?vista=giochi">'+icon('plus')+'Nuova partita</a></div><label class="room-filter"><input type="checkbox" id="attention-only" '+(attentionOnly?'checked':'')+'> Solo partite da seguire</label><div id="saved-rooms"></div></section>';
  return nav+'<section class="catalog" aria-labelledby="catalog-title"><div class="section-head"><div><h1 id="catalog-title">Scegli il gioco</h1><p>Crea una stanza e invita chi vuoi sfidare.</p></div><span>2 giocatori per stanza</span></div>'+
    '<div class="catalog-tools"><label class="game-search">'+icon('search')+'<input type="search" id="game-search" aria-label="Cerca un gioco" placeholder="Cerca un gioco…" value="'+escape(gameQuery)+'"></label><div class="game-filters" role="group" aria-label="Tipo di gioco">'+Object.entries(gameFilters).map(([key,label])=>'<button class="outline" type="button" data-filter="'+key+'" aria-pressed="'+(gameFilter===key)+'">'+label+'</button>').join('')+'</div></div>'+
    '<p class="empty-rooms" id="catalog-empty" role="status" hidden>Nessun gioco trovato.</p><div class="cards">'+Object.entries(catalog).map(([id,g])=>
    '<article class="card" data-game="'+id+'"><div class="art '+g.color+'" aria-hidden="true">'+art(id,g)+'</div><div class="card-body"><h2>'+g.name+'</h2><p>'+g.desc+'</p><div class="card-actions"><button class="primary" data-create="'+id+'" aria-label="Crea stanza · '+g.name+'">'+icon('plus')+'Crea stanza</button><button class="link" data-info="'+id+'" aria-label="Regole di '+g.name+'">'+icon('book')+'Regole</button></div></div></article>').join('')+'</div></section>';
}
const gameFilters={all:'Tutti',board:'Da tavolo',cards:'Carte',quick:'Veloci'};
let gameQuery='',gameFilter='all',attentionOnly=false;
const gameType=id=>['uno','scopa'].includes(id)?'cards':['tris','four','nim','dots'].includes(id)?'quick':'board';
function filterCatalog() {
  const query=gameQuery.trim().toLocaleLowerCase('it');
  let count=0;
  for(const card of app.querySelectorAll('[data-game]')) {
    const id=card.dataset.game;
    card.hidden=!(catalog[id].name.toLocaleLowerCase('it').includes(query)&&(gameFilter==='all'||gameType(id)===gameFilter));
    if(!card.hidden)count++;
  }
  for(const button of app.querySelectorAll('[data-filter]'))button.setAttribute('aria-pressed',button.dataset.filter===gameFilter);
  const empty=document.querySelector('#catalog-empty');
  if(empty)empty.hidden=count>0;
}
const needsAttention=key=>seenRooms.has(key)&&(roomStatus(seenRooms.get(key)).tone==='your'||unreadCount(key,seenRooms.get(key))>0);
function paintRooms() {
  const badge=document.querySelector('#turn-count');
  const seats=savedSeats();
  const actionable=seats.filter(({code:key})=>key!==code&&needsAttention(key)).length;
  badge.hidden=!actionable;
  badge.textContent=actionable;
  badge.setAttribute('aria-label',actionable+' partite richiedono la tua attenzione');
  const target=document.querySelector('#saved-rooms');
  if(!target)return;
  const showClosed=target.querySelector('.closed-rooms')?.open;
  const focus=document.activeElement?.getAttribute('href');
  seats.sort((a,b)=>{
    const rank=seat=>{const data=seenRooms.get(seat.code);return data?({your:0,other:1,waiting:2,done:3})[roomStatus(data).tone]:4;};
    return rank(a)-rank(b);
  });
  function row({code:key}) {
    const s=seenRooms.get(key), status=s?roomStatus(s):{tone:'waiting',label:unavailable.has(key)?'Non disponibile':'Connessione…'};
    const unread=s?unreadCount(key,s):0;
    const date=Number.isFinite(s?.createdAt)?new Date(s.createdAt):null;
    const created=date&&Number.isFinite(date.getTime())?'<time datetime="'+date.toISOString()+'">'+escape(new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(date))+'</time>':'<span>Data non disponibile</span>';
    const players=s?s.players.map((name,i)=>displayNickname(name,s.playerMarkup?.[i])+(i===s.side?' (tu)':'')).concat(s.players.length===1?['Posto libero']:[]).join(' · '):'';
    return '<div class="saved-room"><a href="/?stanza='+key+'"><span><strong>'+escape(s?catalog[s.game.id].name:'Stanza')+'</strong><small>'+escape(s?.roomName?s.roomName+' · #'+key.slice(-8):'Stanza #'+key.slice(-8))+'</small>'+(s?'<small>'+players+'</small><small class="room-created">Creata il '+created+'</small>':'')+'</span><span class="room-status '+status.tone+'">'+status.label+'</span>'+(unread?'<span class="unread-pill" aria-label="'+unread+' messaggi non letti">'+icon('chat')+unread+'</span>':'')+'</a>'+
      (status.tone==='done'||unavailable.has(key)?'<button class="link" data-dismiss="'+key+'">Rimuovi</button>':
        s?.closeRequest!=null?'':'<button class="outline room-close" data-close-room="'+key+'" aria-label="'+(s?.requiresConsent?'Chiedi di chiudere la partita':'Chiudi partita')+'" '+(closingRooms.has(key)?'disabled aria-busy="true"':'')+'><span aria-hidden="true">×</span></button>')+'</div>';
  }
  const finished=entry=>unavailable.has(entry.code)||(seenRooms.has(entry.code)&&roomStatus(seenRooms.get(entry.code)).tone==='done');
  const active=seats.filter(entry=>!finished(entry)&&(!attentionOnly||needsAttention(entry.code))), recent=seats.filter(finished);
  target.innerHTML=(active.length?'<div class="saved-rooms">'+active.map(row).join('')+'</div>':'<p class="empty-rooms">'+(attentionOnly?'Nessuna partita in attesa di una tua azione.':'Nessuna partita in corso.')+'</p>')+
    (recent.length&&!attentionOnly?'<details class="closed-rooms" '+(showClosed?'open':'')+'><summary>Partite concluse o non disponibili ('+recent.length+')</summary><div class="saved-rooms">'+recent.map(row).join('')+'</div></details>':'');
  if(focus)Array.from(target.querySelectorAll('a')).find(a=>a.getAttribute('href')===focus)?.focus({preventScroll:true});
}
function notifyClosure(previous,next) {
  if(next.closed&&!previous?.closed&&previous) {
    toast('Partita chiusa · '+catalog[next.game.id].name);
    return true;
  }
  if(next.closeRequest!=null&&next.closeRequest!==next.side&&previous?.closeRequest!==next.closeRequest) {
    toast(next.players[next.closeRequest]+' chiede di chiudere · '+catalog[next.game.id].name);
    return true;
  }
  if(previous?.closeRequest===next.side&&next.closeRequest==null&&next.game.result===null) {
    toast('Richiesta di chiusura rifiutata · '+catalog[next.game.id].name);
    return true;
  }
  return false;
}
async function closeFromDashboard(room) {
  if(closingRooms.has(room))return;
  const seat=localStorage.getItem('tavolo:'+room);
  if(!seat)return;
  closingRooms.add(room);
  paintRooms();
  try {
    const current=seenRooms.get(room)??await api('',undefined,room,seat);
    if(current.closed||current.game.result!==null||current.closeRequest!=null) {
      seenRooms.set(room,current);
      return;
    }
    const next=await api('/moves',closeMessage(current,'request'),room,seat);
    seenRooms.set(room,next);
    if(next.closed) {
      monitors.get(room)?.();
      toast('Partita chiusa.');
    } else toast('Richiesta di chiusura inviata.');
  } catch(error) {
    toast(error.message);
    try {seenRooms.set(room,await api('',undefined,room,seat));}catch {}
  } finally {
    closingRooms.delete(room);
    paintRooms();
  }
}
async function monitorRooms() {
  const entries=savedSeats().filter(entry=>entry.code!==code&&!monitors.has(entry.code));
  await Promise.all(entries.map(async entry=>{
    const receive=next=>{
      const previous=seenRooms.get(entry.code);
      if(previous&&previous.version>=next.version&&(previous.chatVersion??0)>=(next.chatVersion??0))return;
      seenRooms.set(entry.code,next);
      unavailable.delete(entry.code);
      if(!notifyClosure(previous,next)&&previous&&roomStatus(previous).tone!=='your'&&roomStatus(next).tone==='your')
        toast('Tocca a te · '+catalog[next.game.id].name+' con '+next.players[1-next.side]);
      else if(previous&&unreadChat(next,Math.max(chatCursor(entry.code),previous.chatVersion??0)).length)
        toast('Nuovo messaggio · '+catalog[next.game.id].name+' con '+next.players[1-next.side]);
      paintRooms();
      if(next.closed||next.game.result!==null) {
        monitors.get(entry.code)?.();
      }
    };
    const get=()=>api('',undefined,entry.code,entry.token);
    monitors.set(entry.code,()=>{});
    try {
      const next=await get();
      receive(next);
      if(!next.closed&&next.game.result===null) {
        await settings;
        if(seenRooms.get(entry.code)?.closed)return;
        monitors.set(entry.code,watchRoom(entry,transport,receive,get));
      }
    } catch(error) {
      unavailable.add(entry.code);
      if(!error.status) {
        monitors.delete(entry.code);
        setTimeout(monitorRooms,5000);
      }
      paintRooms();
    }
  }));
}
addEventListener('storage',e=>{if(e.key?.startsWith('tavolo:')) {paintRooms();monitorRooms();}});
addEventListener('pagehide',()=>{stopLive?.();for(const stop of monitors.values())stop();monitors.clear();});
addEventListener('pageshow',e=>{if(e.persisted){restoreRoom();monitorRooms();}});
function rules(id) {
  const g=catalog[id];
  return '<div class="rules"><h2>Come si gioca a '+(id==='chess'?'scacchi':id==='dama'?'dama':g.name.toLowerCase())+'</h2>'+
    guides[id].map(([title,copy])=>'<section><h3>'+title+'</h3><p>'+copy+'</p></section>').join('')+
    '<a href="'+g.source[1]+'" target="_blank" rel="noopener noreferrer">'+g.source[0]+' ↗</a></div>';
}
function banner(s) {
  const g=s.game;
  if(s.closed) return ['neutral','Partita chiusa'];
  if(g.result!==null) return ['neutral',g.result==='draw'?'Partita pari':g.result===s.side?'Hai vinto!':s.players[g.result]+' ha vinto'];
  if(!connected) return ['neutral','Riconnessione…'];
  if(pending) return ['neutral',busy?(pending.action.close?'Chiusura in invio…':'Mossa in invio…'):'Conferma da recuperare'];
  if(s.players.length<2) return ['neutral','In attesa del secondo giocatore'];
  if(g.id==='naval'&&!g.ready.every(Boolean)) return ['neutral',g.ready[s.side]?'In attesa della flotta avversaria':'Schiera la tua flotta'];
  if(g.turn===s.side) return ['green',g.check?'Tocca a te · Sei sotto scacco':'Tocca a te'];
  return ['red','Turno di '+s.players[g.turn]];
}
const acting=()=>connected&&!pending&&!state.closed&&state.players.length===2&&game().turn===state.side&&game().result===null;

function cell(content,classes,attrs,label,enabled) {
  return '<button type="button" class="cell '+classes+'" '+attrs+' aria-label="'+escape(label)+'" '+(enabled?'':'disabled')+'>'+content+'</button>';
}
function boardRuler(boardHtml,files,ranks) {
  const ruler=(name,values)=>'<div class="chess-ruler '+name+'" aria-hidden="true">'+Array.from(values,c=>'<span>'+c+'</span>').join('')+'</div>';
  return '<div class="chess-frame" style="--ruler-count:'+files.length+'">'+ruler('chess-ranks',ranks)+boardHtml+ruler('chess-files',files)+'</div>';
}
function checker(g) {
  const {id,board,moves,last}=g, chess=id==='chess';
  const flip=chess||id==='dama';
  const paths=flip?moves.map(m=>chess?[m.from,m.to]:m.path):[];
  const choices=new Set(paths.filter(path=>prefix.every((at,i)=>path[i]===at)).map(path=>path[prefix.length]));
  const newest=state.version>drawnVersion;
  const mayReverse=flip&&state.side===1;
  const cells=Array.from({length:board.length},(_,i)=>mayReverse?board.length-1-i:i).map(i=>{
    const v=board[i];
    const width=id==='tris'?3:id==='four'?7:8;
    const dark=(i%width+Math.floor(i/width))%2===(id==='dama'?0:1);
    const viable=flip?choices.has(i):moves.some(m=>m.at===(id==='four'?i%7:i));
    const isLast=last?.at===i||last?.to===i;
    const target=viable&&acting()&&(id==='reversi'||(flip&&prefix.length>0));
    const style=[flip?(dark?'dark':'light'):'',prefix.at(-1)===i?'selected':'',!target&&!flip&&viable&&acting()&&id!=='four'?'viable':'',
      last?.line?.includes(i)?'win':'',isLast?'last':'',newest&&(isLast||last?.changed?.includes(i))?'animate':''].join(' ');
    let content='', label=flip||id==='reversi'?square(i):coord(i,width);
    if(v && chess) {
      const white=v===v.toUpperCase();
      content='<span class="chess-piece '+(white?'white':'black')+'">'+glyph[v.toLowerCase()]+'</span>';
      label+=' '+pieceLabel[v.toLowerCase()]+(white?' bianco':' nero');
    } else if(v) {
      content=id==='tris'?'<span class="mark p'+v+'">'+(v===1?'×':'○')+'</span>':'<span class="disc p'+((v-1)%2+1)+'">'+(v>=3?'♛':'')+'</span>';
      label+=' '+catalog[id].players[(v-1)%2];
    }
    const choose=acting()&&(viable || (flip&&moves.some(m=>(chess?m.from:m.path[0])===i)));
    if(target) {
      const capture=chess?Boolean(v||moves.some(m=>m.from===prefix[0]&&m.to===i&&m.ep)):
        id==='dama'&&Math.abs(i%8-prefix.at(-1)%8)===2;
      content+='<span aria-hidden="true" class="chess-target '+(capture?'chess-capture':'')+'"></span>';
      label+=capture?' · Cattura disponibile':' · Destinazione disponibile';
    }
    return cell(content,style,'data-cell="'+i+'"',id==='four'?'Colonna '+(i%7+1):label,choose);
  }).join('');
  const boardHtml='<div class="board '+id+'">'+cells+'</div>';
  return flip||id==='reversi'?boardRuler(boardHtml,mayReverse?'hgfedcba':'abcdefgh',mayReverse?'12345678':'87654321'):boardHtml;
}
function tiles(ship,length) {
  const size=seaSize();
  return Array.from({length},(_,n)=>{
    const row=Math.floor(ship.at/size)+(ship.vertical?n:0), col=ship.at%size+(ship.vertical?0:n);
    return row<size&&col<size?row*size+col:-1;
  });
}
function navyGrid(ships,shots,target,placing) {
  const size=seaSize();
  const hull=new Set((ships??[]).flatMap((ship,i)=>tiles(ship,sizes()[i])));
  const fired=new Map(shots.map(m=>[m.at,m]));
  const sunk=new Set(shots.flatMap(m=>m.sunk??[]));
  const grid='<div class="navy-grid" style="--sea-size:'+size+'">'+Array.from({length:size*size},(_,i)=>{
    const shot=fired.get(i), ship=hull.has(i), down=sunk.has(i);
    return cell(shot?(shot.hit?'×':'·'):'',[ship?'hull':'',shot?.hit?'hit':shot?'miss':'',down?'sunk':'',state.version>drawnVersion&&game().last?.at===i&&game().last.side===(target?state.side:1-state.side)?'animate':''].join(' '),
      'data-naval="'+i+'"',coord(i,size)+(shot?(shot.hit?' colpito':' acqua'):ship?' nave':''),placing||(target&&acting()&&!shot));
  }).join('')+'</div>';
  return '<div class="sea-chart" style="--n:'+size+'"><div class="sea-cols">'+Array.from({length:size},(_,i)=>'<span>'+String.fromCharCode(65+i)+'</span>').join('')+'</div><div class="sea-rows">'+Array.from({length:size},(_,i)=>'<span>'+(i+1)+'</span>').join('')+'</div>'+grid+'</div>';
}
function showStrike(shot) {
  const target=app.querySelector('.own-grid [data-naval="'+shot.at+'"]');
  if(!target||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const fx=document.createElement('span');
  fx.className='sea-strike '+(shot.hit?'strike-hit':'strike-water');
  fx.setAttribute('aria-hidden','true');
  fx.innerHTML='<i class="flyover">✈</i><i class="falling-bomb">●</i><i class="impact"></i>';
  target.append(fx);
  setTimeout(()=>fx.remove(),1800);
}
function activeShip() {
  return editingShip??sizes().findIndex((_,i)=>!draft[i]);
}
function fleetPanel(ships,shots,reserve,editable) {
  const hits=new Set(shots.filter(shot=>shot.hit).map(shot=>shot.at));
  const rows=sizes().map((length,i)=>{
    const ship=ships?.[i];
    if(reserve?!!ship:!ship)return '';
    const cells=ship?tiles(ship,length):Array(length).fill(-1);
    const label='Nave '+(i+1)+' · '+length+' caselle'+(ship?' · '+coord(ship.at,seaSize()):'');
    const body='<span>'+label+'</span><span class="fleet-segments">'+cells.map(at=>hits.has(at)?'<b class="damage" aria-label="Colpito">×</b>':'<b></b>').join('')+'</span>';
    return editable?'<button class="outline fleet-row" data-ship="'+i+'" aria-pressed="'+(activeShip()===i)+'">'+body+'</button>':'<div class="fleet-row">'+body+'</div>';
  }).join('');
  return '<aside class="fleet-panel"><h3>'+(reserve?'Da posizionare':'La tua squadra navale')+'</h3>'+ (rows||(reserve?'Tutte posizionate':'Nessuna nave posizionata'))+'</aside>';
}
function naval(g) {
  if(!g.ready.every(Boolean)) {
    const editable=connected&&!state.closed&&!g.ready[state.side]&&!pending;
    const ships=g.ready[state.side]?g.mine:draft;
    const selected=draft[activeShip()];
    const complete=sizes().every((_,i)=>ships?.[i]);
    const controls=editable?'<div class="fleet-actions">'+
      (activeShip()>=0?'<button class="outline ship-drag" data-drag-ship>Trascina nave</button><button class="outline" data-action="rotate">Ruota nave · '+(vertical?'↕':'↔')+'</button>':'')+
      (selected?'<button class="outline" data-action="remove-ship">Rimuovi nave</button>':'')+
      '<button class="outline" data-action="random">Disponi a caso</button><button class="link" data-action="reset">Svuota</button>'+
      '<button class="primary" data-action="fleet" '+(complete&&state.players.length===2?'':'disabled')+'>Conferma flotta</button></div>':'';
    return '<div class="navy-setup fleet-layout">'+fleetPanel(ships,[],true,editable)+'<div><h3>La tua flotta</h3>'+navyGrid(ships,[],false,editable)+'</div><div>'+
      fleetPanel(ships,[],false,editable)+controls+'</div></div>'+
      (editable?'<p>Scegli una nave a sinistra e clicca sulla griglia per posarla. Seleziona una nave posata per spostarla, ruotarla o rimuoverla.</p>':'<p>Flotta confermata.</p>');
  }
  return '<div class="naval-combat"><div class="navy-switch" role="group" aria-label="Griglia visibile"><button class="outline" data-action="target" aria-pressed="'+(navalView==='target')+'">Bersaglio</button><button class="outline" data-action="own-fleet" aria-pressed="'+(navalView==='own-fleet')+'">La tua flotta</button></div><div class="navy-battle show-'+navalView+'"><div class="target-grid"><h3>Bersaglio</h3>'+navyGrid(null,g.outgoing,true,false)+'</div><div class="own-grid"><h3>La tua flotta</h3>'+navyGrid(g.mine,g.incoming,false,false)+'</div></div>'+fleetPanel(g.mine,g.incoming,false,false)+'</div>';
}
const unoColors={R:'Rosso',B:'Blu',G:'Verde',Y:'Giallo',W:'Jolly'};
const unoValues={skip:'Salta',reverse:'Inverti',two:'+2',four:'+4',wild:'Jolly'};
function cardFace(id,value) {
  if(id==='uno') {
    const [color,rank]=value.split(':');
    return {face:unoValues[rank]??rank,label:(unoValues[rank]??rank)+' '+unoColors[color],style:'uno-'+color};
  }
  const suit=Math.floor(value/10), rank=value%10+1;
  return {face:(['','A','2','3','4','5','6','7','F','C','R'][rank])+' '+['◉','♜','∥','♠'][suit],label:rank+' di '+['denari','coppe','bastoni','spade'][suit],style:'scopa-'+suit};
}
function playingCard(id,value,attribute='',enabled=false,selected=false) {
  const {label,style}=cardFace(id,value);
  const artwork=deckCache.get(id==='uno'?'uno':scopaDeck)?.[cardKey(id,value)];
  const body=artwork?(typeof artwork==='string'?'<img alt="" draggable="false" src="data:image/webp;base64,'+artwork+'">':cardSvg(artwork)):'';
  const cls='playing-card '+style;
  if(!attribute)return '<span class="'+cls+'" role="img" aria-label="'+label+'">'+body+'</span>';
  return '<button class="'+cls+'" '+attribute+' aria-label="'+label+'" '+(id==='scopa'?'aria-pressed="'+selected+'"':'')+' '+(enabled?'':'disabled')+'>'+body+'</button>';
}
const loadingDecks=new Set();
function ensureDeck(deck) {
  if(deckCache.has(deck)||loadingDecks.has(deck))return;
  loadingDecks.add(deck);
  loadDeck(deck).then(cards=>{
    deckCache.set(deck,cards);
    if(game()?.id==='uno'?deck==='uno':game()?.id==='scopa'&&deck===scopaDeck)render();
  }).catch(()=>{toast('Impossibile caricare il mazzo. Ricarica la pagina per riprovare.');})
    .finally(()=>loadingDecks.delete(deck));
}
app.addEventListener('change',event=>{
  const {id,value}=event.target;
  if(id!=='scopa-deck'||!Object.hasOwn(scopaDecks,value))return;
  scopaDeck=value;
  localStorage.setItem('tavolo:scopa-deck',value);
  render();
});
function opponentHand(g) {
  const count=g.opponentCount;
  const back=g.id==='scopa'?'<img src="/scopa-back.webp" alt="" width="250" height="350">':'<i></i>';
  return '<span class="opponent-hand"><span>Carte avversario: '+count+'</span>'+
    '<span class="opponent-backs" aria-hidden="true">'+
    ('<span class="opponent-back">'+back+'</span>').repeat(Math.min(count,7))+'</span></span>';
}
function playHand(value) {
  if(!acting()||pending)return;
    if(game().id==='scopa') {
      selectedCard=Number(value);
      const options=game().takes[selectedCard];
      if(options.length===1)send({card:selectedCard,take:options[0]});
      else render();
    } else if(value.startsWith('W:')) {
      selectedCard=value;
      showModal('<h2>Scegli il colore</h2><div class="promotion">'+Object.entries(unoColors).filter(([color])=>color!=='W').map(([color,name])=>'<button class="uno-active uno-'+color+'" data-uno-color="'+color+'">'+name+'</button>').join('')+'</div>');
    } else send({card:value});
  }
function cardPiles(g) {
  const pile=(label,count,attr)=>'<div class="table-pile" '+attr+'><i class="pile-back '+g.id+'" '+(count?'':'hidden')+'></i><span>'+label+' <b>'+count+'</b></span></div>';
  const stock=pile('Da pescare',g.remaining,'data-stock');
  const piles=g.id==='scopa'&&g.captureCounts?[state.side,1-state.side].map(side=>pile(side===state.side?'Le tue prese':'Prese avversarie',g.captureCounts[side],'data-pile="'+side+'"')).join(''):'';
  return '<div class="table-piles">'+stock+piles+'</div>';
}
function cardSnapshot(id) {
  if(!['scopa','uno'].includes(id)||matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
  const faces=new Map();
  if(id==='scopa')app.querySelectorAll('.card-center .playing-card').forEach((el,i)=>faces.set(state?.game.table?.[i],el.getBoundingClientRect()));
  return {faces,own:app.querySelector('.hand')?.getBoundingClientRect(),other:app.querySelector('.opponent-hand')?.getBoundingClientRect()};
}
function animateCards(prev,next,origins) {
  const g=next.game;
  if(!origins||next.players.length!==2||!app.querySelector('[data-stock]'))return;
  const old=prev?.game, opening=(!prev&&!g.last)||!!prev&&prev.players.length<2;
  if(!opening&&(!prev||next.version!==prev.version+1))return;
  const rect=selector=>app.querySelector(selector)?.getBoundingClientRect();
  const hand=[0,1].map(side=>rect(side===next.side?'.hand':'.opponent-hand'));
  const stock=rect('[data-stock]');
  function fly(from,to,card,delay) {
    if(!from?.width||!to?.width)return;
    const el=document.createElement('div');
    el.className='card-flight';
    el.setAttribute('aria-hidden','true');
    el.innerHTML=card===undefined?'<i class="pile-back '+g.id+'"></i>':playingCard(g.id,card);
    document.body.append(el);
    const pos=r=>'translate('+ (r.left+r.width/2)+'px,'+(r.top+r.height/2)+'px) translate(-50%,-50%)';
    const motion=el.animate([{transform:pos(from),opacity:0},{transform:pos(from),opacity:1,offset:.08},{transform:pos(to),opacity:.9,offset:.91},{transform:pos(to),opacity:0}],{duration:430,delay,fill:'both'});
    motion.onfinish=motion.oncancel=()=>el.remove();
  }
  const last=g.last;
  const changed=!opening&&last&&JSON.stringify(last)!==JSON.stringify(old.last);
  const played=changed&&(g.id==='scopa'||last.type==='play');
  if(played) {
    const table=rect('.card-center');
    fly(last.side===next.side?origins.own:origins.other,table,last.card,0);
    if(g.id==='scopa'&&last.take?.length) {
      const dest=rect('[data-pile="'+last.side+'"]');
      [last.card,...last.take].forEach((card,i)=>fly(origins.faces.get(card)??table,dest,card,350+i*65));
    }
  }
  const counts=(game)=>next.side===0?[game.hand.length,game.opponentCount]:[game.opponentCount,game.hand.length];
  const now=counts(g),before=opening?[0,0]:counts(old);
  now.forEach((n,side)=>{
    const dealt=g.id==='scopa'&&old&&old.round!==g.round?n:n-before[side]+Number(played&&last.side===side);
    for(let i=0;i<dealt;i++)fly(stock,hand[side],undefined,(played?550:0)+(2*i+side)*65);
  });
}

function cardTable(g) {
  const scopa=g.id==='scopa', deckId=scopa?scopaDeck:'uno';
  const ready=deckCache.has(deckId);
  if(!ready)ensureDeck(deckId);
  const active=ready&&acting();
  const options=scopa?g.takes[selectedCard]??[]:[];
  const table=scopa?'<div class="card-line">'+g.table.map(c=>playingCard(g.id,c)).join('')+'</div>':
    '<div class="card-line">'+playingCard(g.id,g.top)+'<span class="uno-active uno-'+g.color+'">'+unoColors[g.color]+'</span></div>';
  const info=scopa?'Smazzata '+g.round+' · Punti '+g.scores[state.side]+'–'+g.scores[1-state.side]:
    (g.opponentCount===1?'UNO!':'');
  const deck=scopa?'<label class="card-deck-picker">Mazzo <select id="scopa-deck">'+
    Object.entries(scopaDecks).map(([id,name])=>'<option value="'+id+'" '+(id===scopaDeck?'selected':'')+'>'+name+'</option>').join('')+'</select></label>':'';
  return '<div class="card-table table-'+g.id+'"'+(scopa?' data-deck="'+scopaDeck+'"':'')+'><div class="card-table-meta"><span>'+info+'</span>'+opponentHand(g)+deck+'</div>'+cardPiles(g)+'<div class="card-center"><h3>'+(scopa?'Sul tavolo':'Carta in cima')+'</h3>'+table+'</div>'+
    '<h3>La tua mano</h3><small>Doppio clic o trascina sul tavolo. Da tastiera, premi Invio.</small><div class="card-line hand">'+g.hand.map(c=>playingCard(g.id,c,'data-hand="'+c+'"',active&&(scopa||g.playable.includes(c)),selectedCard===c)).join('')+'</div>'+
    '<div class="card-moves">'+(scopa?options.map((take,i)=>'<button class="primary" data-take="'+i+'">'+(take.length?'Prendi '+take.map(c=>cardFace(g.id,c).label).join(' + '):'Lascia sul tavolo')+'</button>').join(''):
    (active?'<button class="outline" data-action="'+(g.drawn?'uno-pass':'uno-draw')+'">'+(g.drawn?'Passa':'Pesca')+'</button>':''))+'</div></div>';
}
function strategyBoard(g) {
  const active=acting();
  if(g.id==='go') {
    const files='ABCDEFGHJ', ranks='987654321', moves=g.moves?new Set(g.moves):null;
    const stones=g.board.map((v,i)=>{
      const legal=active&&!v&&(moves?.has(i)??true);
      const content=v?'<span class="disc p'+v+'"></span>':legal&&moves?'<span class="chess-target" aria-hidden="true"></span>':'';
      return cell(content,g.last?.at===i?'last':'','data-go="'+i+'"',files[i%9]+ranks[Math.floor(i/9)]+(v?' occupato':''),legal);
    }).join('');
    return boardRuler('<div class="board go">'+stones+'</div>',files,ranks)+
      '<div class="strategy-actions">'+(g.scores?'Nero '+g.scores[0]+' · Bianco '+g.scores[1]:g.last?.pass?'Ultima mossa: passaggio':'')+(active?'<button class="outline" data-action="go-pass">Passa</button>':'')+'</div>';
  }
  if(g.id==='nim')return '<div class="nim-board">'+g.piles.map((n,i)=>'<div class="nim-row"><strong>Fila '+(i+1)+'</strong>'+Array.from({length:n},(_,k)=>cell('●','','data-nim="'+i+':'+(n-k)+'"','Togli '+(n-k)+' dalla fila '+(i+1),active)).join('')+'</div>').join('')+'</div>';
  if(g.id==='dots') {
    const grid=Array.from({length:49},(_,i)=>{
      const r=i/7|0,c=i%7;
      if(r%2===0&&c%2===0)return '<span class="point"></span>';
      if(r%2&&c%2)return '<span class="box claimed-'+g.boxes[(r>>1)*3+(c>>1)]+'"></span>';
      const edge=r%2?12+(r>>1)*4+(c>>1):(r>>1)*3+(c>>1);
      return cell('',(r%2?'vertical ':'horizontal ')+'claimed-'+g.edges[edge],'data-edge="'+edge+'"','Lato '+(edge+1),active&&!g.edges[edge]);
    }).join('');
    return '<div class="dots-board">'+grid+'</div><div class="strategy-actions">Viola '+(g.counts?.[0]??0)+' · Blu '+(g.counts?.[1]??0)+'</div>';
  }
  const chosen=prefix[0];
  const possible=g.moves.filter(m=>m.from===chosen);
  const points=[...Array.from({length:12},(_,i)=>12+i),...Array.from({length:12},(_,i)=>11-i)];
  const buttonAt=i=>{
    const v=g.points[i], piece=v>0?'light':'dark';
    const options=g.moves.some(m=>m.from===i)||(chosen!==undefined&&possible.some(m=>m.to===i));
    return cell('<small>'+(i+1)+'</small>'+(v?'<span class="bg-stack '+piece+'">● <b>'+Math.abs(v)+'</b></span>':''),
      chosen===i?'selected':possible.some(m=>m.to===i)?'move-option':'','data-bg="'+i+'"','Punta '+(i+1)+(v?' · '+Math.abs(v)+' pedine':''),active&&options);
  };
  return '<div class="bg-board">'+points.map(buttonAt).join('')+'</div><div class="strategy-actions"><strong>Dadi '+(g.dice.join(' · ')||'—')+'</strong><span>Uscite '+g.off[state.side]+'–'+g.off[1-state.side]+'</span>'+
    '<button class="outline" data-bg="bar" '+(active&&g.moves.some(m=>m.from==='bar')?'':'disabled')+'>Barra '+g.bar[state.side]+'</button>'+
    (active&&g.dice.length===0?'<button class="primary" data-action="bg-roll">Lancia dadi</button>':'')+
    (active&&g.dice.length&&!g.moves.length?'<button class="outline" data-action="bg-pass">Passa</button>':'')+
    (active&&possible.some(m=>m.to==='off')?'<button class="primary" data-bg="off">Porta fuori</button>':'')+'</div>';
}
function chatMessages() {
  const cursor=chatCursor(code);
  return chatEntries(state).map(m=>{
    const replaced=m.author&&m.author!==state.players[m.side];
    const author=replaced?'<s class="former-nickname">'+displayNickname(m.author,m.authorMarkup)+'</s> ':'';
    const body=renderChatMessage(m);
    return '<li class="'+(m.side===state.side?'mine':m.sequence>cursor?'unread-message':'')+'"><strong class="chat-author">'+author+displayNickname(state.players[m.side],state.playerMarkup?.[m.side])+'</strong><p>'+body+'</p></li>';
  }).join('')||'<li class="chat-empty">Nessun messaggio.</li>';
}
const displayNickname=(name,markup)=>markup?parseChat(markup).html:escape(name);
function chatPanel() {
  const disabled=state.closed||state.players.length<2?'disabled':'';
  return '<aside class="chat-panel" id="chat-panel" aria-labelledby="chat-title"><div class="chat-head"><h2 id="chat-title">Chat</h2><button class="link panel-close" data-action="chat" aria-label="Chiudi la chat">'+icon('close')+'</button></div><ol id="chat-messages" class="chat-messages" role="log" aria-live="polite">'+chatMessages()+'</ol><form id="chat-form"><fieldset '+disabled+'>'+editorTools()+'<div class="composer-row"><textarea id="chat-input" rows="1" maxlength="1600" data-editor-limit="280" aria-label="Messaggio" placeholder="Scrivi un messaggio">'+escape(chatDraft)+'</textarea><button type="submit" class="primary chat-send" aria-label="Invia messaggio" title="Invia messaggio">'+icon('send')+'</button></div>'+editorPreview(chatDraft,280)+'</fieldset></form></aside>';
}
function paintChat() {
  const messages=document.querySelector('#chat-messages');
  if(messages) {
    const atEnd=messages.scrollHeight-messages.scrollTop-messages.clientHeight<45;
    messages.innerHTML=chatMessages();
    if(atEnd)messages.scrollTop=messages.scrollHeight;
  }
  const indicator=document.querySelector('#chat-toggle');
  markChatRead();
  if(indicator)indicator.innerHTML=chatLabel(state);
}
function movePanel(g) {
  const rows=new Map();
  for(const {ply,san} of g.history??[]) {
    const number=Math.ceil(ply/2);
    if(!rows.has(number))rows.set(number,[]);
    rows.get(number)[(ply-1)%2]=san;
  }
  const last=g.id==='chess'?lastChessMove(g):null;
  const empty=last?'<p class="move-empty">Ultima mossa disponibile: <strong>'+escape(last)+'</strong></p>':'';
  const hint=!Array.isArray(g.history)?'Riavvia node dev.mjs dalla cartella aggiornata per registrare le prossime mosse.':
    last?'La cronologia completa non è disponibile per le mosse precedenti all’aggiornamento.':'Le mosse registrate compariranno qui.';
  return '<aside class="move-panel" id="move-panel" aria-labelledby="moves-title"><div class="chat-head"><h2 id="moves-title">Mosse</h2><button class="link panel-close" data-action="moves" aria-label="Chiudi cronologia">'+icon('close')+'</button></div>'+
    (rows.size?'<div class="move-list"><table><thead><tr><th scope="col">N.</th><th scope="col">Bianco</th><th scope="col">Nero</th></tr></thead><tbody>'+
    Array.from(rows,([n,[white,black]])=>'<tr><th scope="row">'+n+'</th><td>'+escape(white??'—')+'</td><td>'+escape(black??'—')+'</td></tr>').join('')+
    '</tbody></table></div><button class="outline move-copy" type="button" data-action="copy-moves">'+icon('copy')+'Copia mosse</button>':empty+'<p class="move-empty">'+hint+'</p>')+'</aside>';
}
function room() {
  const s=state,g=s.game,meta=catalog[g.id], [tone,wording]=banner(s);
  const hasMoveHistory=g.id==='chess'||g.id==='dama';
  const showMoves=hasMoveHistory&&movesOpen&&tab==='play';
  const pass=g.id!=='reversi'||g.last?.pass===undefined?'':'<p class="subnote">'+escape(s.players[g.last.pass])+' passa il turno. Nessuna mossa valida.</p>';
  const disabled=!connected||pending?'disabled':'';
  const closure=s.closed?'<div class="closure-notice" role="status">Partita chiusa <a href="/?vista=partite">Torna alle partite in corso</a></div>':
    s.closeRequest==null?'':s.closeRequest===s.side?
    '<div class="closure-notice" role="status">Richiesta di chiusura inviata. In attesa di risposta.</div>':
    '<div class="closure-notice"><span role="status">'+escape(s.players[s.closeRequest])+' chiede di chiudere la partita.</span><div><button class="outline" data-action="decline-close" '+disabled+'>Rifiuta</button><button class="primary" data-action="accept-close" '+disabled+'>Accetta</button></div></div>';
  return '<div class="room-title"><div class="room-heading"><h1>'+meta.name+'</h1><small>Giocatori in stanza · '+s.players.length+' / 2</small>'+(s.roomName?'<small>'+escape(s.roomName)+'</small>':'')+'</div>'+
    '<div class="room-tools"><div class="tabs" role="tablist" aria-label="Partita e regole"><button id="tab-play" role="tab" aria-controls="tabpanel" aria-selected="'+(tab==='play')+'" tabindex="'+(tab==='play'?0:-1)+'" data-tab="play">'+icon('board')+'Partita</button><button id="tab-rules" role="tab" aria-controls="tabpanel" aria-selected="'+(tab==='rules')+'" tabindex="'+(tab==='rules'?0:-1)+'" data-tab="rules">'+icon('book')+'Regole</button></div>'+
    '<div class="room-actions" role="group" aria-label="Comandi della partita">'+
    (hasMoveHistory?'<button class="outline" data-action="moves" aria-expanded="'+showMoves+'">'+icon('history')+'Mosse</button>':'')+
    '<button class="outline" data-action="invite" aria-label="Copia link di invito">'+icon('link')+'Invita</button><button class="outline" id="chat-toggle" data-action="chat" aria-expanded="'+chatOpen+'">'+chatLabel(s)+'</button>'+
    (!s.closed&&g.result===null&&s.closeRequest==null?'<button class="outline close-game" data-action="close-game" aria-label="Chiudi partita" title="Chiudi partita" '+disabled+'>'+icon('close')+'<span>Chiudi partita</span></button>':'')+'</div></div></div>'+
    closure+'<div class="room-layout '+(chatOpen?'with-chat ':'')+(showMoves?'with-moves':'')+'">'+(showMoves?movePanel(g):'')+
    '<div id="tabpanel" role="tabpanel" aria-labelledby="tab-'+tab+'">'+(tab==='rules'?rules(g.id):
    '<div class="match"><div class="players">'+[0,1].map(i=>'<div class="player '+(g.turn===i&&g.result===null&&s.players[1]?'current':'')+'"><i class="seat-mark seat-'+i+'" aria-hidden="true"></i><strong title="'+escape(s.players[i])+'">'+displayNickname(s.players[i]??'Posto libero',s.playerMarkup?.[i])+(i===s.side?' (tu)':'')+'</strong><small>'+meta.players[i]+'</small></div>').join('')+'</div>'+
    '<div class="banner '+tone+'" role="status"><i></i>'+escape(wording)+'</div>'+pass+
    (g.id==='naval'?naval(g):['scopa','uno'].includes(g.id)?cardTable(g):['go','dots','nim','backgammon'].includes(g.id)?strategyBoard(g):checker(g))+
    '<div class="match-actions">'+(g.canDraw&&acting()?'<button class="outline" data-action="draw">'+icon('draw')+'Richiedi patta</button>':'')+
    (pending&&!busy?'<button class="primary" data-action="retry">'+icon('redo')+'Recupera mossa</button>':'')+
    (prefix.length?'<button class="link" data-action="cancel">Annulla selezione</button>':'')+
    '</div></div>')+'</div>'+(chatOpen?chatPanel():'')+'</div>';
}
function render() {
  cancelCardGesture();
  clearBoardDrag();
  const focused=document.activeElement;
  const previousLog=document.querySelector('#chat-messages');
  const chatScroll=previousLog?.scrollTop??0;
  const chatAtEnd=!previousLog||previousLog.scrollHeight-chatScroll-previousLog.clientHeight<40;
  const deckFocused=focused?.id==='scopa-deck'?'scopa-deck':null;
  const chatFocused=focused?.id==='chat-input', cursor=chatFocused?focused.selectionStart:null;
  const focusData=focused?.closest('#app')&&Object.entries(focused.dataset).find(([key])=>['tab','cell','action','naval'].includes(key));
  const entry=restoring?'<section class="entry"><h1>Caricamento partita…</h1></section>':
    expired?'<section class="entry"><h1>Stanza non disponibile</h1><p>La partita potrebbe essere scaduta o il server locale potrebbe essere stato riavviato.</p><a class="primary" href="/">Torna alla Home</a></section>':
    restoreError?'<section class="entry"><h1>Connessione interrotta</h1><p>'+restoreError+'</p><button class="primary" data-action="restore">Riprova</button></section>':
    '<section class="entry"><h1>Entra nella partita.</h1><p>Servono solo il tuo nickname e il link di invito.</p><button class="primary" data-action="enter">Scegli il nickname</button></section>';
  app.innerHTML=state?room():code?entry:lobby();
  
  if(!state&&!code)filterCatalog();
  if(state&&chatOpen&&!document.hidden){
    markChatRead();
    document.querySelector('#chat-toggle').innerHTML=chatLabel(state);
  }
  const nextLog=document.querySelector('#chat-messages');
  if(nextLog)nextLog.scrollTop=chatAtEnd?nextLog.scrollHeight:chatScroll;
  const moveList=document.querySelector('.move-list');
  if(moveList)moveList.scrollTop=moveList.scrollHeight;
  joinButton.hidden=!!state;
  paintRooms();
  if(state&&tab==='play')drawnVersion=state.version;
  if(focusData) {
    const [key,value]=focusData;
    const button=Array.from(app.querySelectorAll('button')).find(el=>el.dataset[key]===value);
    button?.focus({preventScroll:true});
  }
  if(chatFocused) {
    const input=document.querySelector('#chat-input');
    input?.focus({preventScroll:true});
    input?.setSelectionRange(cursor,cursor);
  }
  if(anchor!==null&&app.querySelector('.navy-setup'))preview(null);
  if(deckFocused)document.getElementById(deckFocused)?.focus({preventScroll:true});
}
async function send(action) {
  if(busy || (!action && !pending)) return;
  if(action) {
    if(pending)return;
    try {savePending(action.close?closeMessage(state,action.close):{id:random(16),version:state.version,action});}
    catch(error){toast(error.message);return;}
  }
  busy=true;render();
  try {
    const next=await api('/moves',pending);
    savePending(null);
    if(!state || next.version>state.version) {
      busy=false;
      accept(next);
      return;
    }
  }
  catch(error) {
    if(error.status&&error.status<500) {
      savePending(null);
      toast(error.message);
      try {accept(await api());}catch {}
    } else toast('Connessione interrotta. Puoi recuperare la stessa mossa.');
  } finally {if(busy){busy=false;render();}}
}
function playCell(i) {
  if(!acting())return;
  const g=game();
  if(g.id==='four'){send({at:i%7});return;}
  if(g.id!=='chess'&&g.id!=='dama'){send({at:i});return;}
  const chess=g.id==='chess';
  const path=[...prefix,i];
  const compatible=g.moves.filter(m=>path.every((at,n)=>at===(chess?[m.from,m.to]:m.path)[n]));
  if(compatible.length) {
    if(chess&&path.length===2) {
      if(compatible.length===1) send(compatible[0]);
      else showModal('<h2>Promuovi il pedone</h2><div class="promotion">'+compatible.map(m=>'<button class="outline" data-promote="'+m.promote+'">'+pieceLabel[m.promote]+'</button>').join('')+'</div>');
      return;
    }
    if(!chess&&compatible[0].path.length===path.length){send({path});return;}
    prefix=path;
  } else prefix=g.moves.some(m=>(chess?m.from:m.path[0])===i)?[i]:[];
  render();
}
function autoPlace() {
  draft=[];
  const filled=new Set();
  for(const size of sizes()) {
    const options=[];
    for(let at=0;at<seaSize()**2;at++)for(const vertical of [true,false]) {
      const ship={at,vertical};
      if(tiles(ship,size).every(i=>i>=0&&!filled.has(i))) options.push(ship);
    }
    const ship=options[Math.floor(Math.random()*options.length)];
    tiles(ship,size).forEach(i=>filled.add(i));
    draft.push(ship);
  }
  render();
}
function placement(at) {
  const length=sizes()[activeShip()];
  if(at===null||!length)return {cells:[],fits:false};
  const cells=tiles({at,vertical},length), occupied=draft.flatMap((ship,i)=>i===editingShip?[]:tiles(ship,sizes()[i]));
  return {cells,fits:cells.every(i=>i>=0&&!occupied.includes(i))};
}
function preview(at) {

  hoverAt=at;
  const {cells,fits}=placement(at??anchor);
  for(const el of app.querySelectorAll('.navy-setup [data-naval]')) {
    const covered=cells.includes(Number(el.dataset.naval));
    el.classList.toggle('ghost-ok',covered&&fits);
    el.classList.toggle('ghost-bad',covered&&!fits);
  }
}
function selectShip(index) {
  editingShip=index;
  anchor=draft[index]?.at??null;
  vertical=draft[index]?.vertical??vertical;
  render();
}
function placeShip(at) {
  if(!placement(at).fits){toast('La nave esce dalla griglia o si sovrappone.');return;}
  draft[activeShip()]={at,vertical};
  editingShip=null;
  anchor=null;
  hoverAt=null;
  render();
}
app.addEventListener('pointerover',e=>{
  const cell=e.target.closest('.navy-setup [data-naval]:enabled');
  if(cell&&!drag)preview(Number(cell.dataset.naval));
});
app.addEventListener('pointerout',e=>{
  if(!drag&&e.target.closest('.navy-setup [data-naval]')&&!e.relatedTarget?.closest?.('.navy-setup [data-naval]'))preview(null);
});
app.addEventListener('focusin',e=>{
  if(e.target.matches('.navy-setup [data-naval]:enabled'))preview(Number(e.target.dataset.naval));
});
app.addEventListener('focusout',e=>{
  if(e.target.matches('.navy-setup [data-naval]'))preview(null);
});
app.addEventListener('pointerdown',e=>{
  if(e.button!==0||!e.target.closest('[data-drag-ship]'))return;
  e.preventDefault();
  const marker=document.createElement('div');
  marker.className='drag-ghost '+(vertical?'vertical':'');
  marker.style.setProperty('--ship-length',sizes()[activeShip()]);
  document.body.append(marker);
  drag={marker,pointer:e.pointerId};
  moveShip(e);
});
function moveShip(e) {
  if(drag?.pointer!==e.pointerId)return;
  const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('.navy-setup [data-naval]:enabled');
  drag.marker.style.transform='translate('+e.clientX+'px,'+e.clientY+'px)';
  drag.marker.classList.toggle('over-grid',!!el);
  preview(el?Number(el.dataset.naval):null);
}
window.addEventListener('pointermove',moveShip);
function finishDrag(e) {
  if(drag?.pointer!==e.pointerId)return;
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.navy-setup [data-naval]:enabled');
  const at=target?Number(target.dataset.naval):null;
  drag.marker.remove();
  drag=null;
  preview(null);
  if(e.type==='pointerup'&&at!==null)placeShip(at);
}
window.addEventListener('pointerup',finishDrag);
window.addEventListener('pointercancel',finishDrag);
function previewGroup(button) {
  for(const el of app.querySelectorAll('.move-preview'))el.classList.remove('move-preview');
  if(!button||button.disabled)return;
  const g=game();
  if(button.hasAttribute('data-nim')) {
    for(let el=button;el;el=el.nextElementSibling)el.classList.add('move-preview');
  } else if(button.closest('.four')) {
    const column=Number(button.dataset.cell)%7;
    for(let i=35+column;i>=0;i-=7) {
      if(!g.board[i]) {
        button.parentElement.querySelector('[data-cell="'+i+'"]').classList.add('move-preview');
        break;
      }
    }
  } else if(button.hasAttribute('data-take')) {
    const take=g.takes[selectedCard]?.[Number(button.dataset.take)]??[];
    const cards=app.querySelectorAll('.card-center .playing-card');
    g.table.forEach((card,i)=>cards[i].classList.toggle('move-preview',take.includes(card)));
  }
}
const previewSelector='[data-take],[data-nim],.four [data-cell]';
for(const type of ['pointerover','focusin','pointerout','focusout']) {
  app.addEventListener(type,event=>{
    const button=event.target.closest(previewSelector);
    if(!button||button.contains(event.relatedTarget))return;
    previewGroup(type==='focusin'||type==='pointerover'?button:null);
  });
}
function cancelCardGesture() {
  if(!cardGesture)return;
  const {ghost,zone,source,frame}=cardGesture;
  cancelAnimationFrame(frame);
  ghost?.remove();
  zone.classList.remove('card-drop-ready','card-drop-hover');
  source.classList.remove('card-in-flight');
  cardGesture=null;
}
function overCardTable(zone,x,y) {
  return zone.contains(document.elementFromPoint(x,y));
}
app.addEventListener('pointerdown',event=>{
  const source=event.target.closest('[data-hand]:enabled');
  if(!source||cardGesture||event.button!==0||!event.isPrimary)return;
  const zone=source.closest('.card-table').querySelector('.card-center');
  cardGesture={source,zone,id:event.pointerId,startX:event.clientX,startY:event.clientY,frame:0};
});
window.addEventListener('pointermove',event=>{
  const d=cardGesture;
  if(!d||event.pointerId!==d.id)return;
  const {clientX:x,clientY:y}=event;
  if(!d.ghost) {
    if(Math.hypot(x-d.startX,y-d.startY)<9)return;
    const box=d.source.getBoundingClientRect();
    d.ghost=d.source.cloneNode(true);
    d.ghost.removeAttribute('data-hand');
    d.ghost.inert=true;
    d.ghost.classList.add('flying-card');
    d.ghost.style.width=box.width+'px';
    d.ghost.style.height=box.height+'px';
    document.body.append(d.ghost);
    d.source.classList.add('card-in-flight');
    d.zone.classList.add('card-drop-ready');
  }
  d.x=x;
  d.y=y;
  if(!d.frame)d.frame=requestAnimationFrame(()=>{
    d.frame=0;
    const over=overCardTable(d.zone,d.x,d.y);
    d.zone.classList.toggle('card-drop-hover',over);
    const box=over?d.zone.getBoundingClientRect():null;
    const cx=box?box.left+box.width/2:d.x;
    const cy=box?box.top+box.height/2:d.y;
    d.ghost.style.transform='translate('+cx+'px,'+cy+'px) translate(-50%,-50%)';
  });
});
window.addEventListener('pointerup',event=>{
  const d=cardGesture;
  if(!d||event.pointerId!==d.id)return;
  const play=d.ghost&&overCardTable(d.zone,event.clientX,event.clientY);
  cancelCardGesture();
  if(!d.ghost)return;
  if(play&&acting())playHand(d.source.dataset.hand);
  ignoreClick=true;
  setTimeout(()=>{ignoreClick=false;},0);
});
window.addEventListener('pointercancel',event=>{
  if(cardGesture?.id===event.pointerId)cancelCardGesture();
});
window.addEventListener('blur',cancelCardGesture);
function clearBoardDrag() {
  if(!boardDrag)return;
  cancelAnimationFrame(boardDrag.frame);
  boardDrag.marker?.remove();
  boardDrag.source.classList.remove('drag-origin');
  boardDrag.target?.classList.remove('drop-preview');
  for(const cell of boardDrag.targets)cell.classList.remove('drop-option');
  boardDrag=null;
}
app.addEventListener('pointerdown',e=>{
  const source=e.target.closest('.chess .cell:enabled,.dama .cell:enabled');
  if(boardDrag||!source||e.button!==0||!source.firstElementChild||!acting())return;
  const from=Number(source.dataset.cell), g=game();
  const destinations=new Set();
  for(const move of g.moves) {
    const path=g.id==='chess'?[move.from,move.to]:move.path;
    if(path[0]===from)destinations.add(path[1]);
  }
  if(!destinations.size)return;
  const board=source.closest('.chess,.dama');
  const targets=new Set([...board.querySelectorAll('[data-cell]')].filter(cell=>destinations.has(Number(cell.dataset.cell))));
  boardDrag={pointer:e.pointerId,from,x:e.clientX,y:e.clientY,source,targets,marker:null,frame:0};
});
function dragTarget(x,y) {
  const cell=document.elementFromPoint(x,y)?.closest('[data-cell]');
  return boardDrag.targets.has(cell)?cell:null;
}
function paintBoardDrag() {
  const d=boardDrag;
  d.frame=0;
  const target=dragTarget(d.clientX,d.clientY);
  if(target!==d.target) {
    d.target?.classList.remove('drop-preview');
    target?.classList.add('drop-preview');
    d.target=target;
  }
  const box=target?.getBoundingClientRect();
  const x=box?box.left+box.width/2:d.clientX;
  const y=box?box.top+box.height/2:d.clientY;
  d.marker.style.transform='translate('+x+'px,'+y+'px) translate(-50%,-50%)';
}
window.addEventListener('pointermove',e=>{
  const d=boardDrag;
  if(d?.pointer!==e.pointerId)return;
  if(!d.marker) {
    if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<7)return;
    d.marker=document.createElement('div');
    d.marker.className='piece-ghost '+game().id;
    d.marker.style.width=d.source.getBoundingClientRect().width+'px';
    d.marker.append(d.source.firstElementChild.cloneNode(true));
    document.body.append(d.marker);
    d.source.classList.add('drag-origin');
    for(const cell of d.targets)cell.classList.add('drop-option');
  }
  d.clientX=e.clientX;
  d.clientY=e.clientY;
  if(!d.frame)d.frame=requestAnimationFrame(paintBoardDrag);
});
function finishBoardDrag(e) {
  if(boardDrag?.pointer!==e.pointerId)return;
  const {marker,from}=boardDrag;
  const target=marker&&e.type==='pointerup'&&dragTarget(e.clientX,e.clientY);
  clearBoardDrag();
  if(!marker)return;
  ignoreClick=true;
  setTimeout(()=>{ignoreClick=false;},0);
  if(!target||!acting())return;
  promotionTarget=Number(target.dataset.cell);
  prefix=[from];
  playCell(promotionTarget);
}
window.addEventListener('pointerup',finishBoardDrag);
window.addEventListener('pointercancel',finishBoardDrag);
window.addEventListener('blur',clearBoardDrag);
app.addEventListener('click',async e=>{
  if(ignoreClick)return;
  const b=e.target.closest('button');if(!b)return;
  const d=b.dataset;
  if(d.filter){gameFilter=d.filter;filterCatalog();return;}
  if(d.closeRoom){closeFromDashboard(d.closeRoom);return;}
  if(d.dismiss) {
    localStorage.removeItem('tavolo:'+d.dismiss);
    monitors.get(d.dismiss)?.();
    monitors.delete(d.dismiss);
    seenRooms.delete(d.dismiss);
    unavailable.delete(d.dismiss);
    paintRooms();
    return;
  }
  if(d.create)nameDialog(d.create);
  if(d.info)showModal(rules(d.info));
  if(d.hand!==undefined&&acting()) {
    if(e.detail===0||e.pointerType==='touch')playHand(d.hand);
    else {
      for(const button of app.querySelectorAll('[data-hand]'))button.classList.toggle('hand-picked',button===b);
      if(e.detail===2)playHand(d.hand);
    }
  }
  if(d.take!==undefined&&acting())send({card:selectedCard,take:game().takes[selectedCard][Number(d.take)]});
  if(d.go!==undefined&&acting())send({at:Number(d.go)});
  if(d.edge!==undefined&&acting())send({edge:Number(d.edge)});
  if(d.nim!==undefined&&acting()) {
    const [pile,count]=d.nim.split(':').map(Number);
    send({pile,count});
  }
  if(d.bg!==undefined&&acting()) {
    const point=/^\d+$/.test(d.bg)?Number(d.bg):d.bg;
    const move=game().moves.find(m=>m.from===prefix[0]&&m.to===point);
    if(move)send(move);else {prefix=[point];render();}
  }
  if(d.tab){tab=d.tab;render();}
  if(d.cell!==undefined)playCell(Number(d.cell));
  if(d.ship!==undefined)selectShip(Number(d.ship));
  if(d.naval!==undefined) {
    const at=Number(d.naval);
    if(game().ready.every(Boolean))send({at});
    else {
      const index=draft.findIndex((ship,i)=>ship&&tiles(ship,sizes()[i]).includes(at));
      if(index>=0)selectShip(index);
      else if(activeShip()>=0)placeShip(at);
    }
  }
  switch(d.action) {
    case 'enter': nameDialog();break;
    case 'restore': restoreRoom();break;
    case 'invite':
      try{await navigator.clipboard.writeText(href());toast('Link di invito copiato.');}
      catch{showModal('<h2>Link di invito</h2><input aria-label="Link di invito" readonly value="'+escape(href())+'">');modal.querySelector('input').select();}
      break;
    case 'remove-ship':
      delete draft[editingShip];
      anchor=null;render();break;
    case 'rotate':
      vertical=!vertical;
      if(draft[editingShip]) {
        if(!placement(anchor).fits){vertical=!vertical;toast('Spazio insufficiente per ruotare la nave.');}
        else draft[editingShip]={at:anchor,vertical};
      }
      render();break;
    case 'chat': chatOpen=!chatOpen;if(chatOpen&&compactRoom.matches)movesOpen=false;render();break;
    case 'moves': movesOpen=tab==='rules'||!movesOpen;tab='play';if(movesOpen&&compactRoom.matches)chatOpen=false;render();break;
    case 'copy-moves': {
      const value=(game().history??[]).map(({ply,san},index)=>((ply%2)?Math.ceil(ply/2)+'. ':index===0?Math.ceil(ply/2)+'... ':'')+san).join(' ');
      try {await navigator.clipboard.writeText(value);toast('Mosse copiate.');}
      catch {showModal('<h2>Copia mosse</h2><textarea class="copy-notation" aria-label="Mosse della partita" readonly>'+escape(value)+'</textarea>');modal.querySelector('textarea').select();}
      break;
    }
    case 'uno-draw': send({draw:true});break;
    case 'uno-pass': send({pass:true});break;
    case 'go-pass':
    case 'bg-pass': send({pass:true});break;
    case 'bg-roll': send({roll:true});break;
    case 'target':
    case 'own-fleet': navalView=d.action;render();break;
    case 'random': editingShip=null;anchor=null;autoPlace();break;
    case 'reset': editingShip=null;anchor=null;draft=[];render();break;
    case 'fleet': send({ships:draft});break;
    case 'cancel': prefix=[];render();break;
    case 'draw': send({draw:true});break;
    case 'retry': send();break;
    case 'close-game': showModal('<h2>Chiudere la partita?</h2><p>'+(state.requiresConsent?'L’altra persona ha già giocato. La partita si chiuderà se accetta.':'La stanza verrà chiusa subito.')+'</p><button class="primary" data-confirm>'+(state.requiresConsent?'Invia richiesta':'Chiudi partita')+'</button>');break;
    case 'accept-close': send({close:'accept'});break;
    case 'decline-close': send({close:'decline'});break;
  }
});
modal.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.unoColor&&selectedCard&&acting()) {modal.close();send({card:selectedCard,color:b.dataset.unoColor});}
  if(b.dataset.promote) {
    const move=game().moves.find(m=>m.from===prefix[0]&&m.promote===b.dataset.promote&&m.to===promotionTarget);
    modal.close();
    if(move&&acting())send(move);
  }
  if(b.hasAttribute('data-confirm')){modal.close();send({close:'request'});}
});
let promotionTarget;
app.addEventListener('click',e=>{
  const b=e.target.closest('[data-cell]');
  if(b)promotionTarget=Number(b.dataset.cell);
},true);
app.addEventListener('keydown',e=>{
  if(e.target.getAttribute('role')==='tab'&&['ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();tab=tab==='play'?'rules':'play';render();document.querySelector('#tab-'+tab).focus();
  }
});
joinButton.onclick=enterDialog;
app.addEventListener('input',event=>{
  if(event.target.id==='game-search'){gameQuery=event.target.value;filterCatalog();}
});
app.addEventListener('change',event=>{
  if(event.target.id==='attention-only'){attentionOnly=event.target.checked;paintRooms();}
});
app.addEventListener('keydown',event=>{
  if(event.target.id==='chat-input'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){
    event.preventDefault();event.target.form.requestSubmit();
  }
});
joinButton.insertAdjacentHTML('beforebegin','<button class="outline profile-button" type="button" id="rename-seat" aria-label="Cambia nickname" title="Cambia nickname">'+icon('profile')+'<span>Nickname</span></button>');
document.querySelector('#rename-seat').onclick=renameDialog;
compactRoom.addEventListener('change',event=>{
  if(event.matches&&movesOpen) {movesOpen=false;render();}
});
joinButton.insertAdjacentHTML('afterbegin',icon('enter'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state)paintChat();});
function updateEditor(field) {
  const parsed=parseChat(field.value), form=field.form;
  const preview=form.querySelector('.editor-preview'), limit=form.querySelector('.editor-limit');
  preview.hidden=parsed.text===field.value;
  preview.innerHTML=parsed.html;
  limit.hidden=parsed.text.trim().length<=Number(field.dataset.editorLimit);
  if(field.id==='chat-input')chatDraft=field.value;
}
function editSelection(control,tag,emoji) {
  const field=control.closest('form')?.querySelector('[data-editor-limit]');
  if(!field||field.matches(':disabled'))return;
  const start=field.selectionStart, end=field.selectionEnd, selected=field.value.slice(start,end);
  const open=tag?'['+tag+']':'', close=tag?'[/'+tag+']':'';
  field.setRangeText(emoji??open+selected+close,start,end,'end');
  field.focus();
  if(tag)field.setSelectionRange(start+open.length,start+open.length+selected.length);
  updateEditor(field);
}
document.addEventListener('input',e=>{if(e.target.matches('[data-editor-limit]'))updateEditor(e.target);});
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-format],[data-emoji]');
  if(!button)return;
  editSelection(button,button.dataset.format,button.dataset.emoji);
  if(button.dataset.emoji)button.closest('details').open=false;
});
document.addEventListener('change',e=>{
  if(!e.target.matches('.editor-color')||!e.target.value)return;
  editSelection(e.target,e.target.value);
  e.target.value='';
});
let chatSending=false;
app.addEventListener('submit',async e=>{
  if(e.target.id!=='chat-form')return;
  e.preventDefault();
  const text=chatDraft.trim();
  if(!text||chatSending)return;
  const visible=parseChat(text).text.trim();
  if(!visible||visible.length>280){toast('Scrivi un messaggio da 1 a 280 caratteri.');return;}
  chatSending=true;
  const room=code, seat=token, previous=chatDraft;
  try {
    accept(await api('/chat',{text,id:random(16),format:'basic'},room,seat));
    if(chatDraft===previous) {
      chatDraft='';
      const input=document.querySelector('#chat-input');
      if(input){input.value='';updateEditor(input);}
    }
  } catch(error){toast(error.message);}
  finally{chatSending=false;}
});
render();
monitorRooms();
restoreRoom();
