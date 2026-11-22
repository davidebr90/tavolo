import assert from 'node:assert/strict';
import test from 'node:test';
import {create,join,sessionLifetime} from '../src/room.mjs';
import {handle} from '../src/service.mjs';

const white='a'.repeat(64),black='b'.repeat(64),guest='c'.repeat(64);
function read(room,token,{tag,watch=false}={}) {
  const headers={Authorization:'Bearer '+token};
  if(tag)headers['If-None-Match']=tag;
  return handle(new Request('https://example.test/room'+(watch?'?guarda=1':''),{headers}),null,()=>room,
    ()=>assert.fail('A read of this stable room must not write it'));
}
function update(room,token,operation,data) {
  const request=new Request('https://example.test/room/'+operation,{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data)
  });
  return handle(request,operation,()=>room,()=>{});
}

test('An unchanged room returns an empty 304 before calculating a legal view',async()=>{
  const room=create('chess','Ada',white);
  join(room,'Leo',black);
  const initial=await read(room,white);
  assert.equal(initial.status,200);
  const tag=initial.headers.get('etag');
  assert.match(tag,/^W\/"[^"]+"$/);
  assert.ok((await initial.json()).game.moves.length>0);
  const board=room.game.board;
  let reads=0;
  Object.defineProperty(room.game,'board',{get(){reads++;return board;}});
  for(const candidate of [tag,'"old", '+tag.slice(2),'*']){
    const reply=await read(room,white,{tag:candidate});
    assert.equal(reply.status,304);
    assert.equal(reply.headers.get('etag'),tag);
    assert.match(reply.headers.get('cache-control'),/no-store/);
    assert.match(reply.headers.get('vary'),/authorization/i);
    assert.equal(reply.body,null);
    assert.equal((await reply.arrayBuffer()).byteLength,0);
  }
  assert.equal(reads,0);
  assert.equal((await read(room,white,{tag:'"old"'})).status,200);
  assert.ok(reads>0);
});

test('Joining, chat, an independent style revision and a move each invalidate the previous response',async()=>{
  const room=create('chess','Ada',white);
  let tag=(await read(room,white)).headers.get('etag');
  const changes=[
    [black,'join',{name:'Leo'},snapshot=>assert.deepEqual(snapshot.players,['Ada','Leo'])],
    [white,'chat',{id:'1'.repeat(32),text:'Ciao'},snapshot=>assert.equal(snapshot.chat.at(-1).text,'Ciao')],
    [black,'chess-style',{id:'nordico',revision:0},snapshot=>assert.equal(snapshot.chessStyle.id,'nordico')],
    [white,'moves',{id:'e4',version:1,action:{from:52,to:36}},snapshot=>assert.equal(snapshot.game.history.at(-1).san,'e4')]
  ];
  for(const [token,operation,data,check] of changes){
    const write=await update(room,token,operation,data);
    assert.equal(write.status,200,operation+' '+(write.ok?'':await write.text()));
    const updated=await read(room,white,{tag});
    assert.equal(updated.status,200,operation);
    check(await updated.json());
    const nextTag=updated.headers.get('etag');
    assert.ok(nextTag&&nextTag!==tag,operation);
    assert.equal((await read(room,white,{tag:nextTag})).status,304);
    tag=nextTag;
  }
});

test('Private seats and spectator views have distinct validators, checked only after access and expiry',async()=>{
  const room=create('scopa','Ada',white);
  join(room,'Leo',black);
  const first=await read(room,white);
  const firstTag=first.headers.get('etag');
  assert.equal((await first.json()).game.hand.length,3);
  const second=await read(room,black,{tag:firstTag});
  const secondTag=second.headers.get('etag');
  assert.equal(second.status,200);
  assert.equal((await second.json()).side,1);
  const watch=await read(room,guest,{watch:true,tag:firstTag});
  assert.equal(watch.status,200);
  const watchTag=watch.headers.get('etag');
  const publicState=await watch.json();
  assert.equal(publicState.spectator,true);
  assert.deepEqual(publicState.game.hand,[]);
  assert.equal(new Set([firstTag,secondTag,watchTag]).size,3);
  assert.equal((await read(room,guest,{watch:true,tag:watchTag})).status,304);
  for(const tag of [firstTag,watchTag,'*']){
    assert.equal((await read(room,guest,{tag})).status,409);
    assert.equal((await read(room,'invalid',{tag})).status,401);
  }
  room.updatedAt=Date.now()-sessionLifetime-1;
  assert.equal((await read(room,white,{tag:'*'})).status,404);
});
