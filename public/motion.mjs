// Decorative motion for Tavolo: particles, piece travel, card flights and announcements.
// Every export is a no-op in calm mode, so game logic never waits on an animation.

const reduce=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:true};
const KEY='tavolo:effetti';
function stored() {try {return localStorage.getItem(KEY);} catch {return null;}}
export const systemReduced=()=>reduce.matches;
export function motionLevel() {return reduce.matches||stored()==='calm'?'calm':'full';}
export const lively=()=>motionLevel()==='full';
export function applyMotionLevel() {
  if(typeof document!=='undefined')document.documentElement.dataset.motion=motionLevel();
}
export function setMotionLevel(level) {
  try {localStorage.setItem(KEY,level==='calm'?'calm':'full');} catch {}
  applyMotionLevel();
}
reduce.addEventListener?.('change',applyMotionLevel);

const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=list=>list[Math.floor(Math.random()*list.length)];
export const centerOf=r=>[r.left+r.width/2,r.top+r.height/2];

export const palettes={
  festa:['#f4dc9c','#d9b366','#ec5b3f','#58c4b4','#f5ecd9','#ff8a6a','#a98be8'],
  oro:['#fff4cf','#f4dc9c','#e6c27a','#d9b366'],
  fuoco:['#fff1b8','#ffd36b','#ff9a3d','#ec5b3f','#b8321c'],
  acqua:['#effcff','#b4ecfa','#6cc8e6','#3f9cc8'],
  fumo:['#6b6a66','#8a8781','#4d4b47'],
  rosso:['#ffd0c4','#ff8a6a','#ec5b3f'],
  verde:['#d8ffe6','#7ddc9f','#3fb874'],
  R:['#ffb3a8','#ff6b5a','#e5323b'],G:['#b8f5cf','#3fd087','#14975b'],B:['#b5d4ff','#4d95f0','#166acb'],Y:['#fff3b0','#ffd84d','#f4c529']
};

// ---- Particle layer ----------------------------------------------------
let canvas=null, ctx=null, raf=0, clock=0;
const particles=[];
function fit() {
  const ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(innerWidth*ratio);
  canvas.height=Math.round(innerHeight*ratio);
  ctx=canvas.getContext('2d');
  ctx?.setTransform(ratio,0,0,ratio,0,0);
}
function surface() {
  if(!canvas) {
    canvas=document.createElement('canvas');
    canvas.className='fx-canvas';
    canvas.setAttribute('aria-hidden','true');
    document.body.append(canvas);
    addEventListener('resize',fit,{passive:true});
    fit();
  }
  return ctx;
}
function star(x,y,r) {
  ctx.beginPath();
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4, d=i%2?r*.38:r;
    ctx.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d);
  }
  ctx.closePath();
  ctx.fill();
}
function paint(p,alpha,t) {
  ctx.globalAlpha=alpha;
  switch(p.kind) {
    case 'confetti':
      ctx.globalCompositeOperation='source-over';
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rot);
      ctx.scale(1,Math.cos(p.phase));
      ctx.fillStyle=p.color;
      ctx.fillRect(-p.size,-p.size*.55,p.size*2,p.size*1.1);
      ctx.restore();
      break;
    case 'spark':
      ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle=p.color;
      ctx.lineCap='round';
      ctx.lineWidth=Math.max(.5,p.size*(1-t*.7));
      ctx.beginPath();
      ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x-p.vx*2.6,p.y-p.vy*2.6);
      ctx.stroke();
      break;
    case 'star':
      ctx.globalCompositeOperation='lighter';
      ctx.fillStyle=p.color;
      star(p.x,p.y,p.size*(1-t*.5)*(.75+.25*Math.sin(p.phase*2)));
      break;
    case 'smoke':
      ctx.globalCompositeOperation='source-over';
      ctx.globalAlpha=alpha*.32;
      ctx.fillStyle=p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.size*(1+t*2.6),0,Math.PI*2);
      ctx.fill();
      break;
    default:
      ctx.globalCompositeOperation=p.kind==='ember'?'lighter':'source-over';
      ctx.fillStyle=p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,Math.max(.4,p.size*(1-t*.6)),0,Math.PI*2);
      ctx.fill();
  }
}
function step(now) {
  const dt=Math.min(34,now-clock)/16.67;
  clock=now;
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.restore();
  for(let i=particles.length-1;i>=0;i--) {
    const p=particles[i];
    p.age+=dt*16.67;
    if(p.age>=p.life){particles.splice(i,1);continue;}
    const drag=Math.pow(p.drag,dt);
    p.vx*=drag;
    p.vy=p.vy*drag+p.gravity*dt;
    p.x+=p.vx*dt;
    p.y+=p.vy*dt;
    p.rot+=p.spin*dt;
    p.phase+=.16*dt;
    const t=p.age/p.life;
    paint(p,t<.7?1:1-(t-.7)/.3,t);
  }
  ctx.globalAlpha=1;
  ctx.globalCompositeOperation='source-over';
  raf=particles.length?requestAnimationFrame(step):0;
}
export function burst(x,y,{count=24,colors=palettes.oro,kind='spark',speed=[2,7],angle=[0,Math.PI*2],gravity=.12,life=[550,1100],size=[2,5],drag=.975,spread=0}={}) {
  if(!lively()||!Number.isFinite(x)||!Number.isFinite(y)||!surface())return;
  for(let i=0;i<count;i++) {
    const a=rand(...angle), v=rand(...speed);
    particles.push({x:x+rand(-spread,spread),y:y+rand(-spread,spread),vx:Math.cos(a)*v,vy:Math.sin(a)*v,gravity,drag,kind,
      color:pick(colors),size:rand(...size),life:rand(...life),age:0,spin:rand(-.25,.25),rot:rand(0,6.3),phase:rand(0,6.3)});
  }
  if(particles.length>1400)particles.splice(0,particles.length-1400);
  if(!raf){clock=performance.now();raf=requestAnimationFrame(step);}
}
export function burstAt(el,options) {
  const r=el?.getBoundingClientRect?.()??el;
  if(r?.width)burst(...centerOf(r),{spread:Math.min(r.width,r.height)*.18,...options});
}

