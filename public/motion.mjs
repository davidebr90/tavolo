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
  if(!lively())cancelCardFlights();
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
export function travel(el,rects,{duration=440,arc=0,lift=1.14,host=''}={}) {
  if(!lively()||!el||rects.length<2||rects.some(r=>!r?.width))return Promise.resolve();
  const end=rects.at(-1);
  const box=ghostBox(end,el.cloneNode(true),host);
  el.style.visibility='hidden';
  const legs=rects.length-1, frames=[{transform:place(rects[0]),offset:0}];
  frames.push({transform:place(rects[0],lift,4),offset:.1/legs});
  rects.slice(1).forEach((r,i)=>{
    const from=rects[i], start=i/legs, span=1/legs;
    if(arc) frames.push({transform:`translate(${(from.left+r.left)/2}px,${(from.top+r.top)/2-arc}px) scale(${lift*1.06})`,offset:start+span*.5});
    frames.push({transform:place(r,lift,i===legs-1?2:4),offset:start+span*(i===legs-1?.84:.96)});
  });
  frames.push({transform:place(end,.96),offset:.93},{transform:place(end),offset:1});
  frames.sort((a,b)=>a.offset-b.offset);
  return box.animate(frames,{duration:duration*legs+120,easing:'cubic-bezier(.3,.6,.25,1)',fill:'both'}).finished
    .catch(()=>{}).finally(()=>{box.remove();el.style.visibility='';});
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

// Room renders replace their DOM. Reapply each destination mask to its new element.
const cardFlights=new Set();
export function syncCardFlights(scope) {
  for(const card of cardFlights) {
    if(card.scope===scope)card.mask();
    else card.finish();
  }
}
export function cancelCardFlights() {
  for(const card of cardFlights)card.finish();
}
if(typeof window!=='undefined') {
  window.addEventListener('resize',cancelCardFlights,{passive:true});
  window.addEventListener('scroll',cancelCardFlights,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelCardFlights();});
}

export function flight({face,back='',from,to,delay=0,duration=640,flip=false,arrival,scope,hold=false,tilt=0,shrink=false}) {
  if(!lively()||!from?.width||!to?.width||typeof Element.prototype.animate!=='function')return;
  const el=document.createElement('div');
  el.className='fx-card';
  el.setAttribute('aria-hidden','true');
  el.style.width=to.width+'px';
  el.style.height=to.height+'px';
  el.innerHTML='<div class="fx-card-inner'+(flip?' is-flipping':'')+'">'+(flip?'<div class="fx-face fx-back">'+back+'</div><div class="fx-face fx-front">'+face+'</div>':'<div class="fx-face">'+face+'</div>')+'</div>';
  document.body.append(el);
  let masked=[];
  const mask=()=>{
    masked=arrival?.().filter(Boolean)??[];
    masked.forEach(node=>node.classList.add('awaiting-card'));
  };
  mask();
  const s0=from.width/to.width;
  const x0=from.left+from.width/2-to.width/2, y0=from.top+from.height/2-to.height/2;
  const x1=to.left, y1=to.top, lift=Math.max(36,Math.hypot(x1-x0,y1-y0)*.22);
  const spin=tilt||rand(-14,14), end=shrink?.94:1;
  const animation=el.animate([
    {transform:`translate(${x0}px,${y0}px) rotate(${hold?0:-spin}deg) scale(${s0})`,opacity:hold?1:0},
    {transform:`translate(${x0}px,${y0-6}px) rotate(${-spin}deg) scale(${s0*1.05})`,opacity:1,offset:.08},
    {transform:`translate(${(x0+x1)/2}px,${Math.min(y0,y1)-lift}px) rotate(${spin/2}deg) scale(${(s0+1)/2*1.12})`,offset:.52},
    {transform:`translate(${x1}px,${y1}px) rotate(0deg) scale(${end})`,opacity:1,offset:.9},
    {transform:`translate(${x1}px,${y1}px) rotate(0deg) scale(${end})`,opacity:shrink?0:1}
  ],{duration,delay,easing:'cubic-bezier(.35,.6,.25,1)',fill:'both'});
  const card={scope,mask,finish(){
    if(!cardFlights.delete(card))return;
    animation.cancel();
    el.remove();
    masked.forEach(node=>node.classList.remove('awaiting-card'));
  }};
  cardFlights.add(card);
  animation.finished.then(card.finish,card.finish);
  if(flip) el.firstElementChild.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],
    {duration:duration*.22,delay:delay+duration*.76,easing:'ease-out',fill:'both'});
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
