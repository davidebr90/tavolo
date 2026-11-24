import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startRoomBrowser} from '../support/mobile-browser.mjs';
import {create,join} from '../src/room.mjs';
import {localRooms} from '../src/local-rooms.mjs';

test('Completing a Briscola trick keeps the hand in place when the result appears', {
  skip:!process.env.TAVOLO_BROWSER_TEST,timeout:60000
},async t=>{
  const {origin,browser,directory}=await startRoomBrowser(t);
  const code=randomBytes(12).toString('hex'), tokens=Array.from({length:2},()=>randomBytes(32).toString('hex'));
  const room=create('briscola','Davide',tokens[0],{players:2});
  join(room,'Amica',tokens[1]);
  localRooms(directory).save(code,room);
  const page=await browser.newPage({viewport:{width:360,height:640},hasTouch:true,reducedMotion:'reduce'});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const side=room.game.turn;
  await page.goto(origin);
  await page.evaluate(({code,token})=>localStorage.setItem('tavolo:'+code,token),{code,token:tokens[side]});
  await page.goto(origin+'/?stanza='+code);
  const card=page.locator('.hand [data-hand]:enabled').first();
  await card.waitFor();
  const handTop=()=>page.evaluate(()=>Math.round(document.querySelector('.hand').getBoundingClientRect().y));
  const first=await handTop();
  await card.tap();
  await page.locator('.card-center .caption-card').first().waitFor();
  assert.equal(await handTop(),first);
  const endpoint=origin+'/api/rooms/'+code;
  const headers={Authorization:'Bearer '+tokens[1-side],'Content-Type':'application/json'};
  const opponent=await (await fetch(endpoint,{headers})).json();
  const reply=await fetch(endpoint+'/moves',{method:'POST',headers,body:JSON.stringify({
    version:opponent.version,id:randomBytes(16).toString('hex'),action:{card:opponent.game.hand[0]}
  })});
  assert.equal(reply.status,200);
  await page.locator('.briscola-outcome').waitFor();
  assert.equal(await handTop(),first);
  assert.equal(await page.evaluate(()=>scrollY),0);
});

test('Drawing a playable UNO card changes Pesca to Passa in the same mobile action slot', {
  skip:!process.env.TAVOLO_BROWSER_TEST,timeout:60000
},async t=>{
  const {origin,browser,directory}=await startRoomBrowser(t);
  const code=randomBytes(12).toString('hex'), token=randomBytes(32).toString('hex');
  const room=create('uno','Davide',token,{players:2});
  join(room,'Amica',randomBytes(32).toString('hex'));
  // Keep the real deck and hands. Put a matching card on top so the draw always
  // exposes the choice between playing and passing, independent of the shuffle.
  const {deck,color}=room.game;
  const index=deck.findIndex(card=>card.startsWith(color+':'));
  assert.ok(index>=0);
  deck.push(deck.splice(index,1)[0]);
  localRooms(directory).save(code,room);
  const page=await browser.newPage({viewport:{width:360,height:640},hasTouch:true,reducedMotion:'reduce'});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin);
  await page.evaluate(({code,token})=>localStorage.setItem('tavolo:'+code,token),{code,token});
  await page.goto(origin+'/?stanza='+code);
  const hand=page.locator('.hand'), draw=page.locator('.card-moves [data-action=uno-draw]');
  await draw.waitFor();
  const first=await draw.boundingBox(), handTop=(await hand.boundingBox()).y;
  await draw.tap();
  const pass=page.locator('.card-moves [data-action=uno-pass]');
  await pass.waitFor();
  const after=await pass.boundingBox();
  assert.ok(await page.locator('.uno-draw-choice').isVisible());
  assert.equal(await page.locator('.turn-note').isVisible(),false);
  for(const key of ['x','y','width','height'])assert.equal(Math.round(after[key]),Math.round(first[key]),key);
  assert.equal(Math.round((await hand.boundingBox()).y),Math.round(handTop));
  await pass.tap();
  await pass.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>scrollY),0);
});

test('A phone player can raise, return to the hand, and keep the same controls in view', {
  skip:!process.env.TAVOLO_BROWSER_TEST,timeout:60000
},async t=>{
  const {origin,browser}=await startRoomBrowser(t);
  const code=randomBytes(12).toString('hex'), endpoint=origin+'/api/rooms/'+code;
  const tokens=Array.from({length:10},()=>randomBytes(32).toString('hex'));
  async function post(seat,path,body){
    const response=await fetch(endpoint+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[seat],
      'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(response.status,200);
    return response.json();
  }
  let room=await post(0,'',{game:'texas-holdem',name:'Primo',options:{players:tokens.length}});
  for(let seat=1;seat<tokens.length;seat++)room=await post(seat,'/join',{name:'Giocatore '+seat});
  const side=room.game.turn;
  const page=await browser.newPage({viewport:{width:360,height:640},hasTouch:true,reducedMotion:'reduce'});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin);
  await page.evaluate(({code,token})=>localStorage.setItem('tavolo:'+code,token),{code,token:tokens[side]});
  await page.goto(origin+'/?stanza='+code);
  const wager=page.locator('[data-action="choose-bet"]'), strip=page.locator('.poker-controls');
  await wager.waitFor();
  const first=await strip.boundingBox();
  assert.ok(first.y>=0&&first.y+first.height<=640);
  assert.equal(await page.locator('.table-seats>li').first().getAttribute('data-other'),String(side));
  await wager.tap();
  const form=page.locator('dialog .poker-raise');
  await form.waitFor();
  // Incoming chat can replace the game markup while a player is setting a bet.
  await post((side+1)%tokens.length,'/chat',{id:randomBytes(16).toString('hex'),text:'Ci sono'});
  await page.keyboard.press('Escape');
  await form.waitFor({state:'hidden'});
  assert.ok(await wager.evaluate(button=>button===document.activeElement));
  await wager.tap();
  await form.locator('[data-raise-set]').first().tap();
  const amount=Number(await form.locator('input').inputValue());
  await form.locator('button:not([type=button])').tap();
  await wager.waitFor({state:'hidden'});
  const snapshot=await (await fetch(endpoint,{headers:{Authorization:'Bearer '+tokens[side]}})).json();
  assert.equal(snapshot.game.last.type,'raise');
  assert.equal(snapshot.game.last.to,amount);
  const next=await strip.boundingBox();
  assert.equal(Math.round(first.height),Math.round(next.height));
  assert.equal(Math.round(first.y),Math.round(next.y));
  assert.equal(await page.evaluate(()=>scrollY),0);
});
