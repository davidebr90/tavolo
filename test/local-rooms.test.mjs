import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localRooms} from '../src/local-rooms.mjs';
import {handle} from '../src/service.mjs';
import {sessionLifetime} from '../src/room.mjs';

test('Restart preserves both seats, chat and the receipt needed to retry a move',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'tavolo-test-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const code='a'.repeat(24), a='a'.repeat(64), b='b'.repeat(64);
  let store=localRooms(directory);
  const call=(token,action,body)=>handle(new Request('https://example.test',{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined
  }),action,()=>store.read(code),state=>store.save(code,state));
  assert.equal((await call(a,null,{game:'tris',name:'Ada'})).status,200);
  assert.equal((await call(b,'join',{name:'Leo'})).status,200);
  const move={id:'first',version:1,action:{at:4}};
  assert.equal((await call(a,'moves',move)).status,200);
  assert.equal((await call(b,'chat',{id:'b'.repeat(32),text:'Ciao'})).status,200);
  store=localRooms(directory);
  const retried=await (await call(a,'moves',move)).json();
  assert.equal(retried.version,2);
  assert.equal(retried.game.board[4],1);
  assert.equal(retried.chat[0].text,'Ciao');
  assert.equal((await (await call(b)).json()).side,1);
  assert.deepEqual(readdirSync(directory),[code+'.json']);
  const room=store.read(code);
  assert.deepEqual(store.prune(room.updatedAt+sessionLifetime),[code]);
  assert.equal((await call(a)).status,404);
});