// ---- Preset bursts -----------------------------------------------------
export function confetti() {
  if(!lively())return;
  const w=innerWidth, h=innerHeight;
  burst(-8,h*.78,{kind:'confetti',count:110,colors:palettes.festa,speed:[11,20],angle:[-1.32,-.62],gravity:.26,life:[2300,3600],size:[4,8],drag:.988});
  burst(w+8,h*.78,{kind:'confetti',count:110,colors:palettes.festa,speed:[11,20],angle:[-Math.PI+.62,-Math.PI+1.32],gravity:.26,life:[2300,3600],size:[4,8],drag:.988});
  setTimeout(()=>burst(w/2,h*.36,{kind:'star',count:46,colors:palettes.oro,speed:[2,10],gravity:.05,life:[900,1700],size:[3,8]}),260);
  setTimeout(()=>burst(w*.3,h*.25,{kind:'spark',count:36,colors:palettes.festa,speed:[3,9],gravity:.08,life:[700,1200]}),520);
  setTimeout(()=>burst(w*.7,h*.28,{kind:'spark',count:36,colors:palettes.festa,speed:[3,9],gravity:.08,life:[700,1200]}),760);
}
export function explosion(target) {
  burstAt(target,{kind:'spark',count:34,colors:palettes.fuoco,speed:[3,10],gravity:.1,life:[450,900],size:[2,4]});
  burstAt(target,{kind:'ember',count:22,colors:palettes.fuoco,speed:[1,4],gravity:-.03,life:[700,1300],size:[2,5]});
  burstAt(target,{kind:'smoke',count:10,colors:palettes.fumo,speed:[.3,1.4],gravity:-.04,life:[900,1600],size:[5,10],drag:.96});
}
export function splash(target) {
  burstAt(target,{kind:'drop',count:26,colors:palettes.acqua,speed:[2,6],angle:[-Math.PI*.95,-Math.PI*.05],gravity:.22,life:[500,900],size:[1.5,3.5]});
}
export function sparkle(target,colors=palettes.oro,count=18) {
  burstAt(target,{kind:'star',count,colors,speed:[1,5],gravity:.02,life:[500,1000],size:[2,5]});
}

