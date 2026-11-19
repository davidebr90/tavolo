import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChat,renderChatMessage,segmentsFromMarkup,markupFromSegments,formatRange,insertText,styleAt,visibleLength} from '../public/chat-format.mjs';
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

const roundTrip=markup=>markupFromSegments(segmentsFromMarkup(markup));
test('The visual editor model keeps text and styles through a round trip',()=>{
  const segments=segmentsFromMarkup('Ciao [b]solo [blue]questa[/blue][/b] [i]aperto');
  assert.deepEqual(segments,[
    {text:'Ciao ',style:{}},
    {text:'solo ',style:{b:true}},
    {text:'questa',style:{b:true,color:'blue'}},
    {text:' [i]aperto',style:{}}
  ]);
  assert.equal(visibleLength(segments),parseChat('Ciao [b]solo [blue]questa[/blue][/b] [i]aperto').text.length);
  for(const markup of ['[b]a[i]b[/i][/b]c','[red]x[/red][green]y[/green]','testo semplice','[u][s]due[/s][/u]'])
    assert.equal(parseChat(roundTrip(markup)).text,parseChat(markup).text);
  assert.deepEqual(segmentsFromMarkup(roundTrip('[b][red]x[/red][/b]')),segmentsFromMarkup('[b][red]x[/red][/b]'));
});
test('Formatting a selection that crosses existing tags produces valid markup',()=>{
  const segments=formatRange(segmentsFromMarkup('[b]abc[/b]def'),2,5,'i');
  const markup=markupFromSegments(segments);
  assert.equal(markup,'[b]ab[i]c[/i][/b][i]de[/i]f');
  assert.equal(parseChat(markup).html,'<strong>ab<em>c</em></strong><em>de</em>f');
  assert.equal(markupFromSegments(formatRange(segmentsFromMarkup('[b]abc[/b]'),0,3,'b')),'abc');
  assert.equal(markupFromSegments(formatRange(segmentsFromMarkup('ab[b]c[/b]'),0,3,'b')),'[b]abc[/b]');
});
test('Colours replace each other and the same colour toggles off',()=>{
  const red=formatRange(segmentsFromMarkup('ciao'),0,4,'color','red');
  assert.equal(markupFromSegments(red),'[red]ciao[/red]');
  assert.equal(markupFromSegments(formatRange(red,0,2,'color','blue')),'[blue]ci[/blue][red]ao[/red]');
  assert.equal(markupFromSegments(formatRange(red,0,4,'color','red')),'ciao');
  assert.equal(markupFromSegments(formatRange(red,0,4,'color',null)),'ciao');
});
test('Typing styles and caret styles follow the surrounding text',()=>{
  const segments=segmentsFromMarkup('ab[b]cd[/b]');
  assert.deepEqual(styleAt(segments,0),{});
  assert.deepEqual(styleAt(segments,3),{b:true});
  assert.deepEqual(styleAt(segments,2),{});
  assert.equal(markupFromSegments(insertText(segments,2,'X',{i:true})),'ab[i]X[/i][b]cd[/b]');
  assert.equal(markupFromSegments(insertText(segments,4,'!',{b:true})),'ab[b]cd![/b]');
});
