import test from 'node:test';
import assert from 'node:assert/strict';

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
  prefs.matches=true;
  flight(options);
  assert.equal(hidden(),false);
  assert.equal(overlays.size,0);
});