// ---- DOM helpers -------------------------------------------------------
export function flash(el,className,ms=1000) {
  if(!el||!lively())return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(()=>el.classList.remove(className),ms);
}
export function ring(target,{color='#f4dc9c',scale=2.2,duration=700,delay=0,width=2}={}) {
  const r=target?.getBoundingClientRect?.()??target;
  if(!lively()||!r?.width)return;
  const size=Math.min(r.width,r.height);
  const el=document.createElement('i');
  el.className='fx-ring';
  el.setAttribute('aria-hidden','true');
  Object.assign(el.style,{width:size+'px',height:size+'px',left:(r.left+r.width/2-size/2)+'px',top:(r.top+r.height/2-size/2)+'px',borderColor:color,borderWidth:width+'px'});
  document.body.append(el);
  el.animate([{transform:'scale(.35)',opacity:0},{transform:'scale(.6)',opacity:1,offset:.15},{transform:'scale('+scale+')',opacity:0}],
    {duration,delay,easing:'cubic-bezier(.2,.7,.3,1)',fill:'both'}).finished.catch(()=>{}).finally(()=>el.remove());
}
export function shake(el,strength=6) {
  if(!lively()||!el)return;
  const s=strength;
  el.animate([{transform:'none'},{transform:`translate(${-s}px,${s/2}px)`},{transform:`translate(${s}px,${-s/3}px)`},
    {transform:`translate(${-s/2}px,${s/3}px)`},{transform:`translate(${s/3}px,0)`},{transform:'none'}],{duration:420,easing:'ease-out'});
}

// The app re-renders by replacing the DOM. An element hidden while its ghost travels is
// tracked by selector, so a re-render in the middle of the trip does not show it twice.
const concealed=new Map();
let concealId=0;
function concealWhile(el,selector,done) {
  if(el)el.style.visibility='hidden';
  const id=++concealId;
  if(selector)concealed.set(id,selector);
  return Promise.resolve(done).catch(()=>{}).finally(()=>{
    concealed.delete(id);
    if(el?.isConnected)el.style.visibility='';
    if(selector&&![...concealed.values()].includes(selector))for(const other of document.querySelectorAll(selector))other.style.visibility='';
  });
}
export function reconceal(root=document) {
  for(const selector of new Set(concealed.values()))for(const el of root.querySelectorAll(selector))el.style.visibility='hidden';
}

function ghostBox(rect,content,host='') {
  const box=document.createElement('div');
  box.className='fx-ghost '+host;
  box.setAttribute('aria-hidden','true');
  box.style.width=rect.width+'px';
  box.style.height=rect.height+'px';
  if(typeof content==='string')box.innerHTML=content;
  else box.append(content);
  document.body.append(box);
  return box;
}
const place=(r,scale=1,lift=0)=>`translate(${r.left}px,${r.top-lift}px) scale(${scale})`;

// Moves a clone of `el` through the given rectangles, then reveals the original.
export function travel(el,rects,{duration=440,arc=0,lift=1.14,host='',conceal=''}={}) {
  if(!lively()||!el||rects.length<2||rects.some(r=>!r?.width))return Promise.resolve();
  const end=rects.at(-1);
  const box=ghostBox(end,el.cloneNode(true),host);
  const legs=rects.length-1, frames=[{transform:place(rects[0]),offset:0}];
  frames.push({transform:place(rects[0],lift,4),offset:.1/legs});
  rects.slice(1).forEach((r,i)=>{
    const from=rects[i], start=i/legs, span=1/legs;
    if(arc) frames.push({transform:`translate(${(from.left+r.left)/2}px,${(from.top+r.top)/2-arc}px) scale(${lift*1.06})`,offset:start+span*.5});
    frames.push({transform:place(r,lift,i===legs-1?2:4),offset:start+span*(i===legs-1?.84:.96)});
  });
  frames.push({transform:place(end,.96),offset:.93},{transform:place(end),offset:1});
  frames.sort((a,b)=>a.offset-b.offset);
  const done=box.animate(frames,{duration:duration*legs+120,easing:'cubic-bezier(.3,.6,.25,1)',fill:'both'}).finished
    .catch(()=>{}).finally(()=>box.remove());
  return concealWhile(el,conceal,done);
}

