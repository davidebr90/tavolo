import { guides } from './guides.mjs';
import { catalog } from './catalog.mjs';
import { savedSeats, roomStatus, roomTransport, watchRoom, chatEntries, unreadChat, lastChessMove } from './rooms.mjs';
import { icon } from './icons.mjs';
import { parseChat, chatColors, renderChatMessage } from './chat-format.mjs';
import { cardKey, cardSvg, loadDeck, scopaDecks } from './card-art.mjs';
import { moveEffects, seatHasTurn, kingSquare } from './effects.mjs';
import * as fx from './motion.mjs';
import { version, updatedAt } from './version.mjs';
import { shipTiles, shipSectors as fleetSectors, rotateShip } from './fleet.mjs';
import { seatStat, turnNotes, chessMaterial } from './stats.mjs';
import * as rich from './rich-editor.mjs';

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
let cardHints=localStorage.getItem('tavolo-card-hints')==='1';
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
// Release badge next to the logo: the version is known at once, the core update time comes from the server.
function paintRelease(updated) {
  const el=document.querySelector('#release'), date=updatedAt(updated);
  const day=date&&new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(date);
  const hour=date&&new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(date);
  const long=date&&new Intl.DateTimeFormat('it-IT',{dateStyle:'long',timeStyle:'short'}).format(date);
  el.innerHTML='<span class="sr-only">Versione </span><span class="release-version">v'+escape(version)+'</span>'+
    (date?'<span class="sr-only">, core aggiornato il </span><time datetime="'+date.toISOString()+'"><span>'+escape(day)+'</span> <span>'+escape(hour)+'</span></time>':'');
  el.title='Tavolo '+version+(date?' · core aggiornato il '+long:'');
  el.classList.toggle('recent',Boolean(date)&&Date.now()-date.getTime()<864e5);
  el.classList.toggle('dated',Boolean(date));
  el.hidden=false;
}
paintRelease();
const settings=fetch('/api/config',{signal:AbortSignal.timeout(2000)}).then(r=>r.ok?r.json():null).then(config=>{transport=roomTransport(config);paintRelease(config?.updated);}).catch(()=>{});

