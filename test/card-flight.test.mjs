import test from 'node:test';
import assert from 'node:assert/strict';

test('Announcements survive moves and resize, and clear with their queue when leaving play',async t=>{
  const win=Object.assign(new EventTarget(),{innerWidth:1024});
  const doc=Object.assign(new EventTarget(),{hidden:false,documentElement:{dataset:{}}});
  const visible=new Set();
  let shown=0;
  doc.body={append:el=>{visible.add(el);shown++;}};
  doc.createElement=()=>({style:{setProperty(){}},setAttribute(){},remove(){visible.delete(this);}});
  for(const [key,value] of Object.entries({window:win,document:doc,matchMedia:()=>({matches:false})})) {
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>original?Object.defineProperty(globalThis,key,original):delete globalThis[key]);
  }
  const {syncAnnouncements,syncCardFlights,announce,setMotionLevel}=await import('../public/motion.mjs?announcements');
  t.mock.timers.enable({apis:['setTimeout']});
  const room={game:{id:'scopa'},version:4,games:1};
  const queueTwo=()=>{announce('A',{hold:100});announce('B',{hold:100});};
  const cleared=()=>{
    const count=shown;
    assert.equal(visible.size,0);
    t.mock.timers.tick(1500);
    announce('C',{hold:100});
    t.mock.timers.tick(1500);
    assert.equal(shown,count+1);
    assert.equal(visible.size,0);
  };
  syncAnnouncements('a',room,'play');
  queueTwo();
  const [first]=visible;
  syncCardFlights('a/5/another-layout');
  syncAnnouncements('a',{...room,version:5},'play');
  win.innerWidth=900;
  win.dispatchEvent(new Event('resize'));
  assert.ok(visible.has(first));
  t.mock.timers.tick(750);
  assert.equal(visible.size,1);
  assert.equal(visible.has(first),false);
  t.mock.timers.tick(750);
  for(const [code,game,tab] of [['b',room,'play'],['a',{...room,games:2},'play'],['a',room,'rules']]) {
    syncAnnouncements('a',room,'play');
    queueTwo();
    syncAnnouncements(code,game,tab);
    cleared();
  }
  syncAnnouncements('a',room,'play');
  queueTwo();
  doc.hidden=true;
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden=false;
  cleared();
  queueTwo();
  setMotionLevel('calm');
  setMotionLevel('full');
  cleared();
});

test('A card keeps its destination hidden across renders and reveals it exactly at arrival',async t=>{
  const animations=[], overlays=new Set();
  class Element {
    style={};
    classList={
      values:new Set(),
      add(name){this.values.add(name);},
      remove(name){this.values.delete(name);}
    };
    setAttribute(){}
    remove(){overlays.delete(this);}
    animate() {
      const {promise,resolve,reject}=Promise.withResolvers();
      const animation={finished:promise,complete:resolve,cancel:reject};
      animations.push(animation);
      return animation;
    }
  }
  const prefs={matches:false};
  const globals={Element,matchMedia:()=>prefs,
    document:{createElement:()=>new Element(),body:{append:el=>overlays.add(el)}}};
  for(const [key,value] of Object.entries(globals)) {
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>original?Object.defineProperty(globalThis,key,original):delete globalThis[key]);
  }
  const {flight,syncCardFlights}=await import('../public/motion.mjs');
  let destination=new Element();
  const hidden=()=>destination.classList.values.has('awaiting-card');
  const rect={left:0,top:10,width:20,height:32};
  const options={face:'card',scope:'room/1',from:rect,to:rect,arrival:()=>[destination]};
  flight(options);
  assert.ok(hidden());
  assert.equal(overlays.size,1);
  destination=new Element();
  syncCardFlights('room/1');
  assert.ok(hidden());
  animations[0].complete();
  await Promise.resolve();
  assert.equal(hidden(),false);
  assert.equal(overlays.size,0);
  flight(options);
  syncCardFlights('room/2');
  assert.equal(hidden(),false);
  assert.equal(overlays.size,0);
  // Overlapping chip/card flights can reserve the same pile. Re-rendering the
  // room and finishing one flight must keep the other destination concealed.
  flight(options);
  flight(options);
  const [first,last]=animations.slice(-2);
  const old=destination;
  destination=new Element();
  syncCardFlights('room/1');
  assert.equal(old.classList.values.has('awaiting-card'),false);
  first.complete();
  await Promise.resolve();
  assert.ok(hidden());
  last.complete();
  await Promise.resolve();
  assert.equal(hidden(),false);
  prefs.matches=true;
  flight(options);
  assert.equal(hidden(),false);
  assert.equal(overlays.size,0);
});