// A piece leaving the board: lifts, spins and dissolves where it stood.
export function vanish(rect,content,{host='',delay=0,duration=620,drift=-26}={}) {
  if(!lively()||!rect?.width)return;
  const box=ghostBox(rect,content,host);
  const turn=rand(-28,28);
  box.animate([
    {transform:place(rect),opacity:1,filter:'blur(0) brightness(1)'},
    {transform:place(rect,1.22,8)+` rotate(${turn/3}deg)`,opacity:1,filter:'blur(0) brightness(1.5)',offset:.3},
    {transform:place(rect,.4,-drift)+` rotate(${turn}deg)`,opacity:0,filter:'blur(4px) brightness(2)'}
  ],{duration,delay,easing:'cubic-bezier(.3,.1,.3,1)',fill:'both'}).finished.catch(()=>{}).finally(()=>box.remove());
}

// A card flying between two rectangles, optionally flipping from its back to its face.
export function flight({face,back='',from,to,delay=0,duration=640,flip=false,hide=null,conceal='',tilt=0,shrink=false,spin=null}) {
  if(!lively()||!from?.width||!to?.width)return;
  const el=document.createElement('div');
  el.className='fx-card';
  el.setAttribute('aria-hidden','true');
  el.style.width=to.width+'px';
  el.style.height=to.height+'px';
  el.innerHTML='<div class="fx-card-inner'+(flip?' is-flipping':'')+'">'+(flip?'<div class="fx-face fx-back">'+back+'</div><div class="fx-face fx-front">'+face+'</div>':'<div class="fx-face">'+face+'</div>')+'</div>';
  document.body.append(el);
  const s0=Math.max(.2,Math.min(2,from.width/to.width));
  const x0=from.left+from.width/2-to.width/2, y0=from.top+from.height/2-to.height/2;
  const x1=to.left, y1=to.top, lift=Math.max(36,Math.hypot(x1-x0,y1-y0)*.22);
  const turn=spin??rand(-14,14), end=shrink?.94:1;
  const done=el.animate([
    {transform:`translate(${x0}px,${y0}px) rotate(${-turn}deg) scale(${s0})`,opacity:0},
    {transform:`translate(${x0}px,${y0-6}px) rotate(${-turn}deg) scale(${s0*1.05})`,opacity:1,offset:.08},
    {transform:`translate(${(x0+x1)/2}px,${Math.min(y0,y1)-lift}px) rotate(${turn/2}deg) scale(${(s0+1)/2*1.12})`,offset:.52},
    {transform:`translate(${x1}px,${y1}px) rotate(${tilt}deg) scale(${end})`,opacity:1,offset:.9},
    {transform:`translate(${x1}px,${y1}px) rotate(${tilt}deg) scale(${end})`,opacity:shrink?0:1}
  ],{duration,delay,easing:'cubic-bezier(.35,.6,.25,1)',fill:'both'}).finished.catch(()=>{}).finally(()=>el.remove());
  concealWhile(hide,conceal,done);
  if(flip) el.firstElementChild.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],
    {duration:duration*.5,delay:delay+duration*.28,easing:'cubic-bezier(.5,0,.3,1)',fill:'both'});
}

