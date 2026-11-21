function instruction(room) {
  const g=room.game, own=!room.spectator&&room.side===g.turn;
  if(room.closed)return 'Partita chiusa.';
  if(room.players.length<room.maxPlayers)return 'La partita inizia quando tutti hanno preso posto.';
  if(g.phase==='complete')return 'Tutte le coppie sono state trovate.';
  if(g.phase==='compare')return 'Figure diverse. Tra poco le carte si ricoprono.';
  if(g.phase==='second')return own?'Gira la seconda carta.':'Il giocatore di turno sceglie la seconda carta.';
  if(g.last?.type==='match')return own?'Coppia trovata! Scegli un’altra carta.':'Coppia trovata! Il turno continua.';
  return own?'Gira la prima carta.':'Il giocatore di turno sceglie la prima carta.';
}

export function memoryTable(room,{active,escape,figures,cardHints=false}) {
  const g=room.game;
  const waiting=room.players.length<room.maxPlayers;
  const canPlay=active&&!waiting&&!room.spectator&&!room.closed&&g.result===null&&
    (g.phase==='first'||g.phase==='second')&&g.turn===room.side;
  const found=g.scores.reduce((total,score)=>total+score,0), total=g.cards.length/2;
  const scores=g.scores.map((score,seat)=>{
    const player=room.players[seat], current=!waiting&&!room.closed&&g.result===null&&g.phase!=='compare'&&g.turn===seat;
    const name=player?escape(player)+(seat===room.side&&!room.spectator?' (tu)':''):'Posto '+(seat+1);
    return '<li class="memory-score seat-'+seat+'"'+(current?' aria-current="true"':'')+
      '><i aria-hidden="true"></i><span>'+name+'</span><b>'+score+'<span class="sr-only"> '+(score===1?'coppia':'coppie')+'</span></b></li>';
  }).join('');
  const board=g.cards.map((card,i)=>{
    const state=waiting?'down':card.state, open=state!=='down';
    const figure=open?figures[card.picture]:null;
    const label='Carta '+(i+1)+', '+(figure?escape(figure.name):'coperta')+
      (state==='matched'?', coppia trovata':'');
    const face=figure?'<span class="memory-fallback">'+escape(figure.name)+'</span>'+
      '<img src="/memory/'+encodeURIComponent(figure.id)+'.webp" alt="" draggable="false">'+
      '<span class="memory-name">'+escape(figure.name)+'</span>':'';
    return '<button type="button" class="memory-tile" data-memory="'+i+'" data-state="'+state+
      '" tabindex="'+(i===0?0:-1)+'" aria-disabled="'+(!canPlay||open)+'" aria-label="'+label+'">'+
      '<span class="memory-rotor" aria-hidden="true"><span class="memory-back"><i class="memory-medallion"><i class="memory-feather"></i></i></span>'+
      '<span class="memory-face">'+face+'</span></span></button>';
  }).join('');
  return '<section class="memory-table" data-phase="'+g.phase+'" data-captions="'+Boolean(cardHints)+'" aria-label="Tavolo di Memory">'+
    '<header class="memory-header"><div class="memory-title"><h2>Atlante degli uccelli</h2>'+
    '<span class="memory-progress">'+found+' / '+total+' coppie trovate</span></div>'+
    '<button type="button" class="outline memory-caption-toggle" data-action="card-hints" aria-label="Mostra i nomi degli uccelli sulle carte" title="Nomi degli uccelli" aria-pressed="'+Boolean(cardHints)+'">Aa</button></header>'+
    '<div class="memory-grid" role="group" aria-label="Carte del Memory" aria-description="Usa le frecce per spostarti e Invio o Spazio per girare una carta.">'+board+'</div>'+
    '<div class="memory-footer"><p class="memory-instruction" role="status" aria-atomic="true">'+instruction(room)+'</p>'+
    '<ul class="memory-scores" aria-label="Coppie trovate da ogni giocatore">'+scores+'</ul></div></section>';
}

const flips=new WeakMap();

function updateTile(tile,next,animate) {
  const previous=tile.dataset.state, current=next.dataset.state;
  const concealed=current==='down', turned=(previous==='down')!==concealed;
  const face=tile.querySelector('.memory-face'), rotor=tile.querySelector('.memory-rotor');
  tile.dataset.state=current;
  tile.disabled=next.disabled;
  for(const attr of ['aria-disabled','aria-label'])tile.setAttribute(attr,next.getAttribute(attr));
  if(!concealed) {
    const incoming=next.querySelector('.memory-face');
    if(!face.isEqualNode(incoming))face.replaceChildren(...incoming.childNodes);
  }
  if(!turned)return;
  const ongoing=flips.get(tile);
  const start=ongoing?.playState==='running'?getComputedStyle(rotor).transform:
    (previous==='down'?'rotateY(0deg)':'rotateY(180deg)');
  ongoing?.cancel();
  if(!animate||!rotor.animate) {
    flips.delete(tile);
    if(concealed)face.replaceChildren();
    return;
  }
  const end=concealed?'rotateY(0deg)':'rotateY(180deg)';
  const flip=rotor.animate([{transform:start==='none'?'rotateY(0deg)':start},{transform:end}],{
    duration:390,easing:'cubic-bezier(.34,.06,.18,1)'
  });
  flips.set(tile,flip);
  flip.finished.then(finish,finish);
  function finish() {
    if(flips.get(tile)!==flip)return;
    flips.delete(tile);
    // A previously public face stays on the turning card only until it closes.
    if(tile.dataset.state==='down')face.replaceChildren();
  }
}

// The room renderer retains this element across snapshots. Sync each square in
// place so a chat update or a second consecutive flip preserves the first flip.
export function patchMemoryTable(previous,fresh,{animate=false}={}) {
  previous.dataset.phase=fresh.dataset.phase;
  previous.dataset.captions=fresh.dataset.captions;
  for(const selector of ['.memory-header','.memory-scores']) {
    const old=previous.querySelector(selector), next=fresh.querySelector(selector);
    if(!old.isEqualNode(next))old.replaceWith(next);
  }
  const status=previous.querySelector('.memory-instruction'), message=fresh.querySelector('.memory-instruction').textContent;
  if(status.textContent!==message)status.textContent=message;
  const tiles=previous.querySelectorAll('[data-memory]');
  fresh.querySelectorAll('[data-memory]').forEach((next,i)=>updateTile(tiles[i],next,animate));
}

export function memoryKeydown(event) {
  const current=event.target.closest?.('[data-memory]');
  if(!current||event.altKey||event.metaKey||event.ctrlKey||event.shiftKey)return;
  const grid=current.closest('.memory-grid'), tiles=grid.querySelectorAll('[data-memory]');
  const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const i=Number(current.dataset.memory);
  const directions={
    ArrowUp:Math.max(0,i-columns),ArrowDown:Math.min(tiles.length-1,i+columns),
    ArrowLeft:Math.max(0,i-1),ArrowRight:Math.min(tiles.length-1,i+1),Home:0,End:tiles.length-1
  };
  if(!Object.hasOwn(directions,event.key))return;
  event.preventDefault();
  for(const tile of tiles)tile.tabIndex=-1;
  const target=tiles[directions[event.key]];
  target.tabIndex=0;
  target.focus();
}
