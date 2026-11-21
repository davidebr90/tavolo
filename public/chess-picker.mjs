import {chessStyles,chessPiece} from './chess-styles.mjs';

const styleName=id=>chessStyles.find(style=>style.id===id)?.name??chessStyles[0].name;

export function chessStyleButton(room,connected) {
  const id=room.chessStyle?.id??chessStyles[0].id;
  const label='<span>Stile scacchi</span> <strong data-current-style>'+styleName(id)+'</strong>';
  if(room.spectator||room.closed||!room.chessStyle)return '<span class="chess-style-tool chess-style-readonly">'+label+'</span>';
  return '<button type="button" class="outline chess-style-tool" data-action="chess-style" aria-haspopup="dialog" '+
    (connected?'':'disabled')+'>'+label+'<span aria-hidden="true">▾</span></button>';
}

export function chessPicker(room) {
  const selected=room.chessStyle.id;
  return '<section class="chess-picker"><h2 id="chess-picker-title">Stile degli scacchi</h2><p>La scelta si applica a tutta la stanza.</p>'+
    '<div class="chess-style-options">'+chessStyles.map(({id,name})=>
      '<button type="button" class="chess-style-option" data-choose-style="'+id+'" aria-pressed="'+(id===selected)+'">'+
      '<span class="chess-sample" data-chess-style="'+id+'" aria-hidden="true"><span class="sample-light">'+chessPiece('n',id)+'</span><span class="sample-dark">'+chessPiece('K',id)+'</span></span>'+
      '<span class="chess-style-name">'+name+'<span class="style-check" aria-hidden="true">✓</span></span></button>').join('')+
    '</div><p class="chess-style-author"></p><p class="chess-picker-status" role="status"></p></section>';
}

// Preserve the active square, keyboard focus and any in-flight move when the other player chooses a set.
export function paintChessStyle(id,root=document) {
  const frame=root.querySelector('.chess-frame[data-chess-style]');
  if(frame)frame.dataset.chessStyle=id;
  const cache=new Map();
  for(const piece of root.querySelectorAll('.chess-piece[data-piece]')) {
    if(piece.dataset.chessStyle===id||piece.closest('.chess-sample'))continue;
    const symbol=piece.dataset.piece;
    if(!cache.has(symbol)){
      const template=root.createElement('template');
      template.innerHTML=chessPiece(symbol,id);
      cache.set(symbol,template.content.firstElementChild);
    }
    piece.dataset.chessStyle=id;
    piece.replaceChildren(...Array.from(cache.get(symbol).childNodes,node=>node.cloneNode(true)));
  }
  const current=root.querySelector('[data-current-style]');
  if(current)current.textContent=styleName(id);
  for(const option of root.querySelectorAll('[data-choose-style]'))option.setAttribute('aria-pressed',String(option.dataset.chooseStyle===id));
}
