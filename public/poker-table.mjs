const suits={C:['♣','fiori'],D:['♦','quadri'],H:['♥','cuori'],S:['♠','picche']};
const ranks={T:'10',J:'J',Q:'Q',K:'K',A:'A'};
const names={T:'Dieci',J:'Fante',Q:'Donna',K:'Re',A:'Asso'};
const phases={preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River',opening:'Apertura',draw:'Cambio carte',final:'Puntate finali',complete:'Mano conclusa'};

function cardFace(card) {
  const [rank,suit]=card,[symbol,name]=suits[suit];
  const label=(names[rank]??rank)+' di '+name;
  return '<span class="french-card suit-'+suit+'" role="img" aria-label="'+label+'"><b>'+(ranks[rank]??rank)+'</b><i>'+symbol+'</i><small aria-hidden="true">'+symbol+'</small></span>';
}

export function pokerTable(room,{active,escape,selected,raiseTo}) {
  const {game:g,side,players}=room;
  const waiting=players.length<room.maxPlayers, texas=g.id==='texas-holdem';
  const legal=active?g.legal:{};
  const name=seat=>escape(players[seat]??('Posto '+(seat+1)));
  const draw=legal.draw!=null, done=g.phase==='complete', canRaise=Number.isInteger(legal.maxRaiseTo);
  const seats=g.stacks.map((stack,seat)=>{
    const occupied=seat<players.length, mine=seat===side;
    const status=!occupied?'Posto libero':waiting?'':!g.handCounts[seat]?'Eliminato':done?'':g.folded[seat]?'Fuori dalla mano':stack===0?'All-in':g.bets[seat]?'Nel giro · '+g.bets[seat]:'';
    return '<li class="poker-seat"'+(!waiting&&!done&&g.turn===seat?' aria-current="true"':'')+'><span><strong>'+name(seat)+(mine?' (tu)':'')+'</strong>'+
      (occupied&&g.dealer===seat?'<abbr title="Mazziere" aria-label="Mazziere">D</abbr>':'')+'</span><b>'+(occupied?(waiting?stack+g.contributions[seat]:stack)+' fiches':'—')+'</b><small>'+status+'</small></li>';
  }).join('');
  const showdown=g.showdown;
  const awards=showdown?.pots?.map((pot,i)=>{
    const title=i?'Piatto laterale '+i:'Piatto principale';
    return '<li><b>'+title+' · '+pot.amount+'</b><span>'+pot.winners.map(name).join(' e ')+'</span></li>';
  }).join('')??'';
  const revealed=showdown?.hands?.map((cards,i)=>cards?.length?'<li><strong>'+name(i)+' · '+escape(showdown.labels?.[i]??'')+'</strong><div class="poker-cards">'+cards.map(cardFace).join('')+'</div></li>':'').join('')??'';
  const refunds=showdown?.refunds?.map((amount,i)=>amount?'<li><b>Restituzione · '+amount+'</b><span>'+name(i)+' · puntata non coperta</span></li>':'').join('')??'';
  const outcomes=done&&showdown?'<section class="poker-results"><h3>Assegnazione delle fiches</h3><ul>'+awards+refunds+'</ul>'+
    (revealed?'<details><summary>Mostra le mani allo scontro</summary><ul class="poker-revealed">'+revealed+'</ul></details>':'')+'</section>':'';
  const community=texas?'<div class="community"><h3>Carte comuni</h3><div class="poker-cards">'+
    (g.board.length?g.board.map(c=>'<span data-board-card="'+c+'">'+cardFace(c)+'</span>').join(''):'<p>Il flop si scopre dopo il primo giro di puntate.</p>')+'</div></div>':'';
  const hole=g.hand.map(c=>draw?'<button type="button" class="exchange-card" data-discard="'+c+'" aria-pressed="'+selected.has(c)+'" aria-label="Cambia '+(names[c[0]]??c[0])+' di '+suits[c[1]][1]+'">'+cardFace(c)+'</button>':'<span data-pocket-card="'+c+'">'+cardFace(c)+'</span>').join('');
  const action=(type,label,cls='outline')=>'<button type="button" class="'+cls+'" data-poker="'+type+'">'+label+'</button>';
  const controls=[
    legal.check&&action('check',g.phase==='opening'?'Passa senza aprire':'Check'),
    legal.call>0&&action('call','Vedi · '+legal.call,'primary'),
    canRaise&&'<form class="poker-raise"><label for="raise-to">'+(g.bets.some(n=>n>0)?'Rilancia a':'Punta a')+'</label><input id="raise-to" aria-label="Puntata totale in fiches" type="number" inputmode="numeric" required step="1" min="'+legal.minRaiseTo+'" max="'+legal.maxRaiseTo+'" value="'+(raiseTo??legal.minRaiseTo)+'"><button class="outline">Conferma puntata</button></form>',
    legal.fold&&action('fold','Lascia'),
    draw&&action('draw',selected.size?'Cambia '+selected.size+(selected.size===1?' carta':' carte'):'Servito · tieni le cinque carte','primary'),
    legal.next&&action('next','Distribuisci la prossima mano','primary')
  ].filter(Boolean).join('');
  const label=waiting?'In attesa degli altri giocatori':phases[g.phase];
  const opener=!waiting&&g.phase==='opening'?' · '+({11:'Fanti',12:'Donne',13:'Re'}[g.openingRank]??''):'';
  const last=g.last, verbs={fold:'lascia',check:'passa',call:'vede',raise:'punta',draw:'conferma il cambio'};
  const event=last&&verbs[last.type]&&Number.isInteger(last.side)?name(last.side)+' '+verbs[last.type]+(last.to?' a '+last.to:last.amount?' '+last.amount:'')+'.':'';
  return '<section class="poker-felt" aria-label="Tavolo da poker"><header><div><span>Mano '+g.round+'</span><h2>'+label+opener+'</h2></div><div class="poker-pot"><span>Piatto</span><strong>'+(waiting?0:g.pot)+' <small>fiches</small></strong></div></header>'+
    '<div class="poker-layout"><div class="poker-play">'+(waiting?'<p>Le carte si distribuiscono quando tutti i posti sono occupati.</p>':community+outcomes+
    (hole?'<div class="poker-pocket"><h3>Le tue carte</h3>'+(draw?'<p>Seleziona fino a '+legal.draw+' carte da cambiare.</p>':'')+'<div class="poker-cards">'+hole+'</div></div>':'')+
    (event?'<p class="poker-event">'+event+'</p>':'')+(controls?'<div class="poker-controls">'+controls+'</div>':''))+
    '</div><ul class="poker-seats" aria-label="Posti e fiches">'+seats+'</ul></div></section>';
}
