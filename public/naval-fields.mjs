// A new room snapshot replaces the board. Remember the chosen field for this
// battle, including a native swipe, without moving the document vertically.
const compact=matchMedia('(max-width:760px), (max-width:960px) and (max-height:540px)');
let round='', field='target';

class NavalFields extends HTMLElement {
  connectedCallback() {
    if(this.dataset.round!==round){round=this.dataset.round;field='target';}
    const track=this.querySelector('.navy-battle');
    const buttons=Array.from(this.querySelectorAll('.navy-switch button'));
    const panels=Array.from(track.children);
    const events=new AbortController(), options={signal:events.signal};
    const mark=()=>{
      buttons.forEach((button,i)=>{
        const selected=button.dataset.action===field;
        button.setAttribute('aria-pressed',String(selected));
        panels[i].inert=compact.matches&&!selected;
      });
    };
    const align=()=>{
      mark();
      track.scrollLeft=compact.matches&&field==='own-fleet'?track.clientWidth:0;
    };
    const select=(button,focus=false)=>{
      field=button.dataset.action;
      align();
      if(focus)button.focus({preventScroll:true});
    };
    buttons.forEach((button,i)=>{
      button.addEventListener('click',()=>select(button),options);
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        select(buttons[event.key==='Home'?0:event.key==='End'?1:1-i],true);
      },options);
    });
    track.addEventListener('scroll',()=>{
      if(!compact.matches||!track.clientWidth)return;
      const current=track.scrollLeft>track.clientWidth/2?'own-fleet':'target';
      if(current!==field){field=current;mark();}
    },{passive:true,...options});
    // Browsers normally cancel the tap when they take over a native pan.
    // Also discard a click synthesized after a short or interrupted drag.
    let start=null, dragged=false;
    track.addEventListener('pointerdown',event=>{start=[event.clientX,event.clientY];dragged=false;},options);
    track.addEventListener('pointermove',event=>{
      if(start&&Math.hypot(event.clientX-start[0],event.clientY-start[1])>9)dragged=true;
    },options);
    track.addEventListener('pointercancel',()=>{start=null;dragged=true;},options);
    track.addEventListener('pointerup',()=>{start=null;},options);
    track.addEventListener('click',event=>{
      if(dragged&&event.detail){event.preventDefault();event.stopPropagation();}
    },{capture:true,...options});
    align();
    let width=track.clientWidth;
    const resize=new ResizeObserver(()=>{
      if(track.clientWidth!==width){width=track.clientWidth;align();}
    });
    resize.observe(track);
    compact.addEventListener('change',align,options);
    this.cleanup=()=>{events.abort();resize.disconnect();};
  }
  disconnectedCallback(){this.cleanup?.();}
}
customElements.define('naval-fields',NavalFields);
