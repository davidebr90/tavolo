import test from 'node:test';
import assert from 'node:assert/strict';
import {keyFromText,profileLink,maskedLink,mergeSeats,validKey} from '../public/profile.mjs';

const key='0123456789abcdef'.repeat(4);
const room=n=>String(n).padStart(24,'0'), seat=n=>String(n).padStart(64,'e');

test('Personal links carry the key in the fragment and can be pasted in any form',()=>{
  const link=profileLink('https://tavolo.example',key);
  assert.equal(link,'https://tavolo.example/#profilo='+key);
  assert.equal(new URL(link).search,'');
  assert.equal(keyFromText(link),key);
  assert.equal(keyFromText('  '+key+'  '),key);
  assert.equal(keyFromText('#profilo='+key),key);
  assert.equal(keyFromText('https://tavolo.example/?stanza='+room(1)+'#profilo='+key),key);
  assert.equal(keyFromText('profilo='+key+'0'),null);
  assert.equal(keyFromText('https://tavolo.example/?stanza='+room(1)),null);
  assert.equal(maskedLink('https://t.example',key),'https://t.example/#profilo=0123…cdef');
  assert.ok(validKey(key));
  assert.ok(!validKey('xyz'));
});

test('Seats merge: the profile wins, local-only rooms upload, removals elsewhere drop',()=>{
  const local=[{code:room(1),token:seat(1)},{code:room(2),token:seat(2)},{code:room(3),token:seat(3)},{code:room(4),token:seat(9)}];
  const remote={seats:[{code:room(1),token:seat(1)},{code:room(4),token:seat(4)},{code:room(5),token:seat(5)}],removed:[room(3)]};
  assert.deepEqual(mergeSeats(local,remote),{
    download:[{code:room(4),token:seat(4)},{code:room(5),token:seat(5)}],
    upload:[{code:room(2),token:seat(2)}],
    drop:[room(3)]
  });
  assert.deepEqual(mergeSeats([],{seats:[],removed:[]}),{download:[],upload:[],drop:[]});
  assert.deepEqual(mergeSeats(local.slice(0,1),undefined).upload,local.slice(0,1));
});
