import test from 'node:test';
import assert from 'node:assert/strict';
import {start,play,view} from '../src/games.mjs';
import {botAction,anyAction} from '../src/bots.mjs';
import {create,join,submit,snapshot,spectator,botTurn,playBot,advanceRoomClock} from '../src/room.mjs';
import {handle} from '../src/service.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join as joinPath} from 'node:path';
import {localRooms} from '../src/local-rooms.mjs';

function board(count=2) {
  const state=start('memory',{players:count});
  // Known arrangement for moves and scoring. The production shuffle is checked separately.
  state.pictures=Array.from({length:24},(_,at)=>Math.floor(at/2));
  return state;
}
const flip=(s,at)=>play(s,{at});
const pair=(s,at)=>flip(flip(s,at),at+1);
const move=(room,token,id,action)=>submit(room,token,{id,version:room.version,action});
const restored=room=>JSON.parse(JSON.stringify(room));

test('Memory shuffles 12 pairs and exposes only the faces that have been turned',()=>{
  const s=start('memory');
  assert.equal(s.pictures.length,24);
  for(let id=0;id<12;id++)assert.equal(s.pictures.filter(p=>p===id).length,2);
  for(const players of [0,1,5,2.5,'3'])assert.throws(()=>start('memory',{players}));
  for(const players of [2,3,4])assert.equal(start('memory',{players}).scores.length,players);
  const initial=view(s,0);
  assert.deepEqual(initial.cards,Array(24).fill({state:'down'}));
  assert.ok(!('pictures' in initial)&&!('observations' in initial));
  const first=flip(s,0);
  assert.deepEqual(view(first,1).cards[0],{state:'up',picture:s.pictures[0]});
  assert.deepEqual(view(s,0),initial);
  assert.equal(first.turn,0);
  assert.throws(()=>play(first,{at:1},1));
  for(const at of [0,-1,24,NaN,1.2,'2',null])assert.throws(()=>flip(first,at));
});

test('Room clock holds a mismatch across reload, then covers once and passes the turn',()=>{
  let r=create('memory','A','a',{players:3});
  r.game=board(3);
  assert.equal(snapshot(r,'a').maxPlayers,3);
  assert.throws(()=>move(r,'a','early',{at:0}),/attende/);
  join(r,'B','b'); join(r,'C','c');
  move(r,'a','flip1',{at:0});
  const message={version:r.version,id:'flip2',action:{at:2,now:0}};
  submit(r,'a',message);
  const until=r.game.coverAt, version=r.version;
  assert.ok(until>Date.now());
  assert.equal(r.game.phase,'compare');
  r=restored(r);
  assert.equal(advanceRoomClock(r,until-1),false);
  assert.equal(r.version,version);
  for(const token of ['a','b','c',spectator]) {
    const v=snapshot(r,token).game;
    assert.deepEqual(v.cards.filter(c=>c.state==='up'),[{state:'up',picture:0},{state:'up',picture:1}]);
    assert.ok(!('observations' in v));
  }
  assert.throws(()=>move(r,spectator,'watch',{at:1}),/Accesso/);
  assert.throws(()=>move(r,'a','too-soon',{at:1}));
  assert.throws(()=>move(r,'b','too-soon',{at:1}));
  assert.equal(advanceRoomClock(r,until),true);
  assert.equal(advanceRoomClock(r,until+9999),false);
  assert.equal(r.version,version+1);
  assert.equal(r.game.turn,1);
  assert.equal(r.game.phase,'first');
  assert.deepEqual(snapshot(r,spectator).game.cards,Array(24).fill({state:'down'}));
  assert.equal(submit(r,'a',message),false);
  assert.throws(()=>submit(r,'b',{version,id:'stale',action:{at:1}}),/cambiata/);
  assert.equal(move(r,'b','new',{at:1}),true);
});

test('matching earns one point and another turn, and tied leaders are distinct from losing seats',()=>{
  let r=create('memory','A','a',{players:3});
  join(r,'B','b');join(r,'C','c');r.game=board(3);
  let id=0;
  const miss=(a,b)=>{
    move(r,r.players[r.game.turn].token,String(++id),{at:a});
    move(r,r.players[r.game.turn].token,String(++id),{at:b});
    advanceRoomClock(r,r.game.coverAt);
  };
  for(let at=0;at<10;at+=2)r.game=pair(r.game,at);
  assert.deepEqual(r.game.scores,[5,0,0]);
  assert.equal(r.game.turn,0);
  assert.throws(()=>flip(r.game,1));
  miss(10,12);
  for(let at=10;at<20;at+=2)r.game=pair(r.game,at);
  miss(20,22);
  r.game=pair(pair(r.game,20),22);
  const v=snapshot(r,'c').game;
  assert.deepEqual(v.scores,[5,5,2]);
  assert.equal(v.result,'draw');
  assert.deepEqual(v.winners,[0,1]);
  assert.deepEqual(v.cards[0],{state:'matched',picture:0});
  assert.ok(v.cards.every(c=>c.state==='matched'));
  assert.throws(()=>flip(r.game,0));
  for(const token of ['a','b','c'])move(r,token,String(++id),{rematch:true});
  const reset=snapshot(r,'c');
  assert.deepEqual(reset.players,['B','C','A']);
  assert.equal(reset.maxPlayers,3);
  assert.deepEqual(reset.game.scores,[0,0,0]);
  assert.deepEqual(reset.game.winners,[]);
  assert.equal(reset.game.result,null);
});

