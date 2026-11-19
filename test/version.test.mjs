import test from 'node:test';
import assert from 'node:assert/strict';
import {version,updatedAt} from '../public/version.mjs';
import {settings} from '../src/service.mjs';

test('The release number is a semantic version',()=>{
  assert.match(version,/^\d+\.\d+\.\d+$/);
});

test('Core update times are read from ISO strings and epoch values',()=>{
  const iso='2026-11-19T08:30:00.000Z';
  assert.equal(updatedAt(iso)?.toISOString(),iso);
  assert.equal(updatedAt(Date.parse(iso))?.toISOString(),iso);
  assert.equal(updatedAt(Date.parse(iso)/1000)?.toISOString(),iso);
  assert.equal(updatedAt('2026-11-19T08:28:17.616941Z')?.toISOString(),'2026-11-19T08:28:17.616Z');
  for(const value of [undefined,null,'',' ','domani',0,-5,Number.NaN,{}])assert.equal(updatedAt(value),null);
});

test('Client settings carry the transport, the release and the core update time',()=>{
  assert.deepEqual(settings('ws','2026-11-19T08:30:00Z'),{transport:'ws',version,updated:'2026-11-19T08:30:00Z'});
  assert.deepEqual(settings('sse'),{transport:'sse',version,updated:null});
});
