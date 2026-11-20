import { scopaDecks } from './card-art.mjs';
import { renderChatMessage } from './chat-format.mjs';

const suits=['denari','coppe','bastoni','spade'];
const ranks=['Asso','Due','Tre','Quattro','Cinque','Sei','Sette','Fante','Cavallo','Re'];
const suitOf=card=>suits[Math.floor(card/10)];
const cardName=card=>ranks[card%10]+' di '+suitOf(card);
const pointsLabel=n=>n+(n===1?' punto':' punti');

export function renderBriscola(g,{side,players,deck,cardHints,active,playingCard,opponentHand}) {
  const count=g.handCounts.length, team=side%2, last=g.previousTrick;
  const totalTricks=40/count, waiting=players.length<count;
  const seatName=seat=>seat===side?'Tu':renderChatMessage({text:players[seat]??('Posto '+(seat+1)),format:'plain'});
  const face=card=>playingCard('briscola',card);
  const options=Object.entries(scopaDecks).map(([id,label])=>
    '<option value="'+id+'" '+(id===deck?'selected':'')+'>'+label+'</option>').join('');
  const picker='<label class="card-deck-picker">Mazzo <select id="scopa-deck">'+options+'</select></label>';
  const hints='<button class="outline card-help" data-action="card-hints" aria-label="Indicazioni di accessibilità" title="Indicazioni di accessibilità" aria-pressed="'+cardHints+'">♿</button>';
  const scores=[team,1-team].map(id=>{
    const label=count===4?'Squadra '+(id+1):seatName(id);
    const tricks=g.trickCounts[id];
    return '<div class="table-pile" data-pile="'+id+'"><span class="capture-art"><i class="pile-back scopa" '+(tricks?'':'hidden')+'></i></span>'+
      '<span>'+label+'<b>'+pointsLabel(g.scores[id])+'</b><small>'+tricks+(tricks===1?' presa':' prese')+'</small></span></div>';
  }).join('');
  const trump=waiting?'<i class="pile-back scopa"></i>':g.remaining?face(g.trumpCard):'';
  const stockCount=waiting?'40 carte':g.remaining?g.remaining+(g.remaining===1?' carta da pescare':' carte da pescare'):'Esaurito';
  const stock='<div class="table-pile briscola-stock" data-stock>'+trump+'<span>'+(waiting?'Mazzo iniziale':'Tallone')+
    '<strong>'+stockCount+'</strong></span></div>';
  const completed=!g.trick.length&&last;
  const plays=completed?last.plays:g.trick;
  const trickNumber=completed?last.number:(last?.number??0)+1;
  const cards=plays.map(({side:seat,card})=>'<span class="caption-card">'+face(card)+'<small>'+seatName(seat)+
    (cardHints?' · '+cardName(card):'')+'</small></span>').join('');

  let outcome='';
  if (last) {
    const who=last.winner===side?'Hai preso':seatName(last.winner)+' ha preso';
    outcome=who+' '+pointsLabel(last.points)+'.';
    if (completed&&g.remaining) outcome+=last.winner===side?' Hai pescato per primo.':' Ha pescato per primo.';
    if (completed&&last.number===totalTricks-3) {
      const trumpSeat=(last.winner+count-1)%count;
      outcome+=' '+(trumpSeat===side?'Hai pescato':seatName(trumpSeat)+' ha pescato')+' la briscola scoperta.';
    }
  }
  const opening=waiting?'':g.turn===side?'Apri la presa con una carta.':seatName(g.turn)+' apre la presa.';
  const table='<div class="card-center"><h3>Presa '+trickNumber+' di '+totalTricks+'</h3><div class="card-line">'+
    (cards||'<span>'+opening+'</span>')+'</div>'+(outcome?'<small class="briscola-outcome" role="status">'+
    (completed?'':'Presa precedente · ')+outcome+'</small>':'')+'</div>';
  const n=g.hand.length;
  const hand=g.hand.map((card,i)=>{
    const style='--i:'+i+';--o:'+(i-(n-1)/2);
    const button=playingCard('briscola',card,'data-hand="'+card+'"'+(cardHints?'':' style="'+style+'"'),active&&g.playable.includes(card));
    return cardHints?'<span class="caption-card" style="'+style+'">'+button+'<small>'+cardName(card)+'</small></span>':button;
  }).join('');
  const handArea=n?'<h3>La tua mano</h3><div class="card-line hand fan" style="--n-half:'+((n-1)/2)+'">'+hand+'</div>':'';
  return '<div class="card-table table-scopa table-briscola" data-deck="'+deck+'"><div class="card-table-meta">'+
    '<span>'+(waiting?'In attesa della distribuzione':'Briscola di '+suitOf(g.trumpCard))+'</span><span class="table-tools">'+picker+hints+'</span></div>'+
    (cardHints?'<small class="card-hint">Gioca con un doppio clic, trascina una carta o premi Invio.</small>':'')+
    '<div class="table-side">'+opponentHand(g)+'<div class="table-piles">'+stock+scores+'</div></div>'+
    '<div class="table-main">'+table+handArea+'</div></div>';
}