// ---- Hands at the table --------------------------------------------------
// A gloved hand seen from above, fingers pointing up. The grip point, where a card is held,
// is at 50% / 15% of the drawing.
const GRIP=.15, HAND_RATIO=1.75;
function handArt(color) {
  const glove='fill="#f6eedd" stroke="#a89a7c" stroke-width="2.2" stroke-linejoin="round"';
  return '<svg viewBox="0 0 120 210" aria-hidden="true" focusable="false">'+
    '<path d="M33 210 38 126q22-9 44 0l5 84z" fill="#141b18" stroke="#000" stroke-opacity=".5" stroke-width="2"/>'+
    '<rect x="15" y="60" width="15" height="48" rx="7.5" transform="rotate(-36 30 104)" '+glove+'/>'+
    '<rect x="34" y="14" width="13.5" height="62" rx="6.75" transform="rotate(-7 41 72)" '+glove+'/>'+
    '<rect x="49" y="6" width="13.5" height="68" rx="6.75" transform="rotate(-2 56 72)" '+glove+'/>'+
    '<rect x="63.5" y="12" width="13.5" height="62" rx="6.75" transform="rotate(4 70 72)" '+glove+'/>'+
    '<rect x="77" y="28" width="12.5" height="48" rx="6.25" transform="rotate(10 83 72)" '+glove+'/>'+
    '<path d="M33 120q-7-34 3-58 24-10 50 2 7 28 1 56-27 9-54 0z" '+glove+'/>'+
    '<path d="M47 82v22M60 80v25M73 82v22" fill="none" stroke="#cdbf9e" stroke-width="2.4" stroke-linecap="round"/>'+
    '<rect x="30" y="114" width="60" height="20" rx="8" fill="'+color+'" stroke="#000" stroke-opacity=".45" stroke-width="2"/>'+
    '<path d="M36 119h48" stroke="#fff" stroke-opacity=".45" stroke-width="2.5" stroke-linecap="round"/></svg>';
}
function makeHand(width,color) {
  const hand=document.createElement('div');
  hand.className='fx-hand';
  hand.setAttribute('aria-hidden','true');
  hand.style.width=width+'px';
  hand.style.height=width*HAND_RATIO+'px';
  hand.innerHTML=handArt(color);
  document.body.append(hand);
  return hand;
}
const center=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
// Transform that puts the grip point at (x,y) with the fingers pointing along `angle` degrees.
const gripAt=(w,x,y,angle)=>`translate(${x-w/2}px,${y-w*HAND_RATIO*GRIP}px) rotate(${angle}deg)`;
const cardAt=(r,x,y,angle,scale=1)=>`translate(${x-r.width/2}px,${y-r.height/2}px) rotate(${angle}deg) scale(${scale})`;
function cardGhost(to,face,back,flip) {
  const el=document.createElement('div');
  el.className='fx-card';
  el.setAttribute('aria-hidden','true');
  el.style.width=to.width+'px';
  el.style.height=to.height+'px';
  el.innerHTML='<div class="fx-card-inner">'+(flip?'<div class="fx-face fx-back">'+back+'</div><div class="fx-face fx-front">'+face+'</div>':'<div class="fx-face">'+face+'</div>')+'</div>';
  document.body.append(el);
  return el;
}

