import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChat,renderChatMessage} from '../public/chat-format.mjs';
import {create,join,chat,renameSeat,snapshot} from '../src/room.mjs';

test('Basic formatting applies only to selected portions and escapes HTML',()=>{
  const rich=parseChat('Ciao 😀 [b]solo [blue]questa[/blue][/b] <img src=x>');
  assert.equal(rich.text,'Ciao 😀 solo questa <img src=x>');
  assert.equal(rich.html,'Ciao 😀 <strong>solo <span class="chat-color-blue">questa</span></strong> &lt;img src=x&gt;');
  assert.equal(parseChat('[i]aperto').html,'[i]aperto');
  assert.equal(parseChat('[u]uno[/u] [s]due[/s] [i]tre[/i]').html,'<u>uno</u> <s>due</s> <em>tre</em>');
});
test('Messages from an older server render recognized tags without a format marker',()=>{
  assert.equal(renderChatMessage({text:'[b]assai[/b] [s]legge[/s] [blue]carne[/blue] 👏 <img>'}),
    '<strong>assai</strong> <s>legge</s> <span class="chat-color-blue">carne</span> 👏 &lt;img&gt;');
  assert.equal(renderChatMessage({text:'[blue]senza chiusura'}),'[blue]senza chiusura');
});
test('Changing nickname keeps the historical author and uses the new one for later chat',()=>{
  const room=create('tris','Ada','a');
  join(room,'Leo','b');
  room.chat=[{side:0,text:'Vecchio messaggio',at:1}];
  room.chatVersion=1;
  assert.throws(()=>renameSeat(room,'wrong','Altro'));
  renameSeat(room,'a','Ada 🎯','[b]Ada[/b] 🎯');
  chat(room,'a',{id:'a'.repeat(32),text:'[green]Ciao[/green]',format:'basic'});
  const view=snapshot(room,'b');
  assert.equal(view.players[0],'Ada 🎯');
  assert.equal(view.playerMarkup[0],'[b]Ada[/b] 🎯');
  assert.equal(view.chat[0].author,'Ada');
  assert.equal(view.chat[1].author,'Ada 🎯');
  assert.equal(view.chat[1].format,'basic');
});