function toast(message) {
  const el=document.querySelector('#toast');
  el.hidden=true;
  void el.offsetWidth;
  el.textContent=message;
  el.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.hidden=true;},4200);
}
document.querySelector('#toast').addEventListener('click',e=>{e.currentTarget.hidden=true;clearTimeout(toastTimer);});
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
  const boardOrigins=boardSnapshot(next.game.id);
  notifyClosure(state,next);
  state=next;
  prefix=[];
  selectedCard=null;
  seenRooms.set(code,next);
  render();
  if(incoming)showStrike(incoming);
  animateCards(previousRoom,next,cardOrigins);
  playEffects(moveEffects(previousRoom,next),previousRoom,next,boardOrigins);
  draggedMove=false;
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
const modeTitle=mode=>mode==='code'?'Modalità codice attiva: torna al testo formattato':'Mostra i codici di formattazione';
function editorTools() {
  const mode=rich.editorMode();
  return '<div class="editor-tools" role="group" aria-label="Formattazione">'+
    [['b','Grassetto (Ctrl+B)','B'],['i','Corsivo (Ctrl+I)','I'],['u','Sottolineato (Ctrl+U)','U'],['s','Barrato','S']].map(([tag,label,text])=>'<button type="button" class="outline format-'+tag+'" data-format="'+tag+'" aria-label="'+label+'" aria-pressed="false" title="'+label+'">'+text+'</button>').join('')+
    '<details class="color-picker"><summary aria-label="Colore del testo" title="Colore del testo"><span class="color-sample">A</span></summary><div class="color-grid">'+
    Object.entries(chatColors).map(([color,label])=>'<button type="button" class="swatch chat-color-'+color+'" data-color="'+color+'" aria-label="'+label+'" title="'+label+'">A</button>').join('')+
    '<button type="button" class="swatch swatch-clear" data-color="" aria-label="Nessun colore" title="Nessun colore">⌀</button></div></details>'+
    '<details class="emoji-picker"><summary aria-label="Emoji" title="Emoji">☺</summary><div class="emoji-grid">'+['😀','😂','😉','😎','🤔','😮','😅','😬','👍','👏','🙌','❤️','🔥','🎉','🤝','🎯','🏆','♟️'].map(emoji=>'<button type="button" data-emoji="'+emoji+'">'+emoji+'</button>').join('')+'</div></details>'+
    '<button type="button" class="outline editor-mode" data-editor-mode aria-pressed="'+(mode==='code')+'" aria-label="Modalità codice" title="'+modeTitle(mode)+'"><span aria-hidden="true">&lt;/&gt;</span></button></div>';
}
// Visual field plus the markup textarea; only the one for the current mode is visible.
function editorField({id,label,value,limit,maxlength,placeholder='',multiline=false,disabled=false}) {
  const mode=rich.editorMode();
  return '<div class="rich-input" id="'+id+'-rich" contenteditable="'+(disabled?'false':'true')+'" role="textbox" aria-label="'+escape(label)+'" aria-multiline="'+multiline+'" data-for="'+id+'" data-placeholder="'+escape(placeholder)+'"'+(mode==='code'?' hidden':'')+'>'+rich.richHtml(value)+'</div>'+
    '<textarea id="'+id+'" rows="1" maxlength="'+maxlength+'" data-editor-limit="'+limit+'" aria-label="'+escape(label)+'" placeholder="'+escape(placeholder)+'"'+(mode==='rich'?' hidden':'')+'>'+escape(value)+'</textarea>';
}
function editorPreview(value,limit) {
  const parsed=parseChat(value);
  return '<div class="editor-preview" '+(parsed.text===value||rich.editorMode()==='rich'?'hidden':'')+'>'+parsed.html+'</div><small class="editor-limit" '+(parsed.text.trim().length<=limit?'hidden':'')+'>Massimo '+limit+' caratteri.</small>';
}
function dialogForm(title,label,submitText,handler,value='',formatted=false) {
  const field=formatted?editorField({id:'room-field',label,value,limit:24,maxlength:240}):
    '<input id="room-field" required maxlength="100" autocomplete="off" aria-describedby="room-error" value="'+escape(value)+'">';
  showModal('<h2>'+title+'</h2><form class="form"><label for="room-field" id="room-label">'+label+'</label>'+(formatted?editorTools():'')+'<div class="form-row">'+field+'<button class="primary">'+submitText+'</button></div>'+(formatted?editorPreview(value,24):'')+'<p id="room-error" role="alert" class="error"></p></form>');
  const form=modal.querySelector('.form'), input=form.querySelector('#room-field'), visual=form.querySelector('.rich-input');
  form.querySelector('#room-label').onclick=e=>{if(visual&&!visual.hidden){e.preventDefault();rich.caretToEnd(visual);}};
  if(visual&&!visual.hidden) {
    visual.focus();
    if(value)getSelection().selectAllChildren(visual);
  } else if(value)input.select();else input.focus();
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
    const options=gameId==='naval'?{size:Number(modal.querySelector('#sea-size').value),ships:Number(modal.querySelector('#ship-count').value)}:modal.querySelector('#room-players')?{players:Number(modal.querySelector('#room-players').value)}:undefined;
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
  if(gameId) {
    const counts=gameId==='scopa'?[2,4]:gameId==='uno'?Array.from({length:9},(_,i)=>i+2):[2];
    const description=n=>gameId==='scopa'?(n===4?'Scopone scientifico · Due coppie, posti alternati. Dieci carte ciascuno, tavolo vuoto.':'Scopa classica · Tre carte ciascuno e quattro sul tavolo.'):n+' posti. La partita inizia quando tutti sono entrati.';
    const field=counts.length===1?'<strong>2 giocatori</strong>':'<label>Giocatori da attendere <select id="room-players">'+counts.map(n=>'<option value="'+n+'">'+n+(gameId==='scopa'?(n===4?' · Scopone scientifico':' · Scopa classica'):' giocatori')+'</option>').join('')+'</select></label>';
    modal.querySelector('.room-name-label').insertAdjacentHTML('afterend','<div class="room-capacity">'+field+'<small aria-live="polite">'+description(2)+'</small></div>');
    const select=modal.querySelector('#room-players');
    if(select)select.onchange=()=>modal.querySelector('.room-capacity small').textContent=description(Number(select.value));
  }
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
const pipLayout={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
const pips=value=>(pipLayout[value]??[]).map(n=>'<b style="grid-area:'+(Math.ceil(n/3))+'/'+((n-1)%3+1)+'"></b>').join('');
function art(id) {
  const scene=(name,body)=>'<div class="scene '+name.split(' ').map(part=>part+'-scene').join(' ')+'">'+body+'</div>';
  switch(id) {
    case 'chess': return scene('chess','<i class="board-patch"></i><span class="knight">♞</span><span class="pawn">♟</span>');
    case 'naval': return scene('naval','<i class="wave"></i><i class="wave"></i><i class="hull"></i><i class="sonar"></i><i class="blip"></i>');
    case 'four': return '<div class="scene four-scene">'+('.....'+'...g.'+'.c.cg'+'cg.gc').split('').map(c=>'<i'+(c==='.'?'':' class="'+c+'"')+'></i>').join('')+'<b class="drop"></b></div>';
    case 'reversi': return scene('duo reversi','<i></i><i></i>');
    case 'dama': return scene('duo dama','<i></i><i></i>');
    case 'tris': return scene('tris','<svg viewBox="0 0 96 96" aria-hidden="true"><path class="grid" d="M33 6v84M63 6v84M6 33h84M6 63h84"/><path class="x" pathLength="1" d="M12 12l14 14M26 12 12 26"/><circle class="o" pathLength="1" cx="48" cy="48" r="9"/><path class="x" pathLength="1" d="M70 70l14 14M84 70 70 84"/></svg>');
    case 'scopa': return scene('fan scopa','<i></i><i></i><i></i>');
    case 'uno': return scene('fan uno','<i><b>7</b></i><i><b>+2</b></i><i><b>↺</b></i>');
    case 'backgammon': return scene('dice','<i class="die-art">'+pips(5)+'</i><i class="die-art">'+pips(3)+'</i>');
    case 'go': return scene('go','<i></i><i class="w"></i><i></i><i class="w"></i><i></i>');
    case 'nim': return scene('nim','<span><i></i></span><span><i></i><i></i><i></i></span><span><i></i><i></i><i></i><i></i><i></i></span>');
    case 'dots': return scene('dots','<b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b><b></b><i class="e1"></i><i class="v e2"></i><i class="e3"></i><i class="v e4"></i><i class="fill"></i>');
  }
  return '';
}
function lobby() {
  const seats=savedSeats();
  const requested=new URLSearchParams(location.search).get('vista');
  const dashboard=requested==='partite'||(!requested&&seats.length>0);
  const nav='<nav class="dashboard-nav" aria-label="Menu Home"><a href="/?vista=partite" '+(dashboard?'aria-current="page"':'')+'>Partite in corso</a><a href="/?vista=giochi" '+(!dashboard?'aria-current="page"':'')+'>Esplora giochi</a></nav>';
  if(dashboard) return nav+'<section class="catalog"><div class="section-head"><div><span class="eyebrow">Le tue stanze</span><h1>Partite <em>in corso</em></h1><p>Riprendi una stanza o controlla a chi tocca.</p></div><a class="primary" href="/?vista=giochi">'+icon('plus')+'Nuova partita</a></div><label class="room-filter"><input type="checkbox" id="attention-only" '+(attentionOnly?'checked':'')+'> Solo partite da seguire</label><div id="saved-rooms"></div></section>';
  return nav+'<section class="catalog" aria-labelledby="catalog-title"><div class="section-head"><div><span class="eyebrow">Sala giochi · '+Object.keys(catalog).length+' tavoli</span><h1 id="catalog-title">Scegli il <em>gioco</em></h1><p>Crea una stanza e invita chi vuoi sfidare.</p></div><span>Da 2 a 10 giocatori secondo il gioco</span></div>'+
    '<div class="catalog-tools"><label class="game-search">'+icon('search')+'<input type="search" id="game-search" aria-label="Cerca un gioco" aria-keyshortcuts="/" placeholder="Cerca un gioco…" value="'+escape(gameQuery)+'"><kbd aria-hidden="true">/</kbd></label><div class="game-filters" role="group" aria-label="Tipo di gioco">'+Object.entries(gameFilters).map(([key,label])=>'<button class="outline" type="button" data-filter="'+key+'" aria-pressed="'+(gameFilter===key)+'">'+label+'</button>').join('')+'</div></div>'+
    '<p class="empty-rooms" id="catalog-empty" role="status" hidden>Nessun gioco trovato.</p><div class="cards">'+Object.entries(catalog).map(([id,g],i)=>
    '<article class="card" data-game="'+id+'" style="--i:'+i+'"><div class="art '+g.color+'" aria-hidden="true">'+art(id)+'</div><div class="card-body"><h2>'+g.name+'</h2><p>'+g.desc+'</p><div class="card-actions"><button class="primary" data-create="'+id+'" aria-label="Crea stanza · '+g.name+'">'+icon('plus')+'Crea stanza</button><button class="link" data-info="'+id+'" aria-label="Regole di '+g.name+'">'+icon('book')+'Regole</button></div></div></article>').join('')+'</div></section>';
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
    return rank(a)-rank(b)||(seenRooms.get(b.code)?.createdAt??0)-(seenRooms.get(a.code)?.createdAt??0)||a.code.localeCompare(b.code);
  });
  function row({code:key},index) {
    const s=seenRooms.get(key), status=s?roomStatus(s):{tone:'waiting',label:unavailable.has(key)?'Non disponibile':'Connessione…'};
    const unread=s?unreadCount(key,s):0;
    const date=Number.isFinite(s?.createdAt)?new Date(s.createdAt):null;
    const created=date&&Number.isFinite(date.getTime())?'<time datetime="'+date.toISOString()+'">'+escape(new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(date))+'</time>':'<span>Data non disponibile</span>';
    const game=s&&catalog[s.game.id];
    const title=s?.game.id==='scopa'&&s.maxPlayers===4?'Scopone scientifico':game?.name??'Stanza';
    const capacity=s?.maxPlayers??2, free=s?Math.max(0,capacity-s.players.length):0;
    const active=s&&!s.closed&&s.game.result===null;
    const people=s?s.players.map((name,i)=>{
      const turn=active&&free===0&&s.game.turn===i&&s.closeRequest==null&&(s.game.id!=='naval'||s.game.ready.every(Boolean));
      return '<li class="room-person">'+icon('profile')+displayNickname(name,s.playerMarkup?.[i])+(i===s.side?' <em>Tu</em>':'')+(turn?' <em>Di turno</em>':'')+'</li>';
    }).join(''):'';
    const seats=s?'<div class="room-seats"><span>Giocatori <b>'+s.players.length+' / '+capacity+'</b></span>'+
      (active&&free?'<small>'+free+(free===1?' posto libero':' posti liberi')+'</small>':'')+'</div><ul class="room-people">'+people+'</ul>':'';
    const remove=status.tone==='done'||unavailable.has(key);
    const action=remove?'<button class="link" data-dismiss="'+key+'">Rimuovi</button>':
      s&&s.closeRequest==null?'<button class="link room-manage" data-close-room="'+key+'" '+(closingRooms.has(key)?'disabled aria-busy="true"':'')+'>Chiudi partita</button>':'';
    const artwork=game?'<span class="room-thumbnail '+game.color+'" aria-hidden="true"><span>'+art(s.game.id)+'</span></span>':'';
    const open=unavailable.has(key)?'':'<a class="primary" href="/?stanza='+key+'">'+(remove?'Vedi partita':'Apri stanza')+'</a>';
    return '<article class="room-summary" data-tone="'+status.tone+'" style="--i:'+index+'"><header>'+artwork+'<div><h2>'+escape(s?.roomName||title)+'</h2><small>'+escape((s?.roomName?title+' · ':'')+'#'+key.slice(-8))+'</small></div>'+
      '<span class="room-status '+status.tone+'">'+status.label+'</span></header>'+seats+
      '<footer><div class="room-record">'+(date?'Creata il '+created:'')+(unread?' <span class="unread-pill">'+icon('chat')+unread+' non letti</span>':'')+'</div><div class="room-actions">'+action+open+'</div></footer></article>';
  }
  const finished=entry=>unavailable.has(entry.code)||(seenRooms.has(entry.code)&&roomStatus(seenRooms.get(entry.code)).tone==='done');
  const active=seats.filter(entry=>!finished(entry)&&(!attentionOnly||needsAttention(entry.code))), recent=seats.filter(finished);
  const entering=!target.dataset.painted&&fx.lively();
  target.dataset.painted='1';
  target.innerHTML=(active.length?'<div class="saved-rooms'+(entering?' enter':'')+'">'+active.map(row).join('')+'</div>':'<p class="empty-rooms">'+(attentionOnly?'Nessuna partita in attesa di una tua azione.':'Nessuna partita in corso.')+'</p>')+
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
let tabChanged=false;
// A freshly opened panel slides in; on narrow screens it sits below the board, so bring it into view.
function revealPanel(selector,focusComposer) {
  const panel=document.querySelector(selector);
  if(!panel)return;
  fx.flash(panel,'panel-enter',600);
  if(compactRoom.matches)panel.scrollIntoView({block:'nearest',behavior:fx.lively()?'smooth':'auto'});
  if(focusComposer&&!compactRoom.matches) {
    const box=panel.querySelector('.rich-input:not([hidden])');
    if(box)rich.caretToEnd(box);else panel.querySelector('textarea:not([hidden])')?.focus({preventScroll:true});
  }
}
function rules(id,enter=true) {
  const g=catalog[id];
  return '<div class="rules'+(enter?' enter':'')+'"><h2>Come si gioca a <em>'+(id==='chess'?'scacchi':id==='dama'?'dama':g.name.toLowerCase())+'</em></h2>'+
    guides[id].map(([title,copy,kind],i)=>'<section'+(kind?' class="rule-'+kind+'"':'')+' style="--i:'+i+'"><h3>'+title+'</h3>'+
      (Array.isArray(copy)?'<ul>'+copy.map(item=>'<li>'+item+'</li>').join('')+'</ul>':'<p>'+copy+'</p>')+'</section>').join('')+
    '<a href="'+g.source[1]+'" target="_blank" rel="noopener noreferrer">'+g.source[0]+' ↗</a></div>';
}
function banner(s) {
  const g=s.game;
  if(s.closed) return ['neutral','Partita chiusa'];
  if(g.result!==null&&g.id==='scopa'&&s.maxPlayers===4)return ['neutral','Ha vinto la squadra '+(g.result+1)];
  if(g.result!==null) return ['neutral',g.result==='draw'?'Partita pari':g.result===s.side?'Hai vinto!':s.players[g.result]+' ha vinto'];
  if(!connected) return ['neutral','Riconnessione…'];
  if(pending) return ['neutral',busy?(pending.action.close?'Chiusura in invio…':'Mossa in invio…'):'Conferma da recuperare'];
  if(s.players.length<(s.maxPlayers??2)) return ['neutral','In attesa · '+s.players.length+' di '+(s.maxPlayers??2)+' giocatori'];
  if(g.id==='naval'&&!g.ready.every(Boolean)) return ['neutral',g.ready[s.side]?'In attesa della flotta avversaria':'Schiera la tua flotta'];
  if(g.turn===s.side) return ['green',g.check?'Tocca a te · Sei sotto scacco':'Tocca a te'];
  return ['red','Turno di '+s.players[g.turn]];
}
const acting=()=>connected&&!pending&&!state.closed&&state.players.length===(state.maxPlayers??2)&&game().turn===state.side&&game().result===null;

const distance=(a,b,width=8)=>Math.max(Math.abs(a%width-b%width),Math.abs(Math.floor(a/width)-Math.floor(b/width)));
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
  const checkAt=chess&&g.check&&g.result===null?kingSquare(board,g.turn):-1;
  const origin=prefix.at(-1);
  const flipped=id==='reversi'&&newest&&Array.isArray(last?.changed)?last.changed:[];
  const mustTake=id==='dama'&&acting()&&!prefix.length&&moves.some(m=>m.taken?.length);
  const cells=Array.from({length:board.length},(_,i)=>mayReverse?board.length-1-i:i).map(i=>{
    const v=board[i];
    const width=id==='tris'?3:id==='four'?7:8;
    const dark=(i%width+Math.floor(i/width))%2===(id==='dama'?0:1);
    const viable=flip?choices.has(i):moves.some(m=>m.at===(id==='four'?i%7:i));
    const isLast=last?.at===i||last?.to===i;
    const target=viable&&acting()&&(id==='reversi'||(flip&&prefix.length>0));
    const line=last?.line?.indexOf(i)??-1;
    const style=[flip?(dark?'dark':'light'):'',origin===i?'selected':'',!target&&!flip&&viable&&acting()&&id!=='four'?'viable':'',
      line>=0?'win':'',isLast?'last':'',checkAt===i?'in-check':'',newest&&isLast?'animate':'',id==='dama'&&newest&&last?.path?.includes(i)&&!isLast?'trail':''].join(' ');
    const cellStyle=[line>=0?'--k:'+line:'',id==='four'&&newest&&isLast?'--row:'+Math.floor(i/7):''].filter(Boolean).join(';');
    let content='', label=flip||id==='reversi'?square(i):coord(i,width);
    if(v && chess) {
      const white=v===v.toUpperCase();
      content='<span class="chess-piece '+(white?'white':'black')+'">'+glyph[v.toLowerCase()]+'</span>';
      label+=' '+pieceLabel[v.toLowerCase()]+(white?' bianco':' nero');
    } else if(v) {
      const flipping=flipped.indexOf(i);
      content=id==='tris'?'<svg class="mark p'+v+'" viewBox="0 0 100 100" aria-hidden="true">'+(v===1?'<path pathLength="1" d="M24 24 76 76M76 24 24 76"/>':'<circle pathLength="1" cx="50" cy="50" r="28"/>')+'</svg>':
        '<span class="disc p'+((v-1)%2+1)+(flipping>=0?' flip-in':'')+'"'+(flipping>=0?' style="--d:'+(80+distance(i,last.at)*70)+'ms"':'')+'>'+(v>=3?'♛':'')+'</span>';
      label+=' '+catalog[id].players[(v-1)%2];
    }
    const movable=flip&&moves.some(m=>(chess?m.from:m.path[0])===i);
    const choose=acting()&&(viable||movable);
    if(target) {
      const capture=chess?Boolean(v||moves.some(m=>m.from===prefix[0]&&m.to===i&&m.ep)):
        id==='dama'&&Math.abs(i%8-prefix.at(-1)%8)===2;
      const delay=origin===undefined?0:distance(i,origin)*38;
      content+='<span aria-hidden="true" class="chess-target '+(capture?'chess-capture':'')+'" style="--d:'+delay+'ms"></span>';
      label+=capture?' · Cattura disponibile':' · Destinazione disponibile';
    }
    return cell(content,style+(movable?' draggable-piece'+(mustTake?' must':''):''),'data-cell="'+i+'"'+(cellStyle?' style="'+cellStyle+'"':''),id==='four'?'Colonna '+(i%7+1):label,choose);
  }).join('');
  const boardHtml='<div class="board '+id+'">'+cells+'</div>';
  return flip||id==='reversi'?boardRuler(boardHtml,mayReverse?'hgfedcba':'abcdefgh',mayReverse?'12345678':'87654321'):boardHtml;
}
function tiles(ship,length) {
  return shipTiles(ship,length,seaSize());
}
function navyGrid(ships,shots,target,placing) {
  const size=seaSize();
  const hull=new Map();
  ships?.forEach((ship,index)=>{
    const cells=shipSectors(ship,sizes()[index]);
    cells.forEach((at,i)=>hull.set(at,{index,sector:i+1,length:cells.length}));
  });
  const fired=new Map(shots.map(m=>[m.at,m]));
  const sunk=new Set(shots.flatMap(m=>m.sunk??[]));
  const grid='<div class="navy-grid" style="--sea-size:'+size+'">'+Array.from({length:size*size},(_,i)=>{
    const shot=fired.get(i), ship=hull.get(i), down=sunk.has(i);
    const number=ship?'<small class="sector-number">'+ship.sector+'</small>':'';
    const tile=cell(number+(shot?(shot.hit?'×':'·'):''),[ship?'hull ship-color-'+ship.index:'',placing&&ship&&ship.index===editingShip?'moving-origin':'',shot?.hit?'hit':shot?'miss':'',down?'sunk':'',state.version>drawnVersion&&game().last?.at===i&&game().last.side===(target?state.side:1-state.side)?'animate':''].join(' '),
      'data-naval="'+i+'"',coord(i,size)+(shot?(shot.hit?' colpito':' acqua'):ship?' nave '+(ship.index+1)+' settore '+ship.sector+(ship.sector===1?' prua':ship.sector===ship.length?' poppa':''):''),placing||(target&&acting()&&!shot));
    if(!placing||!ship||ship.length===1)return tile;
    return '<div class="ship-sector">'+tile+'<span class="turn-ship">'+[-1,1].map(dir=>'<button data-pivot="'+i+'" data-spin="'+dir+'" aria-label="Ruota '+(dir===1?'in senso orario':'in senso antiorario')+'">'+(dir===1?'↻':'↺')+'</button>').join('')+'</span></div>';
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
let draggedMove=false;
const pieceHtml=p=>'<span class="chess-piece '+(p===p.toUpperCase()?'white':'black')+'">'+glyph[p.toLowerCase()]+'</span>';
const discHtml=v=>'<span class="disc p'+((v-1)%2+1)+'">'+(v>=3?'♛':'')+'</span>';
function boardSnapshot(id) {
  if(id!=='nim'||!fx.lively())return null;
  return Array.from(app.querySelectorAll('.nim-row'),row=>Array.from(row.querySelectorAll('.cell'),el=>el.getBoundingClientRect()));
}
function playEffects(list,prev,next,before) {
  if(!list.length||!fx.lively()||tab!=='play'||document.hidden)return;
  const g=next.game, id=g.id, own=prev.game.turn===prev.side, quick=own&&draggedMove;
  const q=selector=>app.querySelector(selector);
  const at=i=>q('[data-cell="'+i+'"]')??q('[data-go="'+i+'"]')??q('[data-bg="'+i+'"]');
  const rect=el=>el?.getBoundingClientRect?.();
  const board=q('.board,.bg-board,.dots-board,.nim-board,.card-table,.navy-battle');
  const later=(ms,run)=>setTimeout(run,ms);
  let landing=quick?0:360, captures=0;
  for(const e of list) switch(e.type) {
    case 'slide': {
      if(quick)break;
      const knight=/n/i.test(g.board[e.to]??'');
      const target=at(e.to);
      fx.travel(target?.querySelector('.chess-piece'),[rect(at(e.from)),rect(target)],{duration:knight?500:400,arc:knight?(target?.offsetHeight??40)*.9:0})
        .then(()=>fx.ring(target,{scale:1.5,duration:480}));
      landing=knight?560:440;
      break;
    }
    case 'hop': {
      const end=at(e.path.at(-1));
      if(!quick&&e.path.length>1) {
        fx.travel(end?.querySelector('.disc'),e.path.map(i=>rect(at(i))),{duration:340,arc:(end?.offsetHeight??40)*.7,host:'dama'});
        landing=e.path.length*340;
      }
      later(landing,()=>fx.ring(end,{scale:1.5,duration:480}));
      break;
    }
    case 'capture': {
      const r=rect(at(e.at));
      const delay=id==='dama'&&!quick?220+captures*340:landing*.8;
      captures++;
      later(delay,()=>{
        fx.vanish(r,id==='chess'?pieceHtml(e.piece):discHtml(e.piece),{host:id});
        fx.burst(...fx.centerOf(r),{kind:'spark',count:26,colors:fx.palettes.fuoco,speed:[2,8],life:[400,800]});
        fx.shake(board,3);
      });
      break;
    }
    case 'promote':
    case 'crown': later(landing+120,()=>{fx.sparkle(at(e.at),fx.palettes.oro,28);fx.ring(at(e.at),{scale:2.6,duration:800});});break;
    case 'check': later(landing+100,()=>{fx.ring(at(e.at),{color:'#ff6a4d',scale:2.8,duration:900,width:3});fx.announce('Scacco!',{tone:'red',hold:850});});break;
    case 'place': {
      const cellEl=at(e.at);
      later(id==='go'?120:60,()=>{
        fx.ring(cellEl,{color:id==='go'?'#3a2410':id==='tris'?(prev.game.turn?'#58c4b4':'#ff8a6a'):'#f4dc9c',scale:id==='go'?1.4:1.8,duration:500});
        if(id==='go')fx.burstAt(cellEl,{kind:'smoke',count:5,colors:['#c9a06a'],speed:[.3,1],gravity:0,life:[400,700],size:[3,6]});
      });
      break;
    }
    case 'flip': for(const i of e.cells) later(380+distance(i,e.origin)*70,()=>fx.burstAt(at(i),{kind:'star',count:4,colors:fx.palettes.oro,speed:[.5,2.5],life:[300,600],size:[1.5,3]}));break;
    case 'drop': later(620,()=>{fx.ring(at(e.at),{color:prev.game.turn?'#f5c04a':'#ff8a6a',scale:1.7,duration:500});fx.shake(board,2);});break;
    case 'line': e.cells.slice().sort((a,b)=>a-b).forEach((i,k)=>later(720+k*130,()=>{fx.sparkle(at(i),fx.palettes.oro,14);fx.ring(at(i),{scale:1.8});}));break;
    case 'capture-stones': e.cells.forEach((i,k)=>later(160+k*70,()=>{
      fx.vanish(rect(at(i)),'<span class="disc p'+e.color+'"></span>',{host:'go'});
      fx.burstAt(at(i),{kind:'smoke',count:6,colors:fx.palettes.fumo,speed:[.3,1.2],gravity:-.02,life:[500,900],size:[3,7]});
    }));break;
    case 'remove': {
      const row=before?.[e.pile]??[];
      row.slice(e.from-e.count).forEach((r,k)=>later(k*70,()=>{
        fx.vanish(r,'<span class="fx-match"></span>',{drift:-70,duration:700});
        fx.burst(r.left+r.width/2,r.top,{kind:'ember',count:10,colors:fx.palettes.fuoco,speed:[.5,2.5],gravity:-.05,life:[500,900],size:[1.5,3]});
      }));
      break;
    }
    case 'edge': later(200,()=>fx.burstAt(q('[data-edge="'+e.edge+'"]'),{kind:'star',count:6,colors:prev.game.turn?['#b5d4ff','#6fb4ff']:['#d9c8ff','#a98be8'],speed:[.5,2],life:[300,600],size:[1.5,3]}));break;
    case 'boxes': e.cells.forEach((i,k)=>later(300+k*120,()=>{
      const box=q('[data-box="'+i+'"]');
      fx.flash(box,'fresh',800);
      fx.burstAt(box,{kind:'confetti',count:18,colors:e.owner===1?['#d9c8ff','#a98be8','#f4dc9c']:['#b5d4ff','#6fb4ff','#f4dc9c'],speed:[2,5],gravity:.15,life:[700,1100],size:[2,4]});
    }));break;
    case 'dice': app.querySelectorAll('.die').forEach((die,k)=>die.animate([
      {transform:'translate(-60px,-40px) rotate(-540deg) scale(.4)',opacity:0},
      {transform:'translate(6px,-10px) rotate(25deg) scale(1.15)',opacity:1,offset:.65},
      {transform:'translate(-2px,0) rotate(-6deg)',offset:.85},{transform:'none'}],{duration:760+k*140,easing:'cubic-bezier(.2,.8,.3,1)'}));break;
    case 'checker': {
      const dest=at(e.to)?.querySelectorAll('.checker');
      const piece=dest?.[dest.length-1];
      const origin=e.from==='bar'?q('[data-bg="bar"]'):at(e.from);
      if(piece&&origin) {
        const size=rect(piece), o=rect(origin);
        fx.travel(piece,[{left:o.left+o.width/2-size.width/2,top:o.top+o.height/2-size.height/2,width:size.width,height:size.height},size],{duration:460,arc:60});
      }
      break;
    }
    case 'hit': later(440,()=>{fx.explosion(at(e.at));fx.ring(at(e.at),{color:'#ff6a4d',scale:2.2});});break;
    case 'bear-off': fx.sparkle(at(e.from),fx.palettes.oro,20);break;
    case 'strike': {
      const grid=q(e.grid==='target'?'.target-grid':'.own-grid');
      const target=grid?.querySelector('[data-naval="'+e.at+'"]');
      const delay=e.grid==='own'?1050:80;
      later(delay,()=>{
        if(e.hit){fx.explosion(target);fx.shake(grid?.querySelector('.navy-grid'),5);fx.ring(target,{color:'#ffb03d',scale:2.6,duration:700});}
        else {fx.splash(target);fx.ring(target,{color:'#9be3f5',scale:2.4,duration:800});later(160,()=>fx.ring(target,{color:'#9be3f5',scale:1.6,duration:700}));}
      });
      if(e.sunk.length) {
        later(delay+350,()=>e.sunk.forEach((i,k)=>later(k*110,()=>fx.explosion(grid?.querySelector('[data-naval="'+i+'"]')))));
        fx.announce(e.grid==='target'?'Affondata!':'Nave persa',{tone:e.grid==='target'?'gold':'red',hold:1100});
      }
      break;
    }
    case 'battle': fx.announce('Battaglia!',{tone:'teal',sub:'Le flotte sono schierate'});break;
    case 'sweep': later(700,()=>{
      fx.announce('Scopa!',{tone:e.mine?'gold':'red',sub:e.mine?'':'per gli avversari'});
      if(e.mine)fx.burstAt(q('.card-center'),{kind:'confetti',count:60,colors:fx.palettes.festa,speed:[4,11],angle:[-Math.PI*.9,-Math.PI*.1],gravity:.2,life:[1200,2000],size:[3,6]});
    });break;
    case 'round': later(900,()=>fx.announce('Smazzata '+e.round,{tone:'teal',sub:'Punti '+e.scores[next.side%2]+' – '+e.scores[1-next.side%2],hold:1300}));break;
    case 'wild': later(own?520:700,()=>{const top=q('.card-center .playing-card');fx.ring(top,{color:({R:'#ff6b5a',G:'#3fd087',B:'#4d95f0',Y:'#ffd84d'})[e.color],scale:2.6,duration:900,width:4});fx.burstAt(top,{kind:'star',count:30,colors:fx.palettes[e.color]??fx.palettes.festa,speed:[2,7],life:[600,1100]});});break;
    case 'penalty': later(700,()=>fx.announce('+'+e.amount,{tone:'red',hold:700}));break;
    case 'reverse': later(own?520:700,()=>q('.card-center .playing-card')?.animate([{transform:'none'},{transform:'rotate(-360deg) scale(1.15)',offset:.7},{transform:'none'}],{duration:700,easing:'cubic-bezier(.3,.7,.3,1)'}));break;
    case 'skip': later(own?520:700,()=>fx.ring(q('.card-center .playing-card'),{color:'#ff6a4d',scale:2,duration:600,width:4}));break;
    case 'uno': later(800,()=>fx.announce('UNO!',{tone:'red',sub:e.mine?'Ultima carta':next.players[e.seat]+' ha una carta',hold:1000}));break;
    case 'pass': fx.flash(q('.banner'),'fx-sweep',1200);break;
    case 'start': fx.announce('Si gioca!',{tone:'gold',sub:next.game.id==='scopa'&&next.maxPlayers===4?'Scopone scientifico':catalog[id].name});break;
    case 'join': {
      const chip=q('.player[data-seat="'+e.seat+'"]')??q('[data-other="'+e.seat+'"]');
      fx.flash(chip,'fx-join',900);
      fx.sparkle(chip?.querySelector('.avatar,.mini-hand'));
      break;
    }
    case 'result': later(landing+300,()=>{
      if(e.outcome==='win'){fx.confetti();fx.announce(next.maxPlayers===4&&id==='scopa'?'Vittoria!':'Hai vinto!',{tone:'gold',sub:catalog[id].name,hold:2200});}
      else if(e.outcome==='draw')fx.announce('Pareggio',{tone:'teal',hold:1600});
      else fx.announce('Sconfitta',{tone:'ash',sub:(id==='scopa'&&next.maxPlayers===4?'Squadra '+(g.result+1):next.players[g.result]??'Avversario')+' vince',hold:1800});
    });break;
    case 'your-turn': later(landing,()=>{fx.flash(q('.banner'),'fx-sweep',1200);fx.ring(q('.player.current .avatar')??q('.hand-seat[aria-current=true] .mini-hand'),{scale:2,duration:700});});break;
  }
}
function activeShip() {
  return editingShip??sizes().findIndex((_,i)=>!draft[i]);
}
function fleetPanel(ships,shots,reserve,editable) {
  const hits=new Set(shots.filter(shot=>shot.hit).map(shot=>shot.at));
  const rows=sizes().map((length,i)=>{
    const ship=ships?.[i];
    if(reserve?!!ship:!ship)return '';
    const cells=ship?shipSectors(ship,length):Array(length).fill(-1);
    const label='Nave '+(i+1)+' · '+length+' caselle'+(ship?' · '+coord(ship.at,seaSize()):'');
    const body='<span>'+label+'</span><span class="fleet-segments">'+cells.map((at,i)=>'<b class="'+(hits.has(at)?'damage':'')+'" title="Settore '+(i+1)+(i===0?' · prua':i===length-1?' · poppa':'')+'">'+(i+1)+(hits.has(at)?'×':'')+'</b>').join('')+'</span>';
    return editable?'<button class="outline fleet-row ship-color-'+i+'" data-ship="'+i+'" aria-pressed="'+(activeShip()===i)+'">'+body+'</button>':'<div class="fleet-row ship-color-'+i+'">'+body+'</div>';
  }).join('');
  return '<aside class="fleet-panel"><h3>'+(reserve?'Da posizionare':'La tua squadra navale')+'</h3>'+ (rows||(reserve?'Tutte posizionate':'Nessuna nave posizionata'))+'</aside>';
}
function naval(g) {
  if(!g.ready.every(Boolean)) {
    const editable=connected&&!state.closed&&!g.ready[state.side]&&!pending;
    const ships=g.ready[state.side]?g.mine:draft;
    const selected=draft[activeShip()];
    const complete=sizes().every((_,i)=>ships?.[i]);
    const missing=sizes().filter((_,i)=>!ships?.[i]).length;
    const status=g.ready[state.side]?(state.players.length<2?'Flotta confermata. Invita il secondo giocatore.':'Flotta confermata. In attesa della flotta avversaria.'):!connected?'Connessione in corso…':pending?'Conferma in corso…':missing?'Navi ancora da posizionare: '+missing:state.players.length<2?'Flotta completa. Invita il secondo giocatore per abilitare la conferma.':'Flotta completa. Puoi confermare anche se l’avversario sta ancora posizionando le navi.';
    const controls=editable?'<div class="fleet-actions">'+
      (activeShip()>=0?'<button class="outline ship-drag" data-drag-ship>Trascina nave</button>':'')+
      (sizes()[activeShip()]>1?'<button class="outline" data-action="rotate" aria-keyshortcuts="R" title="Scorciatoia: tasto R">Ruota nave · '+(vertical?'↕':'↔')+' <kbd>R</kbd></button>':'')+
      (selected?'<button class="outline" data-action="remove-ship">Rimuovi nave</button>':'')+
      '<button class="outline" data-action="random">Disponi a caso</button><button class="link" data-action="reset">Svuota</button>'+
      '<button class="primary" data-action="fleet" '+(complete&&state.players.length===2?'':'disabled')+'>Conferma flotta</button></div>':'';
    return '<div class="navy-setup fleet-layout">'+fleetPanel(ships,[],true,editable)+'<div><h3>La tua flotta</h3>'+navyGrid(ships,[],false,editable)+'</div><div>'+
      fleetPanel(ships,[],false,editable)+'<p role="status">'+status+'</p>'+controls+'</div></div>'+
      (editable?'<p>Scegli una nave a sinistra e clicca sulla griglia per posarla. Seleziona una nave posata per spostarla, ruotarla o rimuoverla.</p>':'');
  }
  return '<div class="naval-combat"><div class="navy-switch" role="group" aria-label="Griglia visibile"><button class="outline" data-action="target" aria-pressed="'+(navalView==='target')+'">Bersaglio</button><button class="outline" data-action="own-fleet" aria-pressed="'+(navalView==='own-fleet')+'">La tua flotta</button></div><div class="navy-battle show-'+navalView+'"><div class="target-grid'+(acting()?' armed':'')+'"><h3>Bersaglio</h3>'+navyGrid(null,g.outgoing,true,false)+'</div><div class="own-grid"><h3>La tua flotta</h3>'+navyGrid(g.mine,g.incoming,false,false)+'</div></div>'+fleetPanel(g.mine,g.incoming,false,false)+'</div>';
}
const unoColors={R:'Rosso',B:'Blu',G:'Verde',Y:'Giallo',W:'Jolly'};
const unoValues={skip:'Salta',reverse:'Inverti',two:'+2',four:'+4',wild:'Jolly'};
function cardFace(id,value) {
  if(id==='uno') {
    const [color,rank]=value.split(':');
    return {face:unoValues[rank]??rank,label:(unoValues[rank]??rank)+' '+unoColors[color],style:'uno-'+color};
  }
  const suit=Math.floor(value/10), rank=value%10+1;
  return {face:(['','A','2','3','4','5','6','7','F','C','R'][rank])+' '+['◉','♜','∥','♠'][suit],label:({1:'Asso (1)',8:'Fante (8)',9:'Cavallo (9)',10:'Re (10)'}[rank]??rank)+' di '+['denari','coppe','bastoni','spade'][suit],style:'scopa-'+suit};
}
function playingCard(id,value,attribute='',enabled=false,selected=false) {
  const {label,style}=cardFace(id,value);
  const artwork=deckCache.get(id==='uno'?'uno':scopaDeck)?.[cardKey(id,value)];
  const body=artwork?(typeof artwork==='string'?'<img alt="" draggable="false" src="data:image/webp;base64,'+artwork+'">':cardSvg(artwork)):'';
  const cls='playing-card '+style;
  if(!attribute)return '<span class="'+cls+'" role="img" aria-label="'+label+'" data-card="'+escape(value)+'">'+body+'</span>';
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
  const capacity=state.maxPlayers??2;
  const seats=Array.from({length:capacity},(_,seat)=>{
    const occupied=seat<state.players.length;
    const own=seat===state.side;
    const count=g.handCounts?.[seat]??(own?g.hand.length:g.opponentCount);
    const current=seatHasTurn(state,seat);
    const title=occupied?displayNickname(state.players[seat],state.playerMarkup?.[seat]):'Posto '+(seat+1);
    const details=occupied?(count===1?'1 carta':count+' carte')+(count===1&&g.id==='uno'?' <b class="uno-call">UNO!</b>':''):'Libero';
    const team=capacity===4&&g.id==='scopa'?' · Squadra '+(seat%2+1):'';
    const backs='<span class="mini-hand" aria-hidden="true">'+('<i class="pile-back '+g.id+'"></i>').repeat(occupied?Math.min(3,count):3)+'</span>';
    return '<li class="hand-seat'+(occupied?'':' seat-vacant')+'" data-other="'+seat+'"'+(current?' aria-current="true"':'')+'>'+backs+
      '<span class="hand-seat-info"><strong>'+title+(own?' (tu)':'')+'</strong><small>'+details+team+'</small>'+
      (current?'<b class="seat-turn">Di turno</b>':'')+'</span></li>';
  }).join('');
  return '<ul class="other-hands seat-gallery" aria-label="Giocatori al tavolo">'+seats+'</ul>';
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
      showModal('<h2>Scegli il <em>colore</em></h2><div class="promotion">'+Object.entries(unoColors).filter(([color])=>color!=='W').map(([color,name])=>'<button class="uno-active uno-'+color+'" data-uno-color="'+color+'">'+name+'</button>').join('')+'</div>');
    } else send({card:value});
  }
function scopaFace(card) {
  const face=playingCard('scopa',card);
  return cardHints?cardCaption(face,cardFace('scopa',card).label):face;
}
function cardPiles(g) {
  const pile=(label,count,attr)=>'<div class="table-pile" '+attr+'><i class="pile-back '+g.id+'" '+(count?'':'hidden')+'></i><span>'+label+' <b>'+count+'</b></span></div>';
  const stock=pile('Da pescare',g.remaining,'data-stock');
  const piles=g.id==='scopa'&&g.captureCounts?[state.side%2,1-state.side%2].map(team=>{
    const label=team!==state.side%2?'Prese avversarie':state.maxPlayers===4?'Prese della squadra':'Le tue prese';
    const cards=g.captured?.[team]??[], sweeps=g.sweepCards?.[team]??[];
    const markers=sweeps.slice(-3).map((card,i)=>'<i style="--i:'+i+'">'+playingCard('scopa',card)+'</i>').join('');
    const gallery=cards.map(card=>'<span class="taken-face">'+scopaFace(card)+(sweeps.includes(card)?'<b>Scopa</b>':'')+'</span>').join('');
    return '<div class="capture-stack" data-pile="'+team+'"><button class="table-pile pile-inspect" type="button" aria-label="'+label+', '+cards.length+' carte. Mostra le prese">'+
      '<span class="capture-art"><i class="pile-back scopa" '+(cards.length?'':'hidden')+'></i>'+markers+'</span><span>'+label+' <b>'+g.captureCounts[team]+'</b><small>Punti sicuri · '+(g.securedPoints?.[team]??g.sweeps[team])+'</small></span></button>'+
      '<section class="capture-preview" tabindex="0" aria-label="'+label+'"><strong>'+label+' · Scope '+g.sweeps[team]+'</strong><div>'+ (gallery||'Nessuna presa')+'</div></section></div>';
  }).join(''):'';
  return '<div class="table-piles">'+stock+piles+'</div>';
}
function cardSnapshot(id) {
  if(!['scopa','uno'].includes(id)||!fx.lively()||document.hidden)return null;
  const map=selector=>new Map(Array.from(app.querySelectorAll(selector),el=>[el.dataset.card??el.dataset.hand,el.getBoundingClientRect()]));
  return {faces:map('.card-center [data-card]'),hand:map('.hand [data-hand]'),own:app.querySelector('.hand')?.getBoundingClientRect()};
}
function animateCards(prev,next,origins) {
  const g=next.game;
  if(!origins||next.players.length!==(next.maxPlayers??2)||!app.querySelector('[data-stock]'))return;
  const old=prev?.game, opening=(!prev&&!g.last)||!!prev&&prev.players.length<(next.maxPlayers??2);
  if(!opening&&(!prev||next.version!==prev.version+1))return;
  const box=el=>el?.getBoundingClientRect();
  const sample=box(app.querySelector('.hand .playing-card'))??box(app.querySelector('.card-center .playing-card'));
  const sized=(r,scale=1)=>r?.width&&sample?{left:r.left+r.width/2-sample.width*scale/2,top:r.top+r.height/2-sample.height*scale/2,width:sample.width*scale,height:sample.height*scale}:r;
  const seat=side=>side===next.side?box(app.querySelector('.hand')):box(app.querySelector('[data-other="'+side+'"] .mini-hand'));
  const stockCard=box(app.querySelector('[data-stock] .pile-back'));
  const stock=stockCard?.width?stockCard:box(app.querySelector('[data-stock]'));
  const back='<i class="pile-back '+g.id+'"></i>';
  const center=sized(box(app.querySelector('.card-center .card-line')));
  const last=g.last;
  const changed=!opening&&last&&JSON.stringify(last)!==JSON.stringify(old?.last);
  const played=changed&&(g.id==='scopa'||last.type==='play');
  const mine=played&&last.side===next.side;
  let wait=0;
  if(played&&!(mine&&draggedMove)) {
    const landing=app.querySelector('.card-center [data-card="'+CSS.escape(String(last.card))+'"]');
    const from=mine?(origins.hand.get(String(last.card))??origins.own):sized(seat(last.side),.5);
    fx.flight({face:playingCard(g.id,last.card),back,from,to:box(landing)??center,flip:!mine,hide:landing,duration:mine?520:700});
    wait=mine?420:620;
  }
  if(g.id==='scopa'&&played&&last.take?.length) {
    const pile=app.querySelector('[data-pile="'+(last.side%2)+'"] .capture-art');
    const dest=sized(box(pile),.42);
    [last.card,...last.take].forEach((card,i)=>fx.flight({face:playingCard('scopa',card),from:origins.faces.get(String(card))??center,to:dest,delay:wait+i*90,duration:560,shrink:true}));
    wait+=420+last.take.length*90;
    setTimeout(()=>fx.sparkle(pile,fx.palettes.oro,8),wait);
  }
  const counts=game=>game.handCounts??(next.side===0?[game.hand.length,game.opponentCount]:[game.opponentCount,game.hand.length]);
  const now=counts(g), before=opening?now.map(()=>0):counts(old);
  const previousHand=new Set((old?.hand??[]).map(String));
  const newRound=g.id==='scopa'&&old&&old.round!==g.round;
  let order=0;
  now.forEach((n,side)=>{
    const dealt=newRound?n:n-before[side]+Number(played&&last.side===side);
    if(dealt<=0)return;
    if(side===next.side) {
      const fresh=Array.from(app.querySelectorAll('.hand [data-hand]')).filter(el=>opening||newRound||!previousHand.has(el.dataset.hand)).slice(-dealt);
      for(const el of fresh) {
        const value=g.hand.find(c=>String(c)===el.dataset.hand);
        fx.flight({face:playingCard(g.id,value),back,from:stock,to:box(el),flip:true,hide:el,delay:wait+(order++)*110,duration:620});
      }
    } else for(let i=0;i<Math.min(dealt,5);i++) fx.flight({face:back,from:stock,to:sized(seat(side),.4),delay:wait+(order++)*90,duration:520,shrink:true});
  });
}

function cardCaption(face,label,style='') {
  return '<span class="caption-card"'+(style?' style="'+style+'"':'')+'>'+face+'<small>'+label+'</small></span>';
}
function cardTable(g) {
  const scopa=g.id==='scopa', deckId=scopa?scopaDeck:'uno';
  const ready=deckCache.has(deckId);
  if(!ready)ensureDeck(deckId);
  const active=ready&&acting();
  const options=scopa?g.takes[selectedCard]??[]:[];
  const table=scopa?'<div class="card-line">'+g.table.map(c=>scopaFace(c)).join('')+'</div>':
    '<div class="card-line">'+(cardHints?cardCaption(playingCard(g.id,g.top),unoColors[g.color]):playingCard(g.id,g.top)+(g.top.startsWith('W:')?'<i class="wild-color uno-active uno-'+g.color+'" aria-label="'+unoColors[g.color]+'"></i>':''))+'</div>';
  const mine=state.side%2, theirs=1-mine;
  const info=scopa?'Smazzata '+g.round+' · Punti '+g.scores[mine]+'–'+g.scores[theirs]+(g.points?' · ultima smazzata +'+g.points[mine]+' / +'+g.points[theirs]:''):
    (state.maxPlayers>2?(g.direction===-1?'↺ Giro antiorario':'↻ Giro orario'):'');
  const deck=scopa?'<label class="card-deck-picker">Mazzo <select id="scopa-deck">'+
    Object.entries(scopaDecks).map(([id,name])=>'<option value="'+id+'" '+(id===scopaDeck?'selected':'')+'>'+name+'</option>').join('')+'</select></label>':'';
  const n=g.hand.length, squeeze=Math.max(0,Math.min(22,(n-6)*3));
  return '<div class="card-table table-'+g.id+'"'+(scopa?' data-deck="'+scopaDeck+'"':' data-color="'+escape(g.color)+'"')+'>'+'<div class="card-table-meta"><span>'+info+'</span><span class="table-tools">'+deck+'<button class="outline card-help" data-action="card-hints" title="Indicazioni di accessibilità" aria-label="Indicazioni di accessibilità" aria-pressed="'+cardHints+'">♿</button></span></div>'+(cardHints?'<small class="card-hint">Doppio clic o trascina sul tavolo. Da tastiera, premi Invio.</small>':'')+
    '<div class="table-side">'+opponentHand(g)+cardPiles(g)+'</div><div class="table-main"><div class="card-center"><h3>'+(scopa?'Sul tavolo':'Carta in cima')+'</h3>'+table+'</div>'+
    '<h3>La tua mano</h3><div class="card-line hand'+(n<=12?' fan':'')+'" style="--squeeze:'+squeeze+'px;--n-half:'+((n-1)/2).toFixed(1)+'">'+g.hand.map((c,i)=>{
      const vars='--i:'+i+';--o:'+(i-(n-1)/2).toFixed(2);
      const face=playingCard(g.id,c,'data-hand="'+c+'"'+(cardHints?'':' style="'+vars+'"'),active&&(scopa||g.playable.includes(c)),selectedCard===c);
      return cardHints?cardCaption(face,scopa?cardFace(g.id,c).label:unoColors[c[0]],vars):face;
    }).join('')+'</div>'+
    '<div class="card-moves">'+(scopa?options.map((take,i)=>'<button class="primary" data-take="'+i+'">'+(take.length?'Prendi '+take.map(c=>cardFace(g.id,c).label).join(' + '):'Lascia sul tavolo')+'</button>').join(''):
    (active?'<button class="outline" data-action="'+(g.drawn?'uno-pass':'uno-draw')+'">'+(g.drawn?'Passa':'Pesca')+'</button>':''))+'</div></div></div>';
}
function strategyBoard(g) {
  const active=acting();
  const newest=state.version>drawnVersion;
  if(g.id==='go') {
    const files='ABCDEFGHJ', ranks='987654321', moves=g.moves?new Set(g.moves):null, stars=new Set([20,24,40,56,60]);
    const stones=g.board.map((v,i)=>{
      const legal=active&&!v&&(moves?.has(i)??true);
      const content=v?'<span class="disc p'+v+'"></span>':legal&&moves?'<span class="chess-target" aria-hidden="true"></span>':'';
      const classes=[g.last?.at===i?'last':'',newest&&g.last?.at===i?'animate':'',stars.has(i)?'hoshi':''].join(' ');
      return cell(content,classes,'data-go="'+i+'"',files[i%9]+ranks[Math.floor(i/9)]+(v?' occupato':''),legal);
    }).join('');
    return boardRuler('<div class="board go">'+stones+'</div>',files,ranks)+
      '<div class="strategy-actions">'+(g.scores?'Punteggio finale · Nero '+g.scores[0]+' · Bianco '+String(g.scores[1]).replace('.',',')+' (con 7,5 di komi)':(g.last?.pass?'Ultima mossa: passaggio · ':'')+'Il Bianco riceve 7,5 punti di komi')+(active?'<button class="outline" data-action="go-pass">Passa</button>':'')+'</div>';
  }
  if(g.id==='nim')return '<div class="nim-board">'+g.piles.map((n,i)=>'<div class="nim-row" data-row="'+i+'"><strong>Fila '+(i+1)+'</strong>'+Array.from({length:n},(_,k)=>cell('','','data-nim="'+i+':'+(n-k)+'"','Togli '+(n-k)+' dalla fila '+(i+1),active)).join('')+'</div>').join('')+'</div><div class="strategy-actions">Restano <strong>'+g.piles.reduce((a,b)=>a+b,0)+'</strong> gettoni · chi prende l’ultimo vince</div>';
  if(g.id==='dots') {
    const grid=Array.from({length:49},(_,i)=>{
      const r=i/7|0,c=i%7;
      if(r%2===0&&c%2===0)return '<span class="point"></span>';
      if(r%2&&c%2)return '<span class="box claimed-'+g.boxes[(r>>1)*3+(c>>1)]+'" data-box="'+((r>>1)*3+(c>>1))+'"></span>';
      const edge=r%2?12+(r>>1)*4+(c>>1):(r>>1)*3+(c>>1);
      return cell('',(r%2?'vertical ':'horizontal ')+'claimed-'+g.edges[edge]+(newest&&g.last?.edge===edge?' animate':''),'data-edge="'+edge+'"','Lato '+(edge+1),active&&!g.edges[edge]);
    }).join('');
    return '<div class="dots-board">'+grid+'</div><div class="strategy-actions">Viola '+(g.counts?.[0]??0)+' · Blu '+(g.counts?.[1]??0)+'</div>';
  }
  const chosen=prefix[0];
  const possible=g.moves.filter(m=>m.from===chosen);
  const points=[...Array.from({length:12},(_,i)=>12+i),...Array.from({length:12},(_,i)=>11-i)];
  const buttonAt=i=>{
    const v=g.points[i], piece=v>0?'light':'dark', count=Math.abs(v);
    const options=g.moves.some(m=>m.from===i)||(chosen!==undefined&&possible.some(m=>m.to===i));
    const stack=v?'<span class="bg-stack" aria-hidden="true">'+('<i class="checker '+piece+'"></i>').repeat(Math.min(count,5))+(count>5?'<b>'+count+'</b>':'')+'</span>':'';
    return cell('<small>'+(i+1)+'</small>'+stack,
      chosen===i?'selected':possible.some(m=>m.to===i)?'move-option':'','data-bg="'+i+'"','Punta '+(i+1)+(v?' · '+count+' pedine '+(v>0?'chiare':'scure'):''),active&&options);
  };
  const dice=g.dice.length?'<span class="dice" aria-label="Dadi '+g.dice.join(' e ')+'">'+g.dice.map(v=>'<i class="die" aria-hidden="true">'+pips(v)+'</i>').join('')+'</span>':'<strong>Dadi —</strong>';
  return '<div class="bg-board">'+points.map(buttonAt).join('')+'</div><div class="strategy-actions">'+dice+'<span>Uscite '+g.off[state.side]+'–'+g.off[1-state.side]+'</span>'+
    '<button class="outline" data-bg="bar" '+(active&&g.moves.some(m=>m.from==='bar')?'':'disabled')+'>Barra '+g.bar[state.side]+'</button>'+
    (active&&g.dice.length===0?'<button class="primary" data-action="bg-roll">Lancia dadi</button>':'')+
    (active&&g.dice.length&&!g.moves.length?'<button class="outline" data-action="bg-pass">Passa</button>':'')+
    (active&&possible.some(m=>m.to==='off')?'<button class="primary" data-bg="off">Porta fuori</button>':'')+'</div>';
}
let chatPainted=-1;
function chatMessages() {
  const cursor=chatCursor(code), since=chatPainted;
  chatPainted=Math.max(chatPainted,state.chatVersion??state.chat?.length??0);
  return chatEntries(state).map(m=>{
    const replaced=m.author&&m.author!==state.players[m.side];
    const author=replaced?'<s class="former-nickname">'+displayNickname(m.author,m.authorMarkup)+'</s> ':'';
    const body=renderChatMessage(m);
    return '<li class="'+(m.side===state.side?'mine':m.sequence>cursor?'unread-message':'')+(since>=0&&m.sequence>since?' fresh':'')+'"><strong class="chat-author">'+author+displayNickname(state.players[m.side],state.playerMarkup?.[m.side])+'</strong><p>'+body+'</p></li>';
  }).join('')||'<li class="chat-empty"><strong>Nessun messaggio</strong>Scrivi il primo: puoi usare grassetto, colori ed emoji.</li>';
}
const displayNickname=(name,markup)=>markup?parseChat(markup).html:escape(name);
// Live figure for a seat chip; in chess also the pieces that seat has captured.
function chipStat(s,seat) {
  const text=seatStat(s,seat);
  const taken=s.game.id==='chess'?chessMaterial(s.game.board).captured[seat]:[];
  if(!text&&!taken.length)return '';
  const label=taken.length?'Catturati: '+taken.map(p=>pieceLabel[p.toLowerCase()]).join(', '):'';
  return '<span class="stat">'+(taken.length?'<span class="taken '+(seat===0?'black':'white')+'" role="img" aria-label="'+escape(label)+'">'+taken.map(p=>glyph[p.toLowerCase()]).join('')+'</span>':'')+(text?'<b>'+escape(text)+'</b>':'')+'</span>';
}
const initial=(name,markup)=>escape(Array.from(((markup?parseChat(markup).text:name)??'').trim())[0]?.toLocaleUpperCase('it')??'?');
function chatPanel() {
  const disabled=state.closed||state.players.length<2?'disabled':'';
  return '<section class="chat-panel" id="chat-panel" aria-labelledby="chat-title"><div class="chat-head"><h2 id="chat-title">Chat</h2><button class="link panel-close" data-action="chat" aria-label="Chiudi la chat">'+icon('close')+'</button></div><ol id="chat-messages" class="chat-messages" role="log" aria-live="polite">'+chatMessages()+'</ol><form id="chat-form"><fieldset '+disabled+'>'+editorTools()+'<div class="composer-row">'+editorField({id:'chat-input',label:'Messaggio',value:chatDraft,limit:280,maxlength:1600,placeholder:'Scrivi un messaggio',multiline:true,disabled:Boolean(disabled)})+'<button type="submit" class="primary chat-send" aria-label="Invia messaggio" title="Invia messaggio">'+icon('send')+'</button></div>'+editorPreview(chatDraft,280)+'</fieldset></form></section>';
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
  return '<section class="move-panel" id="move-panel" aria-labelledby="moves-title"><div class="chat-head"><h2 id="moves-title">Mosse</h2><button class="link panel-close" data-action="moves" aria-label="Chiudi cronologia">'+icon('close')+'</button></div>'+
    (rows.size?'<div class="move-list"><table><thead><tr><th scope="col">N.</th><th scope="col">Bianco</th><th scope="col">Nero</th></tr></thead><tbody>'+
    Array.from(rows,([n,[white,black]])=>'<tr><th scope="row">'+n+'</th><td>'+escape(white??'—')+'</td><td>'+escape(black??'—')+'</td></tr>').join('')+
    '</tbody></table></div><button class="outline move-copy" type="button" data-action="copy-moves">'+icon('copy')+'Copia mosse</button>':empty+'<p class="move-empty">'+hint+'</p>')+'</section>';
}
function room() {
  const s=state,g=s.game,meta=catalog[g.id], [tone,wording]=banner(s);
  const hasMoveHistory=g.id==='chess'||g.id==='dama';
  const showMoves=hasMoveHistory&&movesOpen&&tab==='play';
  const dock=showMoves||chatOpen;
  const pass=g.id!=='reversi'||g.last?.pass===undefined?'':'<p class="subnote">'+escape(s.players[g.last.pass])+' passa il turno. Nessuna mossa valida.</p>';
  const disabled=!connected||pending?'disabled':'';
  const closure=s.closed?'<div class="closure-notice" role="status">Partita chiusa <a href="/?vista=partite">Torna alle partite in corso</a></div>':
    s.closeRequest==null?'':s.closeRequest===s.side?
    '<div class="closure-notice" role="status">Richiesta di chiusura inviata. In attesa di risposta.</div>':
    '<div class="closure-notice"><span role="status">'+escape(s.players[s.closeRequest])+' chiede di chiudere la partita.</span><div><button class="outline" data-action="decline-close" '+disabled+'>Rifiuta</button><button class="primary" data-action="accept-close" '+disabled+'>Accetta</button></div></div>';
  const capacity=s.maxPlayers??2;
  const free=capacity-s.players.length;
  const canInvite=free>0&&!s.closed&&g.result===null&&s.closeRequest==null;
  const invite=canInvite?'<button class="primary room-invite" data-action="invite" aria-label="Invita giocatori: copia il link della stanza">'+icon('link')+'Invita giocatori</button>':'';
  return '<div class="room-title phase-header"><div class="room-identity"><div class="room-heading"><span class="room-thumbnail '+meta.color+'" aria-hidden="true"><span>'+art(g.id)+'</span></span><div><h1>'+(g.id==='scopa'&&capacity===4?'Scopone scientifico':meta.name)+'</h1>'+
    '<div class="room-byline">'+(s.roomName?'<strong>'+escape(s.roomName)+'</strong>':'')+'<span>'+s.players.length+' / '+capacity+' giocatori</span>'+
    (canInvite?'<span>'+free+(free===1?' posto libero':' posti liberi')+'</span>':'')+'</div></div></div>'+invite+'</div>'+
    '<div class="room-tools"><div class="tabs" role="tablist" aria-label="Partita e regole"><button id="tab-play" role="tab" aria-controls="tabpanel" aria-selected="'+(tab==='play')+'" tabindex="'+(tab==='play'?0:-1)+'" data-tab="play">'+icon('board')+'Partita</button><button id="tab-rules" role="tab" aria-controls="tabpanel" aria-selected="'+(tab==='rules')+'" tabindex="'+(tab==='rules'?0:-1)+'" data-tab="rules">'+icon('book')+'Regole</button></div>'+
    '<div class="room-actions" role="group" aria-label="Comandi della partita">'+
    (hasMoveHistory?'<button class="outline" data-action="moves" aria-expanded="'+showMoves+'">'+icon('history')+'Mosse</button>':'')+
    '<button class="outline" id="chat-toggle" data-action="chat" aria-expanded="'+chatOpen+'">'+chatLabel(s)+'</button>'+
    (!s.closed&&g.result===null&&s.closeRequest==null?'<button class="link close-game" data-action="close-game" aria-label="Chiudi partita" title="Chiudi partita" '+disabled+'>'+icon('close')+'<span>Chiudi partita</span></button>':'')+'</div></div></div>'+
    closure+'<div class="room-layout'+(dock?' has-dock':'')+(tab==='play'&&seatHasTurn(s,s.side)&&!pending?' your-turn':'')+'">'+
    '<div id="tabpanel" role="tabpanel" aria-labelledby="tab-'+tab+'">'+(tab==='rules'?rules(g.id,tabChanged):
    '<div class="match">'+'<div class="banner '+tone+'" role="status"><i></i>'+escape(wording)+'</div>'+(['scopa','uno'].includes(g.id)?'':'<div class="players">'+Array.from({length:capacity},(_,i)=>{
      const seated=i<s.players.length;
      return '<div class="player'+(seatHasTurn(s,i)?' current':'')+(seated?'':' vacant')+'" data-seat="'+i+'"><span class="avatar seat-'+i+'" aria-hidden="true">'+(seated?initial(s.players[i],s.playerMarkup?.[i]):'+')+'</span><span><strong title="'+escape(s.players[i]??'Posto libero')+'">'+displayNickname(s.players[i]??'Posto libero',s.playerMarkup?.[i])+(i===s.side?' (tu)':'')+'</strong><small>'+(s.maxPlayers>2?(g.id==='scopa'?'Squadra '+(i%2+1):'Posto '+(i+1)):meta.players[i])+'</small></span>'+(seated?chipStat(s,i):'')+'</div>';
    }).join('')+'</div>')+
    pass+turnNotes(s,acting()).map(note=>'<p class="subnote turn-note" role="status">'+escape(note)+'</p>').join('')+
    (g.id==='naval'?naval(g):['scopa','uno'].includes(g.id)?cardTable(g):['go','dots','nim','backgammon'].includes(g.id)?strategyBoard(g):checker(g))+
    '<div class="match-actions">'+(g.canDraw&&acting()?'<button class="outline" data-action="draw">'+icon('draw')+'Richiedi patta</button>':'')+
    (pending&&!busy?'<button class="primary" data-action="retry">'+icon('redo')+'Recupera mossa</button>':'')+
    (prefix.length?'<button class="link" data-action="cancel">Annulla selezione</button>':'')+
    '</div></div>')+'</div>'+
    (dock?'<aside class="side-dock" aria-label="'+(showMoves&&chatOpen?'Mosse e chat':showMoves?'Mosse':'Chat')+'"><div class="dock-inner">'+(showMoves?movePanel(g):'')+(chatOpen?chatPanel():'')+'</div></aside>':'')+'</div>';
}
let paintedRoom=null;
const baseTitle=document.title;
function updateTitle() {
  if(!state){document.title=baseTitle;return;}
  const [tone,wording]=banner(state), name=state.game.id==='scopa'&&state.maxPlayers===4?'Scopone scientifico':catalog[state.game.id].name;
  document.title=(tone==='green'?'● ':'')+wording+' · '+name+' — Tavolo';
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
  const richFocused=focused?.id==='chat-input-rich', richAt=richFocused?rich.getOffsets(focused):null;
  const focusData=focused?.closest('#app')&&Object.entries(focused.dataset).find(([key])=>['tab','cell','action','naval'].includes(key));
  const entry=restoring?'<section class="entry"><h1>Caricamento partita…</h1></section>':
    expired?'<section class="entry"><h1>Stanza non disponibile</h1><p>La partita potrebbe essere scaduta o il server locale potrebbe essere stato riavviato.</p><a class="primary" href="/">Torna alla Home</a></section>':
    restoreError?'<section class="entry"><h1>Connessione interrotta</h1><p>'+restoreError+'</p><button class="primary" data-action="restore">Riprova</button></section>':
    '<section class="entry"><h1>Entra nella partita.</h1><p>Servono solo il tuo nickname e il link di invito.</p><button class="primary" data-action="enter">Scegli il nickname</button></section>';
  app.classList.toggle('arrive',Boolean(state)&&paintedRoom!==code&&fx.lively());
  if(state)paintedRoom=code;
  app.innerHTML=state?room():code?entry:lobby();
  updateTitle();
  
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
  if(richFocused) {
    const box=document.querySelector('#chat-input-rich');
    if(box&&!box.hidden) {
      box.focus({preventScroll:true});
      if(richAt)rich.setOffsets(box,richAt.start,richAt.end);else rich.caretToEnd(box);
    }
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
      else showModal('<h2>Promuovi il pedone</h2><div class="promotion">'+compatible.map(m=>'<button class="outline" data-promote="'+m.promote+'"><span class="glyph" aria-hidden="true">'+glyph[m.promote]+'</span>'+pieceLabel[m.promote]+'</button>').join('')+'</div>');
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
  const size=seaSize(), ship=draft[editingShip];
  const offset=ship&&anchor!==null?(anchor-ship.at)/(ship.vertical?size:1):0;
  const col=at%size-(vertical?0:offset), row=Math.floor(at/size)-(vertical?offset:0);
  const cells=Array.from({length},(_,i)=>{
    const x=col+(vertical?0:i), y=row+(vertical?i:0);
    return x>=0&&x<size&&y>=0&&y<size?y*size+x:-1;
  });
  const occupied=draft.flatMap((other,i)=>i===editingShip?[]:tiles(other,sizes()[i]));
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
const shipSectors=(ship,length)=>fleetSectors(ship,length,seaSize());
// Turns the ship under `pivot`. When the clicked sector has no room, another sector or the
// other direction is used, so the turn is refused only when no quarter turn fits at all.
function spinShip(pivot,dir) {
  const index=draft.findIndex((ship,i)=>ship&&tiles(ship,sizes()[i]).includes(pivot));
  if(index<0)return;
  const turned=rotateShip(draft,sizes(),index,pivot,dir,seaSize());
  if(!turned){toast('La nave non può ruotare qui: un’altra nave o il bordo occupano ogni rotazione possibile. Spostala prima.');return;}
  draft[index]=turned.ship;
  selectShip(index,turned.pivot);
}
function selectShip(index,pivot=draft[index]?.at??null) {
  editingShip=index;
  anchor=pivot;
  vertical=draft[index]?.vertical??vertical;
  render();
}
function placeShip(at) {
  const landing=placement(at);
  if(!landing.fits){toast('La nave esce dalla griglia o si sovrappone.');return;}
  draft[activeShip()]={at:landing.cells[0],vertical,reversed:!!draft[activeShip()]?.reversed};
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
  syncGrabCursor();
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
  syncGrabCursor();
  preview(null);
  if(e.type==='pointerup'&&at!==null)placeShip(at);
}
window.addEventListener('blur',()=>{
  if(!drag)return;
  drag.marker.remove();drag=null;syncGrabCursor();preview(null);
});
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
function syncGrabCursor() {
  document.documentElement.classList.toggle('holding-piece',Boolean(drag||boardDrag||cardGesture));
}
function cancelCardGesture() {
  if(!cardGesture)return;
  const {ghost,zone,source,frame}=cardGesture;
  cancelAnimationFrame(frame);
  ghost?.remove();
  zone.classList.remove('card-drop-ready','card-drop-hover');
  source.classList.remove('card-in-flight');
  cardGesture=null;
  syncGrabCursor();
}
function overCardTable(zone,x,y) {
  return zone.contains(document.elementFromPoint(x,y));
}
app.addEventListener('pointerdown',event=>{
  const source=event.target.closest('[data-hand]:enabled');
  if(!source||cardGesture||event.button!==0||!event.isPrimary)return;
  const zone=source.closest('.card-table').querySelector('.card-center');
  cardGesture={source,zone,id:event.pointerId,startX:event.clientX,startY:event.clientY,frame:0};
  syncGrabCursor();
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
  if(play&&acting()){draggedMove=true;playHand(d.source.dataset.hand);}
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
  syncGrabCursor();
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
  syncGrabCursor();
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
  draggedMove=true;
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
  if(d.tab&&d.tab!==tab) {
    const next=d.tab, go=()=>{tab=next;tabChanged=true;render();tabChanged=false;};
    if(fx.lively()&&document.startViewTransition)document.startViewTransition(go);else go();
  }
  if(d.cell!==undefined)playCell(Number(d.cell));
  if(d.spin){spinShip(Number(d.pivot),Number(d.spin));return;}
  if(d.ship!==undefined)selectShip(Number(d.ship));
  if(d.naval!==undefined) {
    const at=Number(d.naval);
    if(game().ready.every(Boolean))send({at});
    else {
      const index=draft.findIndex((ship,i)=>ship&&tiles(ship,sizes()[i]).includes(at));
      if(index>=0&&index!==editingShip)selectShip(index,at);
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
      if(draft[editingShip])spinShip(anchor,1);
      else {vertical=!vertical;render();}
      break;
    case 'card-hints': cardHints=!cardHints;localStorage.setItem('tavolo-card-hints',cardHints?'1':'0');render();break;
    case 'chat': chatOpen=!chatOpen;render();if(chatOpen)revealPanel('#chat-panel',true);break;
    case 'moves': movesOpen=tab==='rules'||!movesOpen;tab='play';render();if(movesOpen)revealPanel('#move-panel',false);break;
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
joinButton.insertAdjacentHTML('afterbegin',icon('enter'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state)paintChat();});
function updateEditor(field) {
  const parsed=parseChat(field.value), form=field.form;
  const preview=form.querySelector('.editor-preview'), limit=form.querySelector('.editor-limit');
  preview.hidden=parsed.text===field.value||rich.editorMode()==='rich';
  preview.innerHTML=parsed.html;
  limit.hidden=parsed.text.trim().length<=Number(field.dataset.editorLimit);
  if(field.id==='chat-input')chatDraft=field.value;
}
function editSelection(control,tag,emoji,clearColor=false) {
  const field=control.closest('form')?.querySelector('[data-editor-limit]');
  if(!field||field.matches(':disabled'))return;
  const start=field.selectionStart, end=field.selectionEnd, selected=field.value.slice(start,end);
  if(clearColor) {
    field.setRangeText(selected.replace(/\[\/?(red|green|blue|violet|amber)\]/g,''),start,end,'select');
    field.focus();
    updateEditor(field);
    return;
  }
  const open=tag?'['+tag+']':'', close=tag?'[/'+tag+']':'';
  field.setRangeText(emoji??open+selected+close,start,end,'end');
  field.focus();
  if(tag)field.setSelectionRange(start+open.length,start+open.length+selected.length);
  updateEditor(field);
}
document.addEventListener('input',e=>{if(e.target.matches('[data-editor-limit]'))updateEditor(e.target);});
// ---- Visual editor wiring ----
let savedSelection={box:null,at:null};
function syncRich(box) {
  const field=document.getElementById(box.dataset.for);
  if(!field)return;
  field.value=rich.readMarkup(box);
  if(!box.textContent)box.innerHTML='';
  updateEditor(field);
  updateToolbar(box);
}
function updateToolbar(box) {
  const tools=box.closest('form')?.querySelector('.editor-tools');
  if(!tools)return;
  const style=rich.selectionStyle(box)??{};
  for(const button of tools.querySelectorAll('[data-format]'))button.setAttribute('aria-pressed',String(Boolean(style[button.dataset.format])));
  const sample=tools.querySelector('.color-sample');
  if(sample)sample.className='color-sample'+(style.color?' chat-color-'+style.color:'');
}
function toggleEditorMode(form) {
  const next=rich.editorMode()==='rich'?'code':'rich';
  rich.setEditorMode(next);
  for(const box of document.querySelectorAll('.rich-input')) {
    const field=document.getElementById(box.dataset.for);
    if(!field)continue;
    if(next==='rich')box.innerHTML=rich.richHtml(field.value);
    box.hidden=next==='code';
    field.hidden=next==='rich';
    updateEditor(field);
  }
  for(const button of document.querySelectorAll('[data-editor-mode]')) {
    button.setAttribute('aria-pressed',String(next==='code'));
    button.title=modeTitle(next);
  }
  const box=form?.querySelector('.rich-input'), field=form?.querySelector('[data-editor-limit]');
  if(next==='rich'&&box)rich.caretToEnd(box);
  else if(field){field.focus();field.setSelectionRange(field.value.length,field.value.length);}
}
document.addEventListener('mousedown',e=>{
  if(e.target.closest('.editor-tools button,.editor-tools summary')&&document.activeElement?.matches?.('.rich-input'))e.preventDefault();
});
document.addEventListener('click',e=>{
  const control=e.target.closest('[data-format],[data-emoji],[data-color],[data-editor-mode]');
  if(!control?.closest('.editor-tools'))return;
  const form=control.closest('form');
  if(control.hasAttribute('data-editor-mode')){toggleEditorMode(form);return;}
  const box=form?.querySelector('.rich-input');
  if(box&&!box.hidden) {
    if(box.getAttribute('contenteditable')!=='true')return;
    const saved=savedSelection.box===box?savedSelection.at:null;
    if(control.dataset.emoji)rich.insertRich(box,control.dataset.emoji,saved);
    else if(control.dataset.color!==undefined)rich.formatRich(box,'color',control.dataset.color||null,saved);
    else rich.formatRich(box,control.dataset.format,null,saved);
    syncRich(box);
  } else editSelection(control,control.dataset.format??(control.dataset.color||undefined),control.dataset.emoji,control.dataset.color==='');
  control.closest('details')?.removeAttribute('open');
});
document.addEventListener('input',e=>{if(e.target.matches?.('.rich-input'))syncRich(e.target);});
document.addEventListener('selectionchange',()=>{
  const box=document.activeElement?.closest?.('.rich-input');
  const at=box&&rich.getOffsets(box);
  if(!at)return;
  savedSelection={box,at};
  updateToolbar(box);
});
document.addEventListener('keydown',e=>{
  const box=e.target.closest?.('.rich-input');
  if(!box||e.isComposing)return;
  if(e.key==='Enter') {
    e.preventDefault();
    if(e.shiftKey&&box.getAttribute('aria-multiline')==='true'){rich.insertRich(box,'\n');syncRich(box);}
    else if(!e.shiftKey)box.closest('form')?.requestSubmit();
    return;
  }
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&['b','i','u'].includes(key)){e.preventDefault();rich.formatRich(box,key);syncRich(box);}
});
document.addEventListener('paste',e=>{
  const box=e.target.closest?.('.rich-input');
  if(!box)return;
  e.preventDefault();
  let text=(e.clipboardData?.getData('text/plain')??'').replace(/\r\n?/g,'\n');
  if(box.getAttribute('aria-multiline')!=='true')text=text.replace(/\n+/g,' ');
  if(text){rich.insertRich(box,text);syncRich(box);}
});
document.addEventListener('drop',e=>{if(e.target.closest?.('.rich-input'))e.preventDefault();});
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
      const input=document.querySelector('#chat-input'), box=document.querySelector('#chat-input-rich');
      if(input){input.value='';updateEditor(input);}
      if(box)box.innerHTML='';
    }
  } catch(error){toast(error.message);}
  finally{chatSending=false;}
});
const fxToggle=document.querySelector('#fx-toggle');
function syncFxToggle() {
  const full=fx.motionLevel()==='full', locked=fx.systemReduced();
  fxToggle.setAttribute('aria-pressed',String(full));
  fxToggle.disabled=locked;
  fxToggle.title=locked?'Movimento ridotto dalle impostazioni di sistema':full?'Effetti attivi · clic per ridurli':'Effetti ridotti · clic per attivarli';
}
fxToggle.addEventListener('click',()=>{
  fx.setMotionLevel(fx.motionLevel()==='full'?'calm':'full');
  syncFxToggle();
  toast(fx.lively()?'Effetti e animazioni attivi.':'Effetti ridotti al minimo.');
  fx.sparkle(fxToggle,fx.palettes.oro,16);
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',syncFxToggle);
fx.applyMotionLevel();
syncFxToggle();
// Game tiles lean towards the pointer and catch the lamp light.
app.addEventListener('pointermove',e=>{
  if(e.pointerType!=='mouse'||!fx.lively())return;
  const tile=e.target.closest?.('.cards .card');
  if(!tile)return;
  const r=tile.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
  tile.style.setProperty('--rx',((.5-y)*7).toFixed(2)+'deg');
  tile.style.setProperty('--ry',((x-.5)*9).toFixed(2)+'deg');
  tile.style.setProperty('--mx',(x*100).toFixed(1)+'%');
  tile.style.setProperty('--my',(y*100).toFixed(1)+'%');
});
app.addEventListener('pointerout',e=>{
  const tile=e.target.closest?.('.cards .card');
  if(tile&&!tile.contains(e.relatedTarget)){tile.style.removeProperty('--rx');tile.style.removeProperty('--ry');}
});
// R turns the ship being placed, also while it is dragged.
document.addEventListener('keydown',e=>{
  if(e.key.toLowerCase()!=='r'||e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable]')||modal.open)return;
  const rotate=app.querySelector('.navy-setup [data-action="rotate"]');
  if(!rotate)return;
  e.preventDefault();
  if(drag&&!draft[editingShip]) {
    vertical=!vertical;
    drag.marker.classList.toggle('vertical',vertical);
    preview(hoverAt);
  } else rotate.click();
});
document.addEventListener('keydown',e=>{
  if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable]')||modal.open)return;
  const search=document.querySelector('#game-search');
  if(!search)return;
  e.preventDefault();
  search.focus();
  search.select();
});
render();
monitorRooms();
restoreRoom();
