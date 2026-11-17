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
