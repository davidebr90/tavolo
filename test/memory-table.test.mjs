import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryTable } from '../public/memory-table.mjs';

const figures=[{id:'airone',name:'Airone azzurro'},{id:'pulcinella',name:'Pulcinella di mare'}];
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const room=()=>({
  side:0,maxPlayers:2,players:['Ada','Leo'],
  game:{id:'memory',phase:'first',turn:0,result:null,winners:[],scores:[0,0],last:null,
    cards:Array.from({length:24},()=>({state:'down'}))}
});
const render=(s,options)=>memoryTable(s,{active:true,escape,figures,...options});

test('A face-down Memory tile has only its position and never a bird label or image',()=>{
  const s=room();
  s.game.cards[0].picture=1;
  const html=render(s);
  assert.equal((html.match(/data-memory="/g)||[]).length,24);
  assert.doesNotMatch(html,/\/memory\/|<img|Airone azzurro|Pulcinella di mare/);
  assert.match(html,/Carta 24, coperta/);
  assert.equal((html.match(/aria-disabled="false"/g)||[]).length,24);
});

test('Only public Memory pictures appear; matched cards remain visible but cannot be flipped',()=>{
  const s=room();
  s.game.phase='second';
  s.game.cards[0]={state:'matched',picture:0};
  s.game.cards[5]={state:'matched',picture:0};
  s.game.cards[2]={state:'up',picture:1};
  s.game.scores=[1,0];
  const html=render(s,{cardHints:true});
  assert.equal((html.match(/src="\/memory\/airone.webp"/g)||[]).length,2);
  assert.equal((html.match(/src="\/memory\/pulcinella.webp"/g)||[]).length,1);
  assert.equal((html.match(/aria-disabled="true"/g)||[]).length,3);
  assert.match(html,/Carta 1, Airone azzurro, coppia trovata/);
  assert.match(html,/Carta 3, Pulcinella di mare/);
});

test('Comparison, spectators, waiting rooms and finished games cannot dispatch tile choices',()=>{
  for(const type of ['compare','spectator','waiting','complete','closed','inactive']) {
    const s=room();
    if(type==='compare'||type==='complete')s.game.phase=type;
    if(type==='waiting')s.players.pop();
    if(type==='closed')s.closed=true;
    if(type==='spectator')s.spectator=true;
    const html=render(s,{active:type!=='inactive'});
    assert.equal((html.match(/aria-disabled="false"/g)||[]).length,0,type);
    assert.equal((html.match(/tabindex="0"/g)||[]).length,1,type);
  }
});
