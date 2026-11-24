import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startRoomBrowser} from '../support/mobile-browser.mjs';

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
