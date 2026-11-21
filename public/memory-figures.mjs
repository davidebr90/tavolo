// This order identifies a picture in the game protocol. The server shuffles positions.
export const memoryFigures=[
  {id:'fenicottero',name:'Fenicottero'},
  {id:'pulcinella',name:'Pulcinella di mare'},
  {id:'civetta',name:'Gufo delle nevi'},
  {id:'parrocchetto',name:'Parrocchetto della Carolina'},
  {id:'cardinale',name:'Cardinale rosso'},
  {id:'ghiandaia',name:'Ghiandaia azzurra'},
  {id:'picchio',name:'Picchio testarossa'},
  {id:'airone',name:'Airone azzurro'},
  {id:'pellicano',name:'Pellicano bianco'},
  {id:'ittero',name:'Ittero di Baltimora'},
  {id:'aquila',name:'Aquila di mare'},
  {id:'colibri',name:'Colibrì'}
];

let images;
export function warmMemoryFigures() {
  if(images)return;
  images=memoryFigures.map(({id})=>{
    const image=new Image();
    image.decoding='async';
    image.src='/memory/'+id+'.webp';
    image.decode().catch(()=>{});
    return image;
  });
}
