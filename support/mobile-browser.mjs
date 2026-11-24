import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// Each browser test gets a private room store and a free loopback port.
export async function startRoomBrowser(t) {
  const {chromium}=await import(process.env.TAVOLO_PLAYWRIGHT_MODULE||'playwright');
  const directory=await mkdtemp(join(tmpdir(),'tavolo-browser-'));
  const server=spawn(process.execPath,['dev.mjs'],{cwd:new URL('..',import.meta.url),windowsHide:true,
    env:{...process.env,PORT:'0',TAVOLO_ROOM_DIR:directory}});
  const exit=once(server,'exit');
  let browser;
  t.after(async()=>{
    try{await browser?.close();}
    finally{server.kill();await exit;await rm(directory,{recursive:true,force:true});}
  });
  const origin='http://127.0.0.1:'+String((await once(server.stdout,'data'))[0]).match(/porta (\d+)/)[1];
  browser=await chromium.launch({executablePath:process.env.TAVOLO_CHROME});
  return {origin,browser};
}
