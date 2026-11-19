// Profiles: a passwordless identity that collects a player's seats across devices.
// The client keeps a random 64-hex key; the server stores the profile under sha256(key),
// so whoever holds the key (the personal link) gets the seats back, and nobody else can reach it.
import { answer, validToken } from './service.mjs';

export const profileLifetime=90*24*60*60*1000;
export const maxSeats=300;
const roomCode=/^[a-f0-9]{24}$/;
export const validProfileKey=validToken;

export async function profileId(key) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('tavolo-profile:'+key));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

const label=value=>{
  if(typeof value!=='string')throw Error('Nome del profilo non valido.');
  const text=value.replace(/[\u0000-\u001f\u007f]/g,'').trim();
  if(text.length>40)throw Error('Il nome del profilo può avere al massimo 40 caratteri.');
  return text;
};

export function emptyProfile(id,now) {
  return {id,name:'',nickname:null,seats:[],removed:[],createdAt:now,updatedAt:now};
}

// Applies {name, nickname, add:[{code,token}], remove:[code]} and returns a new profile.
export function applyProfile(profile,data,now) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Richiesta non valida.');
  const next=structuredClone(profile);
  if(data.name!==undefined)next.name=label(data.name);
  if(data.nickname!==undefined) {
    if(data.nickname!==null&&(typeof data.nickname!=='string'||data.nickname.length>240))throw Error('Nickname non valido.');
    next.nickname=data.nickname;
  }
  const add=data.add??[], remove=data.remove??[];
  if(!Array.isArray(add)||!Array.isArray(remove)||add.length>maxSeats||remove.length>maxSeats)throw Error('Elenco delle stanze non valido.');
  for(const seat of add) {
    if(!roomCode.test(seat?.code)||!validToken(seat?.token))throw Error('Stanza non valida.');
    next.removed=next.removed.filter(entry=>entry.code!==seat.code);
    const known=next.seats.find(entry=>entry.code===seat.code);
    if(known)known.token=seat.token;
    else next.seats.push({code:seat.code,token:seat.token,addedAt:now});
  }
  for(const code of remove) {
    if(!roomCode.test(code))throw Error('Stanza non valida.');
    next.seats=next.seats.filter(entry=>entry.code!==code);
    if(!next.removed.some(entry=>entry.code===code))next.removed.push({code,at:now});
  }
  next.seats=next.seats.slice(-maxSeats);
  next.removed=next.removed.slice(-maxSeats);
  next.updatedAt=now;
  return next;
}

export const profileView=p=>({name:p.name,nickname:p.nickname,seats:p.seats.map(({code,token})=>({code,token})),removed:p.removed.map(entry=>entry.code),createdAt:p.createdAt,updatedAt:p.updatedAt});

// store: {read(id), save(id, profile)}. GET reads (and keeps the profile alive), POST creates or updates.
export async function handleProfile(request,store,now=Date.now()) {
  const key=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!validProfileKey(key))return answer({error:'Profilo non valido.'},401);
  const id=await profileId(key);
  let data;
  if(request.method==='POST') {
    const body=await request.text();
    if(body.length>64000)return answer({error:'Richiesta troppo grande.'},413);
    try {data=JSON.parse(body);} catch {return answer({error:'Richiesta non valida.'},400);}
  } else if(request.method!=='GET')return answer({error:'Operazione non disponibile.'},405);
  let stored=store.read(id);
  if(stored&&(stored.id!==id||now-stored.updatedAt>=profileLifetime))stored=undefined;
  if(request.method==='GET') {
    if(!stored)return answer({error:'Profilo non trovato o scaduto.'},404);
    // Refresh the expiry at most once an hour to keep reads cheap.
    if(now-stored.updatedAt>3600000) {
      stored={...stored,updatedAt:now};
      try {store.save(id,stored);} catch {}
    }
    return answer(profileView(stored));
  }
  let next;
  try {next=applyProfile(stored??emptyProfile(id,now),data,now);}
  catch(error) {return answer({error:error.message},409);}
  try {store.save(id,next);}
  catch {return answer({error:'Salvataggio temporaneamente non disponibile. Riprova.'},503);}
  return answer(profileView(next));
}
