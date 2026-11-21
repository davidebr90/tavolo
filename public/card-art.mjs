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

// A deck lives for the lifetime of the page. Table, hand, capture gallery and flying cards
// share one browser image resource per face, including the scalable UNO artwork.
export function deckImages(cards) {
  const urls=new Map();
  return key=>{
    const face=cards[key];
    if(!face)return null;
    if(!urls.has(key)) {
      let blob;
      if(typeof face==='string') {
        const decoded=atob(face), bytes=new Uint8Array(decoded.length);
        for(let i=0;i<bytes.length;i++)bytes[i]=decoded.charCodeAt(i);
        blob=new Blob([bytes],{type:'image/webp'});
      } else blob=new Blob([cardSvg(face)],{type:'image/svg+xml'});
      urls.set(key,URL.createObjectURL(blob));
    }
    return urls.get(key);
  };
}
