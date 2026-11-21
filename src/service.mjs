import { create, join, submit, snapshot, chat, renameSeat, playBot, spectator, sessionLifetime, advanceRoomClock } from './room.mjs';
import { parseChat } from '../public/chat-format.mjs';
import { version } from '../public/version.mjs';

export const route = /^\/api\/rooms\/([a-f0-9]{24})(?:\/(join|moves|live|events|chat|nickname|bot))?$/;
export const validToken = token => typeof token==='string' && /^[a-f0-9]{64}$/.test(token);
export const answer = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
// Client settings plus the release shown in the header. `updated` is when the core last changed.
export const settings = (transport,updated) => ({transport,version,updated:updated??null});
const nickname = value => {
  const name=typeof value==='string'?value.trim():'';
  if(!name || name.length>24) throw new Error('Inserisci un nickname da 1 a 24 caratteri.');
  return name;
};
function profile(data) {
  const value=data?.name;
  if(data?.format!=='basic')return {name:nickname(value)};
  if(typeof value!=='string'||value.length>240)throw Error('Nickname troppo lungo.');
  return {name:nickname(parseChat(value).text),markup:value.trim()};
}
export async function handle(request, operation, read, commit) {
  let data;
  if(request.method==='POST') {
    const body=await request.text();
    if(body.length>16000) return answer({error:'Richiesta troppo grande.'},413);
    try {data=JSON.parse(body);} catch {return answer({error:'Richiesta non valida.'},400);}
  }
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!validToken(token)) return answer({error:'Accesso alla stanza non valido.'},401);
  // All room operations after body parsing are synchronous, including persistence.
  const previous=read();
  if(previous?.updatedAt && Date.now()-previous.updatedAt>=sessionLifetime) return answer({error:'Stanza scaduta.'},404);
  // A read after a restart can arrive before the scheduled wake-up. Commit the
  // cover on its own so that a stale or invalid move cannot roll it back.
  if(advanceRoomClock(previous)) {
    try {commit(previous);}
    catch {return answer({error:'Salvataggio temporaneamente non disponibile. Riprova.'},503);}
  }
  let room=previous, changed=false;
  try {
    if(request.method==='POST' && !operation && !room) {
      const {name,markup}=profile(data);
      const roomName=typeof data?.roomName==='string'?data.roomName.trim():'';
      if(roomName.length>48)throw Error('Il nome della stanza può avere al massimo 48 caratteri.');
      room=create(data?.game,name,token,data?.options,markup,roomName||undefined);
      changed=true;
    } else if(!room) return answer({error:'Stanza non trovata.'},404);
    else if(request.method==='POST' && (operation==='join'||operation==='nickname')) {
      const {name,markup}=profile(data);
      changed=operation==='join'?join(room,name,token,markup):renameSeat(room,token,name,markup);
    }
    else if(request.method==='POST' && operation==='moves') changed=submit(room,token,data);
    else if(request.method==='POST' && operation==='chat') changed=chat(room,token,data);
    else if(request.method==='POST' && operation==='bot') changed=playBot(room,token,data);
    else if(!(!operation && ['GET','POST'].includes(request.method))) return answer({error:'Operazione non disponibile.'},405);
    // `?guarda` reads the room as a spectator: no seat is needed and nothing can be changed.
    const watching=request.method==='GET' && !operation && new URL(request.url).searchParams.has(spectator);
    const state=snapshot(room,watching?spectator:token);
    if(changed) {
      room.updatedAt=Date.now();
      try {commit(room);}
      catch {return answer({error:'Salvataggio temporaneamente non disponibile. Riprova.'},503);}
    }
    return answer(state);
  } catch(error) {
    return answer({error:error.message},409);
  }
}
