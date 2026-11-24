import { renderChatMessage } from './chat-format.mjs';

const suits=['denari','coppe','bastoni','spade'];
const ranks=['Asso','Due','Tre','Quattro','Cinque','Sei','Sette','Fante','Cavallo','Re'];
const suitOf=card=>suits[Math.floor(card/10)];
const cardName=card=>ranks[card%10]+' di '+suitOf(card);
const pointsLabel=n=>n+(n===1?' punto':' punti');

// Briscola at the oval table: the stock with the trump card under it on the left, the trick
// in the middle, each side's tricks and points on the right, players around the rail.
export function renderBriscola(g,{side,players,deck,cardHints,active,playingCard,tableSeats,tiltOf,watching=false}) {
  // A spectator looks from the first seat but is nobody at the table.
  const count=g.handCounts.length, team=side%2, last=g.previousTrick, me=watching?-1:side;
  const totalTricks=40/count, waiting=players.length<count;
  const seatName=seat=>seat===me?'Tu':renderChatMessage({text:players[seat]??('Posto '+(seat+1)),format:'plain'});
  const tilt=card=>'--tilt:'+tiltOf(card)+'deg';
  const scores=[1-team,team].map(id=>{
    const mine=id===team, tricks=g.trickCounts[id];
    const label=watching?(count===4?'Squadra '+(id+1):'Prese di '+seatName(id)):count===4?(mine?'La tua squadra':'Squadra avversaria'):mine?'Le tue prese':'Prese avversarie';
    return '<div class="team-zone '+(mine?'mine':'theirs')+' seat-'+id+'"><div class="table-pile pile-inspect" data-pile="'+id+'"><span class="capture-art"><i class="pile-back briscola" '+(tricks?'':'hidden')+'></i></span>'+
      '<span>'+label+' <b>'+pointsLabel(g.scores[id])+'</b><small>'+tricks+(tricks===1?' presa':' prese')+'</small></span></div></div>';
  });
  const stockCount=waiting?'40 carte':g.remaining?g.remaining+(g.remaining===1?' carta':' carte'):'Esaurito';
  const trump=!waiting&&g.remaining?playingCard('briscola',g.trumpCard,'',false,false,'','trump'):'';
  const stock='<div class="table-pile stock briscola-stock" data-stock>'+trump+'<i class="pile-back briscola" '+(waiting||g.remaining>1?'':'hidden')+'></i><span>'+(waiting?'Mazzo':'Tallone')+' <b>'+stockCount+'</b></span></div>';
  const completed=!g.trick.length&&last;
  const plays=completed?last.plays:g.trick;
  const trickNumber=completed?last.number:(last?.number??0)+1;
  const cards=plays.map(({side:seat,card})=>'<span class="caption-card">'+playingCard('briscola',card,'',false,false,tilt(card))+'<small>'+seatName(seat)+
    (cardHints?' · '+cardName(card):'')+'</small></span>').join('');
  let outcome='';
  if (last) {
    const who=last.winner===me?'Hai preso':seatName(last.winner)+' ha preso';
    outcome=who+' '+pointsLabel(last.points)+'.';
    if (completed&&g.remaining) outcome+=last.winner===me?' Hai pescato per primo.':' Ha pescato per primo.';
    if (completed&&last.number===totalTricks-3) {
      const trumpSeat=(last.winner+count-1)%count;
      outcome+=' '+(trumpSeat===me?'Hai pescato':seatName(trumpSeat)+' ha pescato')+' la briscola scoperta.';
    }
  }
  const opening=waiting?'':g.turn===me?'Apri la presa con una carta.':seatName(g.turn)+' apre la presa.';
  const label=waiting?'In attesa della distribuzione':'Presa '+trickNumber+' di '+totalTricks+' · Briscola di <b>'+suitOf(g.trumpCard)+'</b>';
  const n=g.hand.length;
  const hand=g.hand.map((card,i)=>{
    const style='--i:'+i+';--o:'+(i-(n-1)/2);
    const button=playingCard('briscola',card,'data-hand="'+card+'"'+(cardHints?'':' style="'+style+'"'),active&&g.playable.includes(card));
    return cardHints?'<span class="caption-card" style="'+style+'">'+button+'<small>'+cardName(card)+'</small></span>':button;
  }).join('');
  return '<div class="card-table table-scopa table-briscola" data-deck="'+deck+'" data-seats="'+count+'"><div class="table-stage"><div class="table-ring"><div class="table-rail"><div class="table-felt"><div class="felt-grid">'+
    '<div class="felt-side left">'+stock+scores[0]+'</div>'+
    '<div class="card-center"><h3 class="felt-label">'+label+'</h3><div class="card-line">'+(cards||'<span class="board-hint">'+opening+'</span>')+'</div>'+
    (outcome?'<small class="briscola-outcome" role="status">'+(completed?'':'Presa precedente · ')+outcome+'</small>':'')+'</div>'+
    '<div class="felt-side right">'+scores[1]+'</div>'+
    '</div></div></div>'+tableSeats(g)+'</div></div>'+
    (cardHints?'<small class="card-hint">Gioca con un doppio clic, trascina una carta o premi Invio.</small>':'')+
    '<div class="card-player"'+(waiting||watching?' hidden':'')+'><h3 class="sr-only">La tua mano</h3><div class="card-line hand fan" data-scroll-key="hand" style="--n-half:'+((n-1)/2)+'">'+hand+'</div></div></div>';
}
