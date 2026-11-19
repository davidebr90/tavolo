import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyProfile,emptyProfile,handleProfile,profileId,profileLifetime,maxSeats} from '../src/profiles.mjs';
import {localProfiles} from '../src/local-rooms.mjs';

const key='c'.repeat(64), other='d'.repeat(64);
const room=n=>String(n).padStart(24,'0'), seat=n=>String(n).padStart(64,'e');
function memory() {
  const map=new Map();
  return {map,read:id=>map.get(id),save:(id,profile)=>map.set(id,structuredClone(profile))};
}
const call=(store,token,body,now)=>handleProfile(new Request('https://example.test/api/profile',{
  method:body?'POST':'GET',headers:{Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined
}),store,now);

test('A profile collects seats, replaces a re-joined seat and remembers removals',()=>{
  let p=emptyProfile('id',1);
  p=applyProfile(p,{name:' Davide ',nickname:'[b]Davide[/b]',add:[{code:room(1),token:seat(1)},{code:room(2),token:seat(2)}]},2);
  assert.equal(p.name,'Davide');
  assert.deepEqual(p.seats.map(s=>s.code),[room(1),room(2)]);
  p=applyProfile(p,{add:[{code:room(1),token:seat(9)}],remove:[room(2)]},3);
  assert.deepEqual(p.seats,[{code:room(1),token:seat(9),addedAt:2}]);
  assert.deepEqual(p.removed,[{code:room(2),at:3}]);
  p=applyProfile(p,{add:[{code:room(2),token:seat(2)}]},4);
  assert.deepEqual(p.removed,[]);
  assert.equal(p.updatedAt,4);
});

test('Invalid profile data is rejected and the seat list stays bounded',()=>{
  const p=emptyProfile('id',1);
  assert.throws(()=>applyProfile(p,{add:[{code:'xyz',token:seat(1)}]},2));
  assert.throws(()=>applyProfile(p,{add:[{code:room(1),token:'short'}]},2));
  assert.throws(()=>applyProfile(p,{name:'x'.repeat(41)},2));
  assert.throws(()=>applyProfile(p,[],2));
  let full=p;
  for(let i=0;i<maxSeats+5;i+=50)full=applyProfile(full,{add:Array.from({length:50},(_,k)=>({code:room(i+k),token:seat(i+k)}))},2);
  assert.equal(full.seats.length,maxSeats);
});

test('The personal key opens the profile, other keys do not',async()=>{
  const store=memory();
  assert.equal((await call(store,key)).status,404);
  assert.equal((await call(store,'nope',{})).status,401);
  const created=await call(store,key,{name:'Davide',add:[{code:room(1),token:seat(1)}]},1000);
  assert.equal(created.status,200);
  const read=await (await call(store,key,undefined,2000)).json();
  assert.deepEqual(read.seats,[{code:room(1),token:seat(1)}]);
  assert.equal(read.name,'Davide');
  assert.equal((await call(store,other)).status,404);
  assert.equal(store.map.size,1);
  assert.ok(store.map.has(await profileId(key)));
  assert.notEqual(await profileId(key),key);
});

test('An unused profile expires and a read keeps it alive',async()=>{
  const store=memory();
  await call(store,key,{add:[]},0);
  const later=2*3600000;
  assert.equal((await call(store,key,undefined,later)).status,200);
  assert.equal(store.read(await profileId(key)).updatedAt,later);
  assert.equal((await call(store,key,undefined,later+profileLifetime)).status,404);
});

test('Local profiles survive a restart and are pruned after expiry',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'tavolo-profiles-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const id=await profileId(key);
  localProfiles(directory).save(id,{...emptyProfile(id,10),seats:[{code:room(3),token:seat(3),addedAt:10}]});
  assert.equal(localProfiles(directory).read(id).seats[0].code,room(3));
  assert.throws(()=>localProfiles(directory).read('short'));
  localProfiles(directory).prune(10+profileLifetime);
  assert.equal(localProfiles(directory).read(id),undefined);
});
