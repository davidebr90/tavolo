// Table sounds, synthesised on the spot: there are no audio files to download. Browsers only
// let a page make sound after it has been touched, so nothing plays before the first click or
// key. One switch in the header silences everything and is remembered on the device.
const KEY='tavolo:sound', VOLUME=.5;
let context=null, master=null, grain=null;
const recent=new Map();
const active=new Set(), changes=new EventTarget();
function stored() {try {return localStorage.getItem(KEY);} catch {return undefined;}}
const initial=stored();
let enabled=initial!=='off', known=initial==='off'||initial==='on', channel;
export const soundOn=()=>enabled;
export function onSoundChange(listener) {
  changes.addEventListener('change',listener);
  return ()=>changes.removeEventListener('change',listener);
}
function applySound(on) {
  if(enabled===on)return;
  enabled=on;
  if(master)master.gain.value=on?VOLUME:0;
  if(!on){
    // Web Audio starts delayed effects on its own clock, even across a mute/unmute.
    for(const source of active){source.disconnect();source.stop();}
    active.clear();
    recent.clear();
  }
  changes.dispatchEvent(new Event('change'));
}
export function setSound(on) {
  known=true;
  applySound(on);
  try {localStorage.setItem(KEY,on?'on':'off');} catch {channel?.postMessage({on});}
  if(on)wake();
}
if(typeof window!=='undefined'){
  window.addEventListener('storage',event=>{
    if(event.key!==KEY&&event.key!==null)return;
    const value=stored();
    if(value===undefined)return;
    known=value==='off'||value==='on';
    applySound(value!=='off');
  });
  // If storage is unavailable, open tabs can still share the switch. A new
  // tab can ask for the choice made during this browser session.
  if(window.BroadcastChannel)try {
    channel=new window.BroadcastChannel(KEY);
    channel.onmessage=({data})=>{
      if(data==='query'){
        if(known)channel.postMessage({on:enabled,initial:true});
      }else if(typeof data?.on==='boolean'&&(!data.initial||!known)){
        known=true;
        applySound(data.on);
      }
    };
    if(!known)channel.postMessage('query');
  } catch {channel=null;}
}
function wake() {
  const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;
  if(!Audio)return null;
  if(!context) {
    context=new Audio();
    master=context.createGain();
    master.connect(context.destination);
    master.gain.value=VOLUME;
  }
  if(context.state==='suspended'||context.state==='interrupted')context.resume().catch(()=>{});
  return context;
}
if(typeof document!=='undefined') {
  const unlock=event=>{
    if(enabled&&context?.state!=='running'&&!event.target?.closest?.('#sound-toggle'))wake();
  };
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,unlock,{passive:true,capture:true});
}
function track(source) {
  active.add(source);
  source.onended=()=>{active.delete(source);source.disconnect();};
}
// A pitched note that fades out; `to` bends the pitch while it sounds.
function tone(at,{freq,to=freq,type='sine',dur=.12,gain=.25,attack=.004}) {
  const osc=context.createOscillator(), level=context.createGain();
  osc.type=type;
  osc.frequency.setValueAtTime(freq,at);
  if(to!==freq)osc.frequency.exponentialRampToValueAtTime(to,at+dur);
  level.gain.setValueAtTime(.0001,at);
  level.gain.exponentialRampToValueAtTime(gain,at+attack);
  level.gain.exponentialRampToValueAtTime(.0001,at+dur);
  osc.connect(level).connect(master);
  osc.start(at);
  osc.stop(at+dur+.03);
  track(osc);
}
// A burst of filtered noise; `to` sweeps the filter.
function hiss(at,{freq,to=freq,kind='bandpass',q=1,dur=.08,gain=.2,attack=.003}) {
  if(!grain){
    grain=context.createBuffer(1,context.sampleRate,context.sampleRate);
    const data=grain.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  }
  const source=context.createBufferSource(), filter=context.createBiquadFilter(), level=context.createGain();
  source.buffer=grain;
  filter.type=kind;
  filter.Q.value=q;
  filter.frequency.setValueAtTime(freq,at);
  if(to!==freq)filter.frequency.exponentialRampToValueAtTime(to,at+dur);
  level.gain.setValueAtTime(.0001,at);
  level.gain.exponentialRampToValueAtTime(gain,at+attack);
  level.gain.exponentialRampToValueAtTime(.0001,at+dur);
  source.connect(filter).connect(level).connect(master);
  source.start(at,Math.random()*.8);
  source.stop(at+dur+.03);
  track(source);
}
const vary=(value,spread=.06)=>value*(1+(Math.random()*2-1)*spread);
const notes=(at,list,options)=>list.forEach(([freq,when,dur=.16],i)=>tone(at+when,{freq,dur,...options}));
const voices={
  // Cards
  card:at=>{hiss(at,{freq:vary(2600),to:1400,q:.8,dur:.09,gain:.22});hiss(at+.05,{freq:900,kind:'lowpass',dur:.05,gain:.1});},
  deal:at=>hiss(at,{freq:vary(3400),kind:'highpass',dur:.045,gain:.12}),
  slide:at=>hiss(at,{freq:1800,to:700,q:.6,dur:.28,gain:.14,attack:.05}),
  // Chips
  chip:at=>{tone(at,{freq:vary(2500),type:'triangle',dur:.035,gain:.16});tone(at+.032,{freq:vary(3200),type:'triangle',dur:.03,gain:.11});},
  chips:at=>{for(let i=0;i<5;i++)voices.chip(at+i*.045+Math.random()*.02);},
  knock:at=>{tone(at,{freq:150,to:80,dur:.09,gain:.5});hiss(at,{freq:500,kind:'lowpass',dur:.03,gain:.18});},
  // Boards
  move:at=>{tone(at,{freq:vary(230),to:130,dur:.07,gain:.4});hiss(at,{freq:1500,kind:'lowpass',dur:.025,gain:.18});},
  capture:at=>{voices.move(at);hiss(at+.02,{freq:1100,to:300,kind:'lowpass',dur:.16,gain:.3});},
  place:at=>{tone(at,{freq:vary(880),to:520,type:'triangle',dur:.05,gain:.22});hiss(at,{freq:2500,dur:.02,gain:.1});},
  stone:at=>{tone(at,{freq:vary(1250),to:900,type:'triangle',dur:.04,gain:.2});hiss(at,{freq:3000,kind:'highpass',dur:.018,gain:.12});},
  drop:at=>{tone(at,{freq:620,to:190,dur:.2,gain:.2});voices.place(at+.5);},
  flip:at=>{for(let i=0;i<3;i++)hiss(at+i*.07,{freq:vary(2100),dur:.03,gain:.12});},
  dice:at=>{for(let i=0;i<7;i++)hiss(at+i*.07+Math.random()*.03,{freq:vary(1700,.3),q:2,dur:.035,gain:.22-i*.02});},
  // Sea
  splash:at=>hiss(at,{freq:2400,to:300,kind:'lowpass',dur:.55,gain:.26,attack:.02}),
  explosion:at=>{hiss(at,{freq:900,to:90,kind:'lowpass',dur:.7,gain:.55});tone(at,{freq:95,to:38,dur:.5,gain:.5});},
  // Signals
  turn:at=>notes(at,[[659,0],[880,.11,.2]],{gain:.14}),
  check:at=>notes(at,[[880,0,.09],[1175,.09,.18]],{type:'triangle',gain:.16}),
  chime:at=>notes(at,[[1047,0,.14],[1568,.08,.3]],{gain:.12}),
  sweep:at=>{hiss(at,{freq:500,to:4000,q:.7,dur:.35,gain:.16,attack:.1});notes(at+.3,[[784,0],[1047,.09],[1319,.18,.35]],{gain:.14});},
  start:at=>notes(at,[[523,0],[659,.1],[784,.2,.3]],{type:'triangle',gain:.13}),
  join:at=>notes(at,[[440,0,.1],[660,.09,.2]],{gain:.12}),
  message:at=>tone(at,{freq:560,to:820,dur:.12,gain:.12}),
  win:at=>notes(at,[[523,0],[659,.12],[784,.24],[1047,.36,.5],[1319,.5,.6]],{type:'triangle',gain:.16}),
  lose:at=>notes(at,[[392,0,.25],[311,.22,.25],[262,.44,.55]],{gain:.14}),
  draw:at=>notes(at,[[440,0,.2],[440,.24,.35]],{gain:.12})
};
// Plays a named sound `delay` milliseconds from now. Bursts of the same sound are thinned out.
export function play(name,{delay=0}={}) {
  if(!soundOn()||!context||context.state!=='running'||!voices[name])return;
  const due=context.currentTime+delay/1000, times=(recent.get(name)??[]).filter(time=>time>due-.4);
  if(times.length>=6||times.some(time=>Math.abs(time-due)<.02))return;
  times.push(due);
  recent.set(name,times);
  voices[name](due+.005);
}
export const soundNames=Object.keys(voices);
