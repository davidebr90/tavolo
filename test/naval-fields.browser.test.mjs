import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startRoomBrowser} from '../support/mobile-browser.mjs';

test('Naval mobile keeps the chosen sea across shots, swipes and rotation',{
  skip:!process.env.TAVOLO_BROWSER_TEST,timeout:60000
},async t=>{
  const {origin,browser}=await startRoomBrowser(t);
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const room=randomBytes(12).toString('hex'),host=randomBytes(32).toString('hex'),guest=randomBytes(32).toString('hex');
  async function api(seat,path='',body){
    const response=await fetch(origin+'/api/rooms/'+room+path,{method:body?'POST':'GET',
      headers:{Authorization:'Bearer '+seat,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
    assert.equal(response.status,200);return response.json();
  }
  async function move(action){
    const {version}=await api(guest);
    return api(guest,'/moves',{id:randomBytes(8).toString('hex'),version,action});
  }
  await api(host,'',{game:'naval',name:'Davide'});await api(guest,'/join',{name:'Elena'});
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.addInitScript(([room,seat])=>localStorage.setItem('tavolo:'+room,seat),[room,host]);
  await page.goto(origin+'/?stanza='+room);
  const confirm=page.locator('[data-action="fleet"]');
  const initial=await confirm.boundingBox();
  await page.locator('[data-action="random"]').click();
  assert.equal((await confirm.boundingBox()).y,initial.y);
  await confirm.click();
  await page.locator('.fleet-command').getByRole('status').filter({hasText:'Flotta confermata'}).waitFor();
  await move({ships:[0,10,20,30,40].map(at=>({at,vertical:false}))});
  const target=page.locator('[data-action="target"]'),own=page.locator('[data-action="own-fleet"]');
  await target.waitFor();
  assert.equal(await target.getAttribute('aria-pressed'),'true');
  const track=page.locator('.navy-battle');
  const box=await track.boundingBox();
  assert.ok(box.width>320&&box.y+box.height<=844,JSON.stringify(box));
  const cdp=await ctx.newCDPSession(page), y=box.y+box.height/2;
  const touch=(type,x)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x===null?[]:[{x,y}]});
  await touch('touchStart',box.x+box.width*.82);
  for(const part of [.72,.58,.44,.30,.17])await touch('touchMove',box.x+box.width*part);
  await touch('touchEnd',null);
  await page.waitForFunction(()=>{
    const track=document.querySelector('.navy-battle');return Math.abs(track.scrollLeft-track.clientWidth)<2;
  });
  assert.equal(await own.getAttribute('aria-pressed'),'true');
  assert.equal((await api(host)).game.outgoing.length,0);
  await own.focus();await own.press('Home');
  assert.equal(await target.getAttribute('aria-pressed'),'true');
  await page.locator('.target-grid [data-naval="99"]').tap();
  await page.locator('.target-grid [data-naval="99"].miss').waitFor();
  await move({at:98});
  await page.locator('.own-grid [data-naval="98"]:is(.hit,.miss)').waitFor({state:'attached'});
  assert.equal(await target.getAttribute('aria-pressed'),'true');
  await page.locator('.target-grid [data-naval="98"]').tap();
  await page.locator('.target-grid [data-naval="98"].miss').waitFor();
  await own.focus();await own.press('Enter');
  await move({at:97});
  await page.locator('.own-grid [data-naval="97"]:is(.hit,.miss)').waitFor();
  assert.ok(await own.evaluate(b=>b===document.activeElement));
  assert.equal(await own.getAttribute('aria-pressed'),'true');
  assert.equal((await track.boundingBox()).y,box.y);
  await page.setViewportSize({width:1200,height:850});
  await page.waitForFunction(()=>!document.querySelector('.target-grid').inert&&!document.querySelector('.own-grid').inert);
  const left=await page.locator('.target-grid').boundingBox(),right=await page.locator('.own-grid').boundingBox();
  assert.ok(right.x>=left.x+left.width&&right.y===left.y);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('.target-grid').inert);
  const spectator=await browser.newPage({viewport:{width:360,height:740},reducedMotion:'reduce'});
  await spectator.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await spectator.goto(origin+'/?stanza='+room+'&guarda');
  await spectator.getByRole('button',{name:'Mare di Davide'}).click();
  assert.equal(await spectator.locator('.own-grid').evaluate(el=>el.inert),false);
  assert.equal(await spectator.locator('.navy-battle .cell:enabled,.navy-battle .hull').count(),0);
  assert.deepEqual(errors,[]);
});
