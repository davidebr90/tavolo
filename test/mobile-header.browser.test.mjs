import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startRoomBrowser} from '../support/mobile-browser.mjs';

test('Mobile room commands and chat preserve the table position and keyboard focus',{
  skip:!process.env.TAVOLO_BROWSER_TEST,timeout:60000
},async t=>{
  const {origin,browser}=await startRoomBrowser(t);
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const room=randomBytes(12).toString('hex'),host=randomBytes(32).toString('hex'),guest=randomBytes(32).toString('hex');
  async function post(seat,operation,body) {
    const result=await fetch(origin+'/api/rooms/'+room+operation,{method:'POST',
      headers:{Authorization:'Bearer '+seat,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(result.status,200,await result.text());
  }
  await post(host,'',{game:'chess',name:'Davide',roomName:'W'.repeat(48)});
  await page.addInitScript(([room,seat])=>localStorage.setItem('tavolo:'+room,seat),[room,host]);
  await page.goto(origin+'/?stanza='+room);
  const menu=page.locator('#room-menu-toggle'), chat=page.locator('#chat-toggle');
  const board=page.locator('.room-layout');
  await board.waitFor();
  const start=(await board.boundingBox()).y;
  assert.ok(start<70);
  await menu.click();
  await chat.focus();
  await post(guest,'/join',{name:'Luna'});
  await page.waitForFunction(()=>!document.querySelector('[data-action=invite]'));
  assert.equal((await board.boundingBox()).y,start);
  assert.equal(await menu.getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'chat-toggle');
  await chat.click();
  const panel=page.locator('#chat-panel');
  await panel.waitFor();
  const box=await panel.boundingBox();
  assert.ok(box.y>=0&&box.y+box.height<=844);
  assert.equal(await page.evaluate(()=>document.querySelector('#tabpanel').inert),true);
  // A mobile pinch shrinks the visual viewport while leaving layout height unchanged.
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
  await page.waitForFunction(()=>{
    const view=visualViewport, send=document.querySelector('.chat-send').getBoundingClientRect();
    return view.height<innerHeight&&send.bottom<=view.offsetTop+view.height&&send.right<=view.offsetLeft+view.width;
  });
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
  await page.keyboard.press('Escape');
  await panel.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'room-menu-toggle');
  assert.equal(await page.evaluate(()=>document.body.style.getPropertyValue('--room-visible-bottom')),'');
  assert.equal((await board.boundingBox()).y,start);
  await page.setViewportSize({width:1440,height:900});
  await page.locator('.phase-header').waitFor();
  assert.equal(await menu.isVisible(),false);
});
