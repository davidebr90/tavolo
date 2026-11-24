// Poker at the oval table: seats with their stacks around the rail, bets on the felt in front
// of each player, the pot and the community cards in the middle.
const suits={C:['♣','fiori'],D:['♦','quadri'],H:['♥','cuori'],S:['♠','picche']};
const ranks={T:'10',J:'J',Q:'Q',K:'K',A:'A'};
const names={T:'Dieci',J:'Fante',Q:'Donna',K:'Re',A:'Asso'};
const phases={preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River',opening:'Apertura',draw:'Cambio carte',final:'Puntate finali',complete:'Mano conclusa'};

export const isPoker=id=>id==='poker-italiano'||id==='texas-holdem';
export const pokerBack='<i class="pile-back poker"></i>';
export const cardLabel=card=>(names[card[0]]??card[0])+' di '+suits[card[1]][1];

export function cardFace(card) {
  const [rank,suit]=card, symbol=suits[suit][0];
  return '<span class="french-card suit-'+suit+'" role="img" aria-label="'+cardLabel(card)+'"><b>'+(ranks[rank]??rank)+'<u>'+symbol+'</u></b><i>'+symbol+'</i><small aria-hidden="true">'+(ranks[rank]??rank)+'<u>'+symbol+'</u></small></span>';
}

// Chip values and colours: 1 ivory, 5 red, 25 green, 100 black.
const tones={1:'#e9e1cf',5:'#c4323b',25:'#1e7a4a',100:'#1b1b22'};
// A stack is broken into chips so that it looks like a real one: a few of every value.
export function chipCounts(amount) {
  const total=Math.max(0,Math.floor(amount));
  let ones=total%5;
  if(ones===0&&total>=5)ones=5;
  const fives=(total-ones)/5;
  let reds=fives%5;
  if(reds===0&&fives>=5)reds=5;
  let greens=(fives-reds)/5, blacks=0;
  if(greens>8){blacks=Math.floor((greens-4)/4);greens-=blacks*4;}
  return [[100,blacks],[25,greens],[5,reds],[1,ones]].filter(([,count])=>count>0);
}
// One colour per chip, largest values first, for chips in flight.
export function chipColors(amount,limit=6) {
  const colors=chipCounts(amount).flatMap(([value,count])=>Array(count).fill(tones[value]));
  return colors.slice(0,limit);
}
export function chipPile(amount,kind='') {
  const stacks=chipCounts(amount).flatMap(([value,count])=>{
    const columns=[];
    for(let left=count;left>0;left-=5)columns.push([value,Math.min(5,left)]);
    return columns;
  }).slice(0,kind==='mini'?4:6);
  return '<span class="chip-pile '+kind+'" aria-hidden="true">'+stacks.map(([value,size])=>'<span class="chip-stack" style="--n:'+size+';--chip:'+tones[value]+'">'+
    Array.from({length:size},(_,i)=>'<i class="chip" style="--i:'+i+'"></i>').join('')+'</span>').join('')+'</span>';
}

export function pokerRaiseForm(g,raiseTo,inputId='raise-to') {
  const {minRaiseTo:min,maxRaiseTo:max,call}=g.legal;
  const quick=[['Minimo',min],['Piatto',Math.min(max,Math.max(min,g.pot+(call??0)*2))],['All-in',max]]
    .filter(([,value],i,list)=>list.findIndex(([,other])=>other===value)===i)
    .map(([label,value])=>'<button type="button" class="link" data-raise-set="'+value+'">'+label+' · '+value+'</button>').join('');
  return '<form class="poker-raise"><label for="'+inputId+'">'+(g.bets.some(n=>n>0)?'Rilancia a':'Punta a')+'</label><input id="'+inputId+'" aria-label="Puntata totale in fiches" type="number" inputmode="numeric" required step="1" min="'+min+'" max="'+max+'" value="'+(raiseTo??min)+'"><button class="outline">Conferma puntata</button><span class="raise-quick">'+quick+'</span></form>';
}

export function pokerTable(room,{active,escape,selected,raiseTo,tableSeats}) {
  const {game:g,side,players}=room;
  const waiting=players.length<room.maxPlayers, texas=g.id==='texas-holdem';
  const legal=active?g.legal:{};
  const name=seat=>escape(players[seat]??('Posto '+(seat+1)));
  const draw=legal.draw!=null, done=g.phase==='complete', canRaise=Number.isInteger(legal.maxRaiseTo);
  const showdown=g.showdown, winners=new Set(done?(showdown?.pots??[]).flatMap(pot=>pot.winners):[]);
  const seats=tableSeats(g,{
    marker:waiting?null:g.dealer,
    state:({seat,occupied})=>(occupied&&!waiting&&g.folded[seat]?' folded':'')+(winners.has(seat)?' winner':''),
    detail:({seat,occupied})=>{
      if(!occupied)return 'Posto libero';
      const stack=waiting?g.stacks[seat]+g.contributions[seat]:g.stacks[seat];
      const status=waiting?'':!g.handCounts[seat]&&!done?'Eliminato':done?(showdown?.labels?.[seat]??(winners.has(seat)?'Vince il piatto':'')):g.folded[seat]?'Lascia':stack===0?'All-in':'';
      return '<b class="stack-amount">'+stack+'</b><span class="stack-unit"> fiches</span>'+(status?'<span class="stack-status"> · '+escape(status)+'</span>':'')+(!waiting&&g.dealer===seat?'<span class="mobile-dealer"> · mazziere</span>':'')+(!waiting&&g.bets[seat]>0?'<span class="compact-bet"> · sul piatto '+g.bets[seat]+'</span>':'');
    },
    // Each player's chips stand on their own place at the rail.
    badge:({seat,occupied})=>occupied&&!waiting?'<span class="seat-stack" data-stack="'+seat+'">'+chipPile(g.stacks[seat],'mini')+'</span>':'',
    fan:({seat,occupied,own})=>{
      if(!occupied||waiting||own)return '';
      const shown=showdown?.hands?.[seat];
      return shown?.length?'<span class="seat-cards shown">'+shown.map((card,i)=>'<span class="reveal" style="--o:'+(i-(shown.length-1)/2).toFixed(1)+'">'+cardFace(card)+'</span>').join('')+'</span>':
        g.folded[seat]||!g.handCounts[seat]?'':'<span class="seat-cards" aria-hidden="true">'+Array.from({length:g.handCounts[seat]},(_,i)=>'<i class="pile-back poker" style="--o:'+(i-(g.handCounts[seat]-1)/2).toFixed(1)+'"></i>').join('')+'</span>';
    },
    spot:({seat,occupied})=>occupied&&!waiting&&g.bets[seat]>0?chipPile(g.bets[seat],'mini')+'<b>'+g.bets[seat]+'</b>':''
  });
  const awards=showdown?.pots?.map((pot,i)=>'<li><b>'+(i?'Piatto laterale '+i:'Piatto principale')+' · '+pot.amount+'</b><span>'+pot.winners.map(name).join(' e ')+'</span></li>').join('')??'';
  const refunds=showdown?.refunds?.map((amount,i)=>amount?'<li><b>Restituzione · '+amount+'</b><span>'+name(i)+' · puntata non coperta</span></li>':'').join('')??'';
  const outcomes=done&&showdown?'<section class="poker-results" aria-label="Assegnazione delle fiches"><h3>Assegnazione delle fiches</h3><ul>'+awards+refunds+'</ul></section>':'';
  const board=texas?(g.board.length?g.board.map((card,i)=>'<span class="board-card" data-board-card="'+card+'" style="--tilt:'+((i*37%5-2)*.8).toFixed(1)+'deg">'+cardFace(card)+'</span>').join(''):
    '<span class="board-hint">'+(waiting?'':'Il flop si scopre dopo il primo giro di puntate.')+'</span>'):'';
  const action=(type,label,cls='outline')=>'<button type="button" class="'+cls+'" data-poker="'+type+'">'+label+'</button>';
  const pot=waiting?0:g.pot;
  const controls=[
    legal.check&&action('check',g.phase==='opening'?'Passa senza aprire':'Check'),
    legal.call>0&&action('call','Vedi · '+legal.call,'primary'),
    canRaise&&('<button type="button" class="outline compact-card-action" data-action="choose-bet" aria-haspopup="dialog">'+(g.bets.some(n=>n>0)?'Rilancia':'Punta')+'</button>'+pokerRaiseForm(g,raiseTo)),
    legal.fold&&action('fold','Lascia'),
    draw&&action('draw',selected.size?'Cambia '+selected.size+(selected.size===1?' carta':' carte'):'Servito · tieni le cinque carte','primary'),
    legal.next&&action('next','Distribuisci la prossima mano','primary')
  ].filter(Boolean).join('');
  const label=waiting?'In attesa degli altri giocatori':phases[g.phase];
  const opener=!waiting&&g.phase==='opening'?' · apre chi ha almeno una coppia di '+({11:'Fanti',12:'Donne',13:'Re'}[g.openingRank]??''):'';
  const last=g.last, verbs={fold:'lascia',check:'passa',call:'vede',raise:'punta',draw:'conferma il cambio'};
  const event=!waiting&&last&&verbs[last.type]&&Number.isInteger(last.side)?name(last.side)+' '+verbs[last.type]+(last.to?' a '+last.to:last.amount?' '+last.amount:'')+'.':'';
  const hole=waiting?'':g.hand.map((card,i)=>{
    const vars='--i:'+i+';--o:'+(i-(g.hand.length-1)/2).toFixed(2);
    return draw?'<button type="button" class="exchange-card" data-discard="'+card+'" data-pocket-card="'+card+'" style="'+vars+'" aria-pressed="'+selected.has(card)+'" aria-label="Cambia '+cardLabel(card)+'">'+cardFace(card)+'</button>':
      '<span class="pocket-card" data-pocket-card="'+card+'" style="'+vars+'">'+cardFace(card)+'</span>';
  }).join('');
  return '<div class="card-table poker-table table-'+g.id+'" data-seats="'+room.maxPlayers+'"><div class="table-stage"><div class="table-ring"><div class="table-rail"><div class="table-felt"><div class="felt-grid">'+
    '<div class="felt-side left"><div class="table-pile stock" data-stock><i class="pile-back poker"></i><span>Mazzo</span></div></div>'+
    '<div class="card-center"><h3 class="felt-label">Mano '+g.round+' · <b>'+label+'</b>'+opener+'</h3>'+(texas?'<div class="card-line community">'+board+'</div>':'')+
    (event?'<p class="poker-event" role="status">'+event+'</p>':'')+'</div>'+
    '<div class="felt-side right"><div class="poker-pot" data-pot role="img" aria-label="Piatto: '+pot+' fiches">'+(done?'':chipPile(pot))+'<span>'+(done?'Piatto assegnato':'Piatto')+' <b>'+pot+'</b></span></div></div>'+
    '</div></div></div>'+seats+'</div></div>'+
    (waiting?'<p class="card-hint">Le carte si distribuiscono quando tutti i posti sono occupati.</p>':'')+
    (hole||controls?'<div class="card-player"><div class="pocket-help">'+(draw?'Seleziona fino a '+legal.draw+' carte da cambiare.':'')+'</div><h3 class="sr-only">Le tue carte</h3><div class="card-line hand fan pocket" data-scroll-key="hand">'+hole+'</div><div class="poker-controls">'+controls+'</div></div>':'')+outcomes+'</div>';
}
