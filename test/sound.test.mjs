import test from 'node:test';
import assert from 'node:assert/strict';

async function browserAudio(t,{blocked=false}={}) {
  let preference=null, buffers=0;
  const sources=[];
  const win=new EventTarget(), doc=new EventTarget();
  const storage={
    getItem(){if(blocked)throw Error('Storage blocked');return preference;},
    setItem(key,value){if(blocked)throw Error('Storage blocked');preference=value;}
  };
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({connect(target){return target;},disconnect(){},gain:param(),frequency:param(),Q:param()});
  function source() {
    const sound={...node(),start(at){this.started=at;},stop(at=0){this.stopped=at;}};
    sources.push(sound);
    return sound;
  }
  class AudioContext {
    currentTime=0;
    state='running';
    sampleRate=48000;
    destination=node();
    createGain=node;
    createBiquadFilter=node;
    createOscillator=source;
    createBufferSource=source;
    createBuffer(){buffers++;return {getChannelData:()=>new Float32Array(this.sampleRate)};}
  }
  for(const [name,value] of Object.entries({window:win,document:doc,localStorage:storage,AudioContext})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
    Object.defineProperty(globalThis,name,{value,configurable:true});
    t.after(()=>descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]);
  }
  const audio=await import('../public/sound.mjs?'+encodeURIComponent(t.name));
  const remote=value=>{
    preference=value;
    win.dispatchEvent(Object.assign(new Event('storage'),{key:'tavolo:sound',newValue:value,storageArea:storage}));
  };
  return {audio,sources,doc,remote,buffers:()=>buffers};
}

test('Muting cancels active and queued voices, and fresh sounds can start immediately on unmute',async t=>{
  const {audio,sources,doc}=await browserAudio(t);
  doc.dispatchEvent(new Event('pointerdown'));
  audio.play('card');
  audio.play('win',{delay:2500});
  assert.ok(sources.length>2);
  assert.ok(sources.some(source=>source.started>2));
  audio.setSound(false);
  assert.ok(sources.every(source=>source.stopped===0));
  const before=sources.length;
  audio.play('card');
  assert.equal(sources.length,before);
  audio.setSound(true);
  audio.play('card');
  assert.ok(sources.length>before);
});

test('Muting in another tab interrupts this table and updates its control',async t=>{
  const {audio,sources,doc,remote}=await browserAudio(t);
  const received=[];
  audio.onSoundChange(()=>received.push(audio.soundOn()));
  doc.dispatchEvent(new Event('pointerdown'));
  audio.play('capture',{delay:800});
  remote('off');
  assert.deepEqual(received,[false]);
  assert.ok(sources.length>0&&sources.every(source=>source.stopped===0));
  remote('on');
  assert.deepEqual(received,[false,true]);
});

test('Sound preferences survive denied storage for the lifetime of the page',async t=>{
  const {audio,sources}=await browserAudio(t,{blocked:true});
  audio.setSound(false);
  assert.equal(audio.soundOn(),false);
  audio.play('message');
  assert.equal(sources.length,0);
  audio.setSound(true);
  assert.equal(audio.soundOn(),true);
});

test('Unlocking audio and playing pitched notes allocate no noise until a game uses it',async t=>{
  const {audio,doc,buffers}=await browserAudio(t);
  doc.dispatchEvent(new Event('keydown'));
  audio.play('message');
  assert.equal(buffers(),0);
  audio.play('card');
  audio.play('dice');
  assert.equal(buffers(),1);
});
