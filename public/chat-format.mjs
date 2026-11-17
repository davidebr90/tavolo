export const chatColors={red:'Rosso',green:'Verde',blue:'Blu',violet:'Viola',amber:'Ambra'};
const styles={b:'strong',i:'em',u:'u',s:'s'};
const token=/\[(\/?)(b|i|u|s|red|green|blue|violet|amber)\]/g;
const escape=value=>value.replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));

export function parseChat(text) {
  const stack=[], nodes=[];
  let cursor=0;
  for(const match of text.matchAll(token)) {
    const [,close,tag]=match, parent=stack.at(-1)?.children??nodes;
    if(match.index>cursor)parent.push(text.slice(cursor,match.index));
    if(!close) {
      const node={tag,open:match[0],children:[],closed:false};
      parent.push(node);stack.push(node);
    } else if(stack.at(-1)?.tag===tag) {
      stack.pop().closed=true;
    } else parent.push(match[0]);
    cursor=match.index+match[0].length;
  }
  (stack.at(-1)?.children??nodes).push(text.slice(cursor));
  function render(list,html) {
    return list.map(node=>{
      if(typeof node==='string')return html?escape(node):node;
      const body=render(node.children,html);
      if(!node.closed)return node.open+body;
      if(!html)return body;
      const el=styles[node.tag];
      return el?'<'+el+'>'+body+'</'+el+'>':'<span class="chat-color-'+node.tag+'">'+body+'</span>';
    }).join('');
  }
  return {text:render(nodes,false),html:render(nodes,true)};
}

export function renderChatMessage({text,format}) {
  return format===undefined||format===null||format==='basic'?parseChat(text).html:escape(text);
}