// A hand reaches in from `origin`, tosses the card and pulls back while the card slides,
// spinning, to rest on `to`. Resolves when the card has landed.
export function throwCard({origin,to,face,back='',flip=false,tilt=0,hide=null,conceal='',color='#d9b366',delay=0,duration=780,startScale=.7}) {
  if(!lively()||!to?.width||!origin)return Promise.resolve();
  const target=center(to), dx=target.x-origin.x, dy=target.y-origin.y, distance=Math.hypot(dx,dy)||1;
  const ux=dx/distance, uy=dy/distance, angle=Math.atan2(dy,dx)*180/Math.PI+90;
  const reach=Math.min(distance*.5,Math.max(90,to.height*1.5));
  const start={x:origin.x-ux*26,y:origin.y-uy*26}, release={x:origin.x+ux*reach,y:origin.y+uy*reach};
  const width=Math.max(46,Math.min(112,to.width*1.08));
  const hand=makeHand(width,color), card=cardGhost(to,face,back,flip);
  // The shortest turn from the hand's angle to the resting tilt, plus one full spin.
  const rest=tilt+Math.round((angle-tilt)/360)*360+(ux>=0?360:-360);
  const options={duration,delay,fill:'both'};
  hand.animate([
    {transform:gripAt(width,start.x,start.y,angle),opacity:0,easing:'cubic-bezier(.3,0,.7,.5)'},
    {transform:gripAt(width,start.x+ux*14,start.y+uy*14,angle),opacity:1,offset:.1,easing:'cubic-bezier(.45,0,.85,.55)'},
    {transform:gripAt(width,release.x,release.y,angle),opacity:1,offset:.4,easing:'ease-out'},
    {transform:gripAt(width,release.x+ux*12,release.y+uy*12,angle+(ux>=0?9:-9)),opacity:1,offset:.5,easing:'cubic-bezier(.4,0,.6,1)'},
    {transform:gripAt(width,start.x,start.y,angle),opacity:1,offset:.9},
    {transform:gripAt(width,start.x,start.y,angle),opacity:0}
  ],options).finished.catch(()=>{}).finally(()=>hand.remove());
  const landed=card.animate([
    {transform:cardAt(to,start.x,start.y,angle,startScale),opacity:0,easing:'cubic-bezier(.3,0,.7,.5)'},
    {transform:cardAt(to,start.x+ux*14,start.y+uy*14,angle,startScale),opacity:1,offset:.1,easing:'cubic-bezier(.45,0,.85,.55)'},
    {transform:cardAt(to,release.x,release.y,angle,(startScale+1)/2),opacity:1,offset:.4,easing:'cubic-bezier(.12,.75,.25,1)'},
    {transform:cardAt(to,target.x,target.y,rest,1.04),opacity:1,offset:.9,easing:'ease-out'},
    {transform:cardAt(to,target.x,target.y,rest,1),opacity:1}
  ],options).finished.catch(()=>{}).finally(()=>card.remove());
  if(flip)card.firstElementChild.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],
    {duration:duration*.3,delay:delay+duration*.4,easing:'cubic-bezier(.4,0,.3,1)',fill:'both'});
  return concealWhile(hide,conceal,landed);
}

// Cards slide together, a hand comes for them and drags the stack to `to`.
// items: [{html, from}]; `to` is the destination rectangle. Resolves when the stack arrives.
export function grab({origin,items,to,color='#d9b366',delay=0,gather=260,keep=false}) {
  items=items.filter(item=>item.from?.width);
  if(!lively()||!items.length||!to?.width||!origin)return Promise.resolve();
  const size=items[0].from, meet=center(items.length>1?items[1].from:size), goal=center(to);
  const dx=meet.x-origin.x, dy=meet.y-origin.y, distance=Math.hypot(dx,dy)||1, ux=dx/distance, uy=dy/distance;
  const angle=Math.atan2(dy,dx)*180/Math.PI+90, width=Math.max(46,Math.min(112,size.width*1.08));
  const start={x:origin.x-ux*26,y:origin.y-uy*26};
  const reachTime=gather+300, pullTime=460, total=reachTime+pullTime+220, end=to.width/size.width;
  const hand=makeHand(width,color);
  hand.animate([
    {transform:gripAt(width,start.x,start.y,angle),opacity:0,offset:0},
    {transform:gripAt(width,start.x,start.y,angle),opacity:0,offset:gather*.4/total,easing:'cubic-bezier(.3,.7,.3,1)'},
    {transform:gripAt(width,meet.x,meet.y,angle),opacity:1,offset:(reachTime-70)/total},
    {transform:gripAt(width,meet.x,meet.y,angle),opacity:1,offset:reachTime/total,easing:'cubic-bezier(.5,0,.4,1)'},
    {transform:gripAt(width,goal.x,goal.y,angle),opacity:1,offset:(reachTime+pullTime)/total,easing:'ease-in'},
    {transform:gripAt(width,start.x,start.y,angle),opacity:0,offset:1}
  ],{duration:total,delay,fill:'both'}).finished.catch(()=>{}).finally(()=>hand.remove());
  const arrivals=items.map((item,i)=>{
    const el=cardGhost(size,item.html,'',false), from=center(item.from), lean=(i-(items.length-1)/2)*7;
    // A card still in the air shows up only when it lands, where its thrown twin disappears.
    if(item.late&&delay>0){el.style.visibility='hidden';setTimeout(()=>{el.style.visibility='';},delay);}
    const stackX=meet.x+(i-(items.length-1)/2)*5, stackY=meet.y-i*2;
    return el.animate([
      {transform:cardAt(size,from.x,from.y,item.tilt??0),opacity:1,offset:0,easing:'cubic-bezier(.3,.7,.3,1)'},
      {transform:cardAt(size,stackX,stackY,lean),opacity:1,offset:gather/total},
      {transform:cardAt(size,stackX,stackY,lean),opacity:1,offset:reachTime/total,easing:'cubic-bezier(.5,0,.4,1)'},
      {transform:cardAt(size,goal.x,goal.y,lean/2,end),opacity:1,offset:(reachTime+pullTime)/total},
      {transform:cardAt(size,goal.x,goal.y,lean/2,end),opacity:keep?1:0,offset:1}
    ],{duration:total,delay:delay+i*40,fill:'both'}).finished.catch(()=>{}).finally(()=>el.remove());
  });
  return Promise.all(arrivals);
}

