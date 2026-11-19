import test from 'node:test';
import assert from 'node:assert/strict';
import {shipTiles,shipSectors,rotateShip} from '../public/fleet.mjs';
import {shipCells,start,play} from '../src/games.mjs';

const lengths=[5,4,3,2,1];
// The fleet from the reported screenshot: D6 →, C3 →, B9 →, H8 →, I2.
const reported=[{at:53,vertical:false},{at:22,vertical:false},{at:81,vertical:false},{at:77,vertical:false},{at:18,vertical:false}];
const covered=ships=>ships.flatMap((ship,i)=>shipTiles(ship,lengths[i],10));

test('Client tiles match the server geometry',()=>{
  for(const ship of reported) assert.deepEqual(shipTiles(ship,4,10),shipCells(ship,4,10));
  assert.deepEqual(shipSectors({at:22,vertical:false,reversed:true},4,10),[25,24,23,22]);
});

test('A ship turns around another sector when the clicked one has no room',()=>{
  // Around F3 the ship would leave the grid clockwise and hit ship 1 on F6 counterclockwise.
  const turned=rotateShip(reported,lengths,1,25,1,10);
  assert.ok(turned,'the rotation must find room');
  assert.equal(turned.ship.vertical,true);
  assert.notEqual(turned.pivot,25,'F3 alone has no room: the old single-pivot rule failed here');
  const ships=reported.with(1,turned.ship);
  const cells=covered(ships);
  assert.equal(new Set(cells).size,cells.length);
  assert.ok(cells.every(at=>at>=0));
  assert.ok(shipTiles(turned.ship,4,10).includes(turned.pivot));
  const s=play(start('naval'),{ships},0);
  assert.equal(s.fleets[0].length,5);
});

test('The clicked sector stays in place when it has room',()=>{
  const turned=rotateShip([null,{at:22,vertical:false}],lengths,1,22,1,10);
  assert.deepEqual(turned,{ship:{at:22,vertical:true,reversed:false},pivot:22});
  const back=rotateShip([null,turned.ship],lengths,1,22,-1,10);
  assert.deepEqual(back.ship,{at:22,vertical:false,reversed:false});
});

test('A rotation is refused only when no quarter turn fits',()=>{
  const sizes=[4,4,4];
  const ships=[{at:0,vertical:false},{at:4,vertical:false},{at:8,vertical:false}];
  assert.equal(rotateShip(ships,sizes,1,5,1,4),null);
  assert.ok(rotateShip([null,{at:4,vertical:false},null],sizes,1,5,1,4));
});
