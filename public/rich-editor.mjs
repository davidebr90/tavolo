// Visual editing for chat and nicknames. A contenteditable shows the formatted text while a
// hidden textarea keeps the markup ([b]…[/b], [red]…[/red]) that the server receives.
// The code mode shows that textarea instead, as before.
import {parseChat,chatColors,markupFromSegments,normalizeSegments,formatRange,insertText,styleAt,visibleLength} from './chat-format.mjs';

export const ZW='​';
const KEY='tavolo:editor';
const marks={STRONG:'b',B:'b',EM:'i',I:'i',U:'u',S:'s',STRIKE:'s',DEL:'s'};

export function editorMode() {
  try {return localStorage.getItem(KEY)==='code'?'code':'rich';} catch {return 'rich';}
}
export function setEditorMode(mode) {
  try {localStorage.setItem(KEY,mode==='code'?'code':'rich');} catch {}
}

export const richHtml=markup=>parseChat(markup).html;

// ---- DOM → model ------------------------------------------------------------------
export function readSegments(root) {
  const out=[];
  let trailingBreak=false;
  (function walk(node,style) {
    for(const child of node.childNodes) {
      if(child.nodeType===Node.TEXT_NODE) {
        const text=child.data.replaceAll(ZW,'');
        if(text){out.push({text,style});trailingBreak=false;}
        continue;
      }
      if(child.nodeType!==Node.ELEMENT_NODE)continue;
      if(child.tagName==='BR'){out.push({text:'\n',style});trailingBreak=true;continue;}
      if((child.tagName==='DIV'||child.tagName==='P')&&out.length&&!out.at(-1).text.endsWith('\n'))out.push({text:'\n',style});
      const next={...style};
      if(marks[child.tagName])next[marks[child.tagName]]=true;
      const color=Array.from(child.classList).find(name=>name.startsWith('chat-color-'))?.slice(11);
      if(color&&Object.hasOwn(chatColors,color))next.color=color;
      walk(child,next);
    }
  })(root,{});
  // Browsers keep a <br> placeholder at the end of an editable box: it is not a typed newline.
  if(trailingBreak&&out.at(-1)?.text==='\n')out.pop();
  return normalizeSegments(out);
}
export const readMarkup=root=>markupFromSegments(readSegments(root));

// ---- Caret and selection as offsets in the visible text ----------------------------
function offsetOf(root,container,offset) {
  let count=0, done=false;
  (function walk(node) {
    const children=node.childNodes;
    for(let i=0;i<children.length&&!done;i++) {
      if(node===container&&i===offset){done=true;return;}
      const child=children[i];
      if(child.nodeType===Node.TEXT_NODE) {
        if(child===container){count+=child.data.slice(0,offset).replaceAll(ZW,'').length;done=true;return;}
        count+=child.data.replaceAll(ZW,'').length;
      } else if(child.nodeType===Node.ELEMENT_NODE) {
        if(child.tagName==='BR')count++;
        else walk(child);
      }
    }
    if(node===container)done=true;
  })(root);
  return count;
}
function pointAt(root,target) {
  let count=0, point=null;
  (function walk(node) {
    for(let i=0;i<node.childNodes.length&&!point;i++) {
      const child=node.childNodes[i];
      if(child.nodeType===Node.TEXT_NODE) {
        let seen=0;
        for(let k=0;k<child.data.length;k++) {
          if(child.data[k]===ZW)continue;
          if(count+seen===target){point=[child,k];return;}
          seen++;
        }
        count+=seen;
        if(count===target){point=[child,child.data.length];return;}
      } else if(child.nodeType===Node.ELEMENT_NODE) {
        if(child.tagName==='BR'){if(count===target){point=[node,i];return;}count++;}
        else walk(child);
      }
    }
  })(root);
  return point??[root,root.childNodes.length];
}
export function getOffsets(root) {
  const selection=getSelection();
  if(!selection?.rangeCount)return null;
  const range=selection.getRangeAt(0);
  if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
  return {start:offsetOf(root,range.startContainer,range.startOffset),end:offsetOf(root,range.endContainer,range.endOffset)};
}
export function setOffsets(root,start,end=start) {
  const range=document.createRange();
  range.setStart(...pointAt(root,start));
  range.setEnd(...pointAt(root,end));
  const selection=getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
export function caretToEnd(root) {
  root.focus({preventScroll:true});
  setOffsets(root,visibleLength(readSegments(root)));
}

// ---- Editing commands ---------------------------------------------------------------
function paint(root,segments) {
  root.innerHTML=richHtml(markupFromSegments(segments));
}
function caretAfterMarker(root) {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
    const at=node.data.indexOf(ZW);
    if(at<0)continue;
    const range=document.createRange();
    range.setStart(node,at+1);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return;
  }
}

// Applies b/i/u/s or a colour (null removes it) to the selection. With only a caret,
// the style is switched for the next characters typed there.
export function formatRich(root,tag,color=null,saved=null) {
  const at=getOffsets(root)??saved;
  let segments=readSegments(root);
  const length=visibleLength(segments);
  const start=Math.min(at?.start??length,length), end=Math.min(at?.end??length,length);
  root.focus({preventScroll:true});
  if(start===end) {
    const base=styleAt(segments,start);
    const style=tag==='color'?{...base,color:base.color===color?undefined:color??undefined}:{...base,[tag]:!base[tag]||undefined};
    paint(root,insertText(segments,start,ZW,style));
    caretAfterMarker(root);
    return;
  }
  segments=formatRange(segments,Math.min(start,end),Math.max(start,end),tag,color);
  paint(root,segments);
  setOffsets(root,Math.min(start,end),Math.max(start,end));
}

// Inserts plain text (emoji, pasted text, a newline) where the caret is.
export function insertRich(root,text,saved=null) {
  root.focus({preventScroll:true});
  if(!getOffsets(root)) {
    if(saved)setOffsets(root,saved.start,saved.end);
    else caretToEnd(root);
  }
  const range=getSelection().getRangeAt(0);
  range.deleteContents();
  const node=document.createTextNode(text);
  range.insertNode(node);
  // A newline at the very end needs a character after it, or the caret stays on the old line.
  const atEnd=!node.nextSibling&&node.parentNode===root;
  if(text.endsWith('\n')&&atEnd)node.data+=ZW;
  const after=document.createRange();
  after.setStart(node,node.data.length);
  after.collapse(true);
  getSelection().removeAllRanges();
  getSelection().addRange(after);
}

// Style at the caret, or of the first selected character, for the toolbar state.
export function selectionStyle(root) {
  const at=getOffsets(root);
  if(!at)return null;
  const segments=readSegments(root);
  return styleAt(segments,at.start===at.end?at.start:Math.min(at.start,at.end)+1);
}

