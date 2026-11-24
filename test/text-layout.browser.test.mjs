import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {startRoomBrowser} from '../support/mobile-browser.mjs';

// The ordinary suite is dependency-free. Opt in to measure text using a real
// browser, where grid intrinsic sizes, rich markup and loaded fonts apply.
test('Long names, turn banners and fleet controls stay inside their boxes', {
  skip:!process.env.TAVOLO_BROWSER_TEST, timeout:60000
},async t=>{
  const {origin,browser}=await startRoomBrowser(t);
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const host=randomBytes(32).toString('hex'), guest=randomBytes(32).toString('hex');
  async function post(code,seat,operation,body){
    const response=await fetch(origin+'/api/rooms/'+code+operation,{method:'POST',
      headers:{Authorization:'Bearer '+seat,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(response.status,200,await response.text());
  }
  async function open(game,joinGame){
    const code=randomBytes(12).toString('hex');
    await post(code,host,'',{game,format:'basic',name:joinGame?'[b]'+'W'.repeat(24)+'[/b]':'Davide 😎 [red]paxxo[/red]',
      roomName:'W'.repeat(48),options:{players:2}});
    if(joinGame)await post(code,guest,'/join',{name:'M'.repeat(24)});
    await page.goto(origin);
    await page.evaluate(({code,seat})=>localStorage.setItem('tavolo:'+code,seat),{code,seat:joinGame?guest:host});
    await page.goto(origin+'/?stanza='+code);
    await page.locator('.room-layout').waitFor();
    return code;
  }
  async function fits(selector){
    const elements=page.locator(selector);
    await elements.first().waitFor();
    const escaped=await elements.evaluateAll(list=>list.flatMap(box=>{
      const frame=box.getBoundingClientRect(), walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);
      for(let text=walker.nextNode();text;text=walker.nextNode()){
        if(!text.textContent.trim()||text.parentElement.closest('svg,.sr-only'))continue;
        const range=document.createRange();range.selectNodeContents(text);
        if([...range.getClientRects()].some(r=>r.width&&(r.left<frame.left-2||r.right>frame.right+2)))return [text.textContent];
      }
      return [];
    }));
    assert.deepEqual(escaped,[],selector);
  }
  await open('scopa',false);
  for(const width of [320,1440]){
    await page.setViewportSize({width,height:850});
    await fits('.seat.me .seat-plate');
  }
  await page.setViewportSize({width:320,height:850});
  const chess=await open('chess',true);
  await fits('.banner');
  await fits('.player');
  await t.test('The mobile chessboard and its controls keep their position across both players’ moves',async()=>{
    await page.setViewportSize({width:320,height:568});
    const board=page.locator('.chess-frame'), cancel=page.locator('[data-action="cancel"]');
    const first=await board.boundingBox(), action=await cancel.boundingBox();
    assert.ok(first.y>=0&&action.y+action.height<=568,'board and controls fit');
    const snapshot=await (await fetch(origin+'/api/rooms/'+chess,{headers:{Authorization:'Bearer '+host}})).json();
    await post(chess,host,'/moves',{version:snapshot.version,id:'mobile-e4',action:{from:52,to:36}});
    await page.waitForFunction(()=>document.querySelector('.banner.green')?.textContent.includes('Tocca a te'));
    await page.locator('[data-cell="12"]').click();
    assert.equal(await cancel.isEnabled(),true);
    assert.ok(Math.abs((await board.boundingBox()).y-first.y)<=1,'opponent move preserved the board');
    assert.ok(Math.abs((await cancel.boundingBox()).y-action.y)<=1,'selection preserved the action');
    await page.locator('[data-cell="28"]').click();
    await page.locator('.banner.red').waitFor();
    assert.ok(Math.abs((await board.boundingBox()).y-first.y)<=1,'own move preserved the board');
    assert.equal(await page.evaluate(()=>scrollY),0);
    const current=await (await fetch(origin+'/api/rooms/'+chess,{headers:{Authorization:'Bearer '+host}})).json();
    await post(chess,host,'/moves',{version:current.version,id:'mobile-close',action:{close:'request'}});
    const accept=page.locator('[data-action="accept-close"]');
    await accept.waitFor();
    assert.ok(Math.abs((await board.boundingBox()).y-first.y)<=1,'incoming requests preserve the board');
    const response=await accept.boundingBox();
    assert.ok(response.y>=0&&response.y+response.height<=568,'the request can be answered without scrolling');
  });
  await open('naval',true);
  await fits('.fleet-actions button');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
  await page.setViewportSize({width:1440,height:850});
  await open('poker-italiano',true);
  await page.setViewportSize({width:320,height:850});
  // A nonzero global transition-duration also animates widths on plain grid
  // elements. In reduced motion the seats must use the new width immediately.
  assert.equal(await page.locator('.table-seats').evaluate(el=>getComputedStyle(el).transitionProperty),'none');
  await fits('.seat.on-axis .seat-plate');
  const seat=page.locator('[data-seat-info="1"]');
  await seat.focus();
  await page.keyboard.press('Enter');
  const title=page.locator('#seat-details-title');
  await title.waitFor();
  assert.equal(await title.textContent(),'M'.repeat(24));
  await page.keyboard.press('Escape');
  await title.waitFor({state:'hidden'});
  assert.ok(await seat.evaluate(el=>el===document.activeElement));
});