// A chip tossed from one place to another: it arcs, spins and settles with a small bounce.
export function chipFly({from,to,color='#c4323b',delay=0,duration=620,size=26}) {
  if(!lively()||!from?.width||!to?.width)return Promise.resolve();
  const a=center(from), b=center(to), lift=Math.min(84,Math.max(34,Math.hypot(b.x-a.x,b.y-a.y)*.2));
  const el=document.createElement('i');
  el.className='chip fx-chip';
  el.setAttribute('aria-hidden','true');
  el.style.setProperty('--chip',color);
  el.style.setProperty('--chip-size',size+'px');
  document.body.append(el);
  const at=(x,y,turn,scale)=>`translate(${x-size/2}px,${y-size/2}px) rotate(${turn}deg) scale(${scale})`;
  return el.animate([
    {transform:at(a.x,a.y,0,.8),opacity:0,easing:'cubic-bezier(.3,.6,.6,1)'},
    {transform:at(a.x,a.y-8,40,1),opacity:1,offset:.08,easing:'cubic-bezier(.3,.5,.6,1)'},
    {transform:at((a.x+b.x)/2,Math.min(a.y,b.y)-lift,300,1.5),opacity:1,offset:.5,easing:'cubic-bezier(.4,0,.8,.6)'},
    {transform:at(b.x,b.y,560,1),opacity:1,offset:.86,easing:'ease-out'},
    {transform:at(b.x,b.y-7,600,1.06),opacity:1,offset:.93,easing:'ease-in'},
    {transform:at(b.x,b.y,620,1),opacity:1}
  ],{duration,delay,fill:'both'}).finished.catch(()=>{}).finally(()=>el.remove());
}

// Lets an element that changed place glide from its previous rectangle to the new one.
export function glide(el,from,{delay=0,duration=420}={}) {
  const to=el?.getBoundingClientRect?.();
  if(!lively()||!from?.width||!to?.width)return;
  const dx=from.left+from.width/2-(to.left+to.width/2), dy=from.top+from.height/2-(to.top+to.height/2);
  if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
  el.animate([{translate:`${dx}px ${dy}px`},{translate:'0px 0px'}],{duration,delay,fill:'backwards',easing:'cubic-bezier(.3,.7,.25,1)'});
}

// ---- Announcements -----------------------------------------------------
const queue=[];
let showing=false;
export function announce(text,{tone='gold',sub='',hold=1500}={}) {
  if(!lively())return;
  queue.push({text,tone,sub,hold});
  if(!showing)nextAnnouncement();
}
function nextAnnouncement() {
  const item=queue.shift();
  if(!item){showing=false;return;}
  showing=true;
  const el=document.createElement('div');
  el.className='fx-announce tone-'+item.tone;
  el.setAttribute('aria-hidden','true');
  el.style.setProperty('--hold',item.hold+'ms');
  el.innerHTML='<span class="fx-rays"></span><strong>'+Array.from(item.text,(ch,i)=>'<i style="--i:'+i+'">'+(ch===' '?'&nbsp;':html(ch))+'</i>').join('')+'</strong>'+
    (item.sub?'<small>'+html(item.sub)+'</small>':'');
  document.body.append(el);
  setTimeout(()=>{el.remove();nextAnnouncement();},item.hold+650);
}
