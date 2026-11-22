import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// The ordinary suite is dependency-free. Opt in to measure text using a real
// browser, where grid intrinsic sizes, rich markup and loaded fonts apply.
test('Long names, turn banners and fleet controls stay inside their boxes', {
  skip:!process.env.TAVOLO_BROWSER_TEST, timeout:60000
},async t=>{
  const {chromium}=await import(process.env.TAVOLO_PLAYWRIGHT_MODULE||'playwright');
  const directory=await mkdtemp(join(tmpdir(),'tavolo-layout-'));
  const server=spawn(process.execPath,['dev.mjs'],{
    cwd:new URL('..',import.meta.url),windowsHide:true,
    env:{...process.env,PORT:'0',TAVOLO_ROOM_DIR:directory}
  });
  const exit=once(server,'exit');
  t.after(async()=>{server.kill();await exit;await rm(directory,{recursive:true,force:true});});
  const port=String((await once(server.stdout,'data'))[0]).match(/porta (\d+)/)[1];
  const origin='http://127.0.0.1:'+port;
  const browser=await chromium.launch({executablePath:process.env.TAVOLO_CHROME});
  t.after(()=>browser.close());
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
  await open('chess',true);
  await fits('.banner');
  await fits('.player');
  await open('naval',true);
  await fits('.fleet-row');
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
