import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {roomTransport,watchRoom} from '../public/rooms.mjs';

test('Older local servers use short polling; production keeps WebSockets',()=>{
  assert.equal(roomTransport({transport:'sse'}),'poll');
  assert.equal(roomTransport({transport:'poll'}),'poll');
  assert.equal(roomTransport(null),'ws');
});
test('Room polling does not overlap requests or deliver a late snapshot after navigation',async ()=>{
  let release, started=0;
  const received=[];
  const stop=watchRoom({},'poll',value=>received.push(value),()=>{
    started++;
    return new Promise(resolve=>{release=resolve;});
  },{interval:3});
  try {
    await wait(20);
    assert.equal(started,1);
    stop();
    release({version:1});
    await wait(20);
    assert.deepEqual(received,[]);
    assert.equal(started,1);
  } finally {stop();}
});

test('the first recovered snapshot is marked once, whether WebSocket or polling delivers it',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const previousSocket=globalThis.WebSocket, previousLocation=globalThis.location;
  const sockets=[];
  globalThis.location=new URL('https://tavolo.example/');
  globalThis.WebSocket=class {
    constructor(){sockets.push(this);}
    message(version){this.onmessage({data:JSON.stringify({version})});}
    close(){this.onclose();}
  };
  const events=[];
  const stop=watchRoom({code:'table',token:'seat'},'ws',(state,info)=>events.push([state.version,info?.reconnect??false]),async()=>({version:4}));
  try {
    sockets[0].message(1);
    sockets[0].close();
    t.mock.timers.tick(500);
    sockets[1].message(2);
    sockets[1].message(3);
    sockets[1].close();
    t.mock.timers.tick(1000);
    await Promise.resolve();
    sockets[2].message(5);
    assert.deepEqual(events,[[1,false],[2,true],[3,false],[4,true],[5,false]]);
  } finally {
    stop();
    globalThis.WebSocket=previousSocket;
    if(previousLocation===undefined) delete globalThis.location;
    else globalThis.location=previousLocation;
  }
});
