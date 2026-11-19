export const chatColors={red:'Rosso',green:'Verde',blue:'Blu',violet:'Viola',amber:'Ambra'};
const styles={b:'strong',i:'em',u:'u',s:'s'};
const marks=['b','i','u','s'];
const token=/\[(\/?)(b|i|u|s|red|green|blue|violet|amber)\]/g;
const escape=value=>value.replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));

// Tags only count when they are closed in the right order; anything else stays literal text.
function tree(text) {
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
  return nodes;
}

export function parseChat(text) {
  const nodes=tree(text);
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

// ---- Rich text model used by the visual editor ------------------------------------
// A message is a list of segments: visible text plus its style {b,i,u,s,color}.

const clean=style=>Object.fromEntries([...marks.filter(mark=>style?.[mark]).map(mark=>[mark,true]),...(style?.color?[['color',style.color]]:[])]);
export const sameStyle=(a,b)=>marks.every(mark=>!a?.[mark]===!b?.[mark])&&(a?.color||null)===(b?.color||null);

function merge(segments) {
  const out=[];
  for(const {text,style} of segments) {
    if(!text)continue;
    const last=out.at(-1);
    if(last&&sameStyle(last.style,style))last.text+=text;
    else out.push({text,style:clean(style)});
  }
  return out;
}

export function segmentsFromMarkup(text) {
  const out=[];
  (function walk(list,style) {
    for(const node of list) {
      if(typeof node==='string'){out.push({text:node,style});continue;}
      if(!node.closed){out.push({text:node.open,style});walk(node.children,style);continue;}
      walk(node.children,styles[node.tag]?{...style,[node.tag]:true}:{...style,color:node.tag});
    }
  })(tree(text),{});
  return merge(out);
}

// Writes segments back as markup, keeping tags that continue into the next segment open.
export function markupFromSegments(segments) {
  let out='';
  const stack=[];
  for(const {text,style} of merge(segments)) {
    const wanted=[...(style.color?[style.color]:[]),...marks.filter(mark=>style[mark])];
    let keep=0;
    while(keep<stack.length&&wanted.includes(stack[keep]))keep++;
    while(stack.length>keep)out+='[/'+stack.pop()+']';
    for(const tag of wanted) if(!stack.includes(tag)){out+='['+tag+']';stack.push(tag);}
    out+=text;
  }
  while(stack.length)out+='[/'+stack.pop()+']';
  return out;
}

export const normalizeSegments=merge;
export const visibleLength=segments=>segments.reduce((sum,segment)=>sum+segment.text.length,0);

function cut(segments,at) {
  const out=[];
  let seen=0;
  for(const segment of segments) {
    const end=seen+segment.text.length;
    if(at>seen&&at<end)out.push({text:segment.text.slice(0,at-seen),style:segment.style},{text:segment.text.slice(at-seen),style:segment.style});
    else out.push(segment);
    seen=end;
  }
  return out;
}

// Style of the character before `offset`, or after it at the very start.
export function styleAt(segments,offset) {
  let seen=0;
  for(const segment of segments) {
    seen+=segment.text.length;
    if(offset<=seen&&(offset>0||seen>0))return clean(segment.style);
  }
  return clean(segments.at(-1)?.style);
}

// Toggles b/i/u/s over [start,end), or sets the colour (null removes it).
// A toggle switches off only when the whole range already has that style.
export function formatRange(segments,start,end,tag,color=null) {
  const parts=cut(cut(segments,start),end);
  let seen=0;
  const inside=parts.map(segment=>{const from=seen;seen+=segment.text.length;return from>=start&&seen<=end&&segment.text.length>0;});
  const chosen=parts.filter((_,i)=>inside[i]);
  if(!chosen.length)return merge(parts);
  const value=tag==='color'?(chosen.every(segment=>segment.style.color===color)?null:color):!chosen.every(segment=>segment.style[tag]);
  return merge(parts.map((segment,i)=>inside[i]?{text:segment.text,style:{...segment.style,[tag]:value||undefined}}:segment));
}

export function insertText(segments,at,text,style) {
  const parts=cut(segments,at);
  let seen=0, index=parts.length;
  for(let i=0;i<parts.length;i++) {if(seen>=at){index=i;break;}seen+=parts[i].text.length;}
  parts.splice(index,0,{text,style:clean(style)});
  return merge(parts);
}