test('bots can recall earlier public flips without inspecting hidden pictures',()=>{
  const r=create('memory','A','a',{players:2,bots:1,level:2});
  r.game=board();
  move(r,'a','first',{at:0});
  move(r,'a','second',{at:2});
  assert.equal(botTurn(r),-1);
  assert.equal(playBot(r,'a',{version:r.version}),false);
  advanceRoomClock(r,r.game.coverAt);
  assert.equal(botTurn(r),1);
  r.game=flip(r.game,1); // The computer has just revealed the known zero's mate.
  // Changing unseen faces cannot change which publicly known card it chooses.
  [r.game.pictures[5],r.game.pictures[7]]=[r.game.pictures[7],r.game.pictures[5]];
  assert.deepEqual(botAction(r.game,1,{level:2}),{at:0});
  const version=r.version;
  assert.equal(playBot(r,'a',{version}),true);
  assert.equal(playBot(r,'a',{version}),false);
  assert.deepEqual(r.game.scores,[0,1]);
  assert.doesNotThrow(()=>play(r.game,anyAction(r.game,1),1));
});

test('HTTP restore commits an overdue cover once even when the first incoming request is stale',async()=>{
  const a='a'.repeat(64), b='b'.repeat(64);
  let saved=create('memory','A',a);join(saved,'B',b);saved.game=board();
  move(saved,a,'first',{at:0});move(saved,a,'second',{at:2});
  saved.game.coverAt=Date.now()-1; // persisted while the server was offline
  const version=saved.version, published=[];
  const call=(token,method,body)=>{
    const request=new Request('https://tavolo.example/api/rooms/test',{method,headers:{Authorization:'Bearer '+token},body:body&&JSON.stringify(body)});
    return handle(request,body?'moves':null,()=>restored(saved),room=>{saved=room;published.push(room.version);});
  };
  const stale=await call(b,'POST',{id:'old',version,action:{at:3}});
  assert.equal(stale.status,409);
  const current=await (await call(b,'GET')).json();
  assert.equal(current.version,version+1);
  assert.equal(current.game.phase,'first');
  assert.equal(current.game.turn,1);
  assert.ok(current.game.cards.every(c=>c.state==='down'));
  assert.deepEqual(published,[version+1]);
});

test('local subscribers receive the cover automatically, without another move or poll',
  {skip:!process.env.TAVOLO_HTTP_TEST,timeout:15000},async t=>{
    const directory=await mkdtemp(joinPath(tmpdir(),'tavolo-memory-'));
    const code='a'.repeat(24),a='a'.repeat(64),b='b'.repeat(64);
    const room=create('memory','A',a);join(room,'B',b);room.game=board();
    move(room,a,'first',{at:0});
    localRooms(directory).save(code,room);
    const server=spawn(process.execPath,['dev.mjs'],{cwd:new URL('..',import.meta.url),
      env:{...process.env,PORT:'0',TAVOLO_ROOM_DIR:directory}});
    const stopped=once(server,'exit');
    t.after(async()=>{server.kill();await stopped;await rm(directory,{recursive:true,force:true});});
    const [out]=await once(server.stdout,'data');
    const port=out.toString().match(/porta (\d+)/)[1];
    const url='http://127.0.0.1:'+port+'/api/rooms/'+code;
    const stream=await fetch(url+'/events?seat='+b,{signal:AbortSignal.timeout(9000)});
    const reader=stream.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer='';
    async function event() {
      while(!buffer.includes('\n\n')) {
        const {done,value}=await reader.read();
        assert.equal(done,false);
        buffer+=value;
      }
      const end=buffer.indexOf('\n\n');
      const next=JSON.parse(buffer.slice(6,end));
      buffer=buffer.slice(end+2);
      return next;
    }
    try {
      assert.equal((await event()).game.phase,'second');
      const second=await fetch(url+'/moves',{method:'POST',headers:{Authorization:'Bearer '+a},
        body:JSON.stringify({id:'second',version:room.version,action:{at:2}})});
      assert.equal(second.status,200);
      const compared=await event();
      assert.equal(compared.game.phase,'compare');
      const covered=await event();
      assert.equal(covered.game.phase,'first');
      assert.equal(covered.game.turn,1);
      assert.equal(covered.version,compared.version+1);
      assert.ok(Date.now()>=compared.game.coverAt);
      assert.ok(covered.game.cards.every(card=>card.state==='down'));
    } finally {await reader.cancel();}
  });
