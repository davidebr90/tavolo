import test from 'node:test';
import assert from 'node:assert/strict';
import {chipCounts,chipColors,chipPile,cardFace,cardLabel,isPoker,pokerTable} from '../public/poker-table.mjs';

const worth=amount=>chipCounts(amount).reduce((sum,[value,count])=>sum+value*count,0);

test('A stack of chips is always worth its amount',()=>{
  for(const amount of [0,1,4,5,9,25,37,100,199,400,1234,5000])assert.equal(worth(amount),amount,'amount '+amount);
  assert.deepEqual(chipCounts(0),[]);
  assert.deepEqual(chipCounts(-3),[]);
});

test('Stacks keep small chips in play instead of a single large one',()=>{
  assert.deepEqual(chipCounts(5),[[1,5]]);
  assert.deepEqual(chipCounts(25),[[5,4],[1,5]]);
  assert.ok(chipCounts(100).some(([value])=>value===5));
});

test('Chips in flight are capped and ordered from the largest value',()=>{
  assert.equal(chipColors(1234,6).length,6);
  assert.equal(chipColors(2).length,2);
  assert.deepEqual(chipColors(0),[]);
  const pile=chipPile(37,'mini');
  assert.match(pile,/class="chip-pile mini"/);
  assert.ok(pile.split('chip-stack').length-1<=4);
});

test('French cards are named in Italian',()=>{
  assert.equal(cardLabel('AS'),'Asso di picche');
  assert.equal(cardLabel('TH'),'Dieci di cuori');
  assert.match(cardFace('QD'),/suit-D/);
  assert.ok(isPoker('texas-holdem')&&isPoker('poker-italiano')&&!isPoker('scopa'));
});

test('The poker table shows bets, the pot and only the legal actions',()=>{
  const game={id:'texas-holdem',turn:0,result:null,last:{type:'raise',side:1,to:6},round:2,dealer:1,phase:'flop',board:['9S','QD','JH'],
    stacks:[90,94],bets:[0,6],contributions:[10,16],folded:[false,false],showdown:null,hand:['8H','KC'],handCounts:[2,2],pot:26,
    legal:{fold:true,call:6,minRaiseTo:12,maxRaiseTo:90}};
  const seats=[];
  const html=pokerTable({game,side:0,players:['Davide','Marta'],maxPlayers:2},{active:true,escape:text=>String(text),selected:new Set(),raiseTo:null,
    tableSeats:(g,custom)=>{seats.push(custom);return custom.spot({seat:1,occupied:true});}});
  assert.equal(seats[0].marker,1);
  assert.match(html,/data-pot/);
  assert.match(html,/<b>6<\/b>/);
  assert.match(html,/data-poker="call"/);
  assert.match(html,/data-poker="fold"/);
  assert.doesNotMatch(html,/data-poker="check"/);
  assert.match(html,/data-raise-set="90"/);
  assert.equal((html.match(/data-board-card/g)??[]).length,3);
  assert.match(html,/Marta punta a 6\./);
});
