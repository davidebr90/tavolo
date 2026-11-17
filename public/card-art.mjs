export const scopaDecks={napoletane:'Napoletane',piacentine:'Piacentine',bergamasche:'Bergamasche'};
const codes={skip:'S',reverse:'R',two:'A2'};
export function cardKey(game,card) {
  if(game==='uno') {
    const [color,rank]=card.split(':');
    return color==='W'?(rank==='four'?'W4':'WC'):color+(codes[rank]??rank);
  }
  return (card%10+1)+'dcbs'[Math.floor(card/10)];
}
export function loadDeck(deck,finish='scan') {
  if(deck==='uno')return import('./uno-vector.mjs').then(module=>module.default);
  if(!Object.hasOwn(scopaDecks,deck)) throw Error('Mazzo sconosciuto.');
  const source=finish==='scan'?'card-scans-':'card-vectors-';
  return import('./'+source+deck+'.mjs').then(module=>module.default);
}
export function cardSvg(vector) {
  const [width,height,shapes]=vector;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" aria-hidden="true" focusable="false">'+shapes+'</svg>';
}
