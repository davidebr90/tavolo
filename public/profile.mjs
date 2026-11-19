// Personal profile, client side: the link format and how local seats meet the server copy.
// Pure functions; storage and network calls live in app.mjs.

const keyPattern=/^[a-f0-9]{64}$/;
export const validKey=key=>typeof key==='string'&&keyPattern.test(key);

// The key travels in the fragment, which browsers never send to the server.
export const profileLink=(origin,key)=>origin+'/#profilo='+key;
export const maskedLink=(origin,key)=>origin+'/#profilo='+key.slice(0,4)+'…'+key.slice(-4);

// Accepts a full personal link, a bare fragment or the key itself.
export function keyFromText(text) {
  const value=String(text??'').trim();
  if(keyPattern.test(value))return value;
  return /(?:^|[#?&])profilo=([a-f0-9]{64})(?![a-f0-9])/.exec(value)?.[1]??null;
}

// The server copy wins for rooms it knows, rooms removed on another device are dropped here,
// and rooms only this device knows are uploaded.
export function mergeSeats(local,remote) {
  const removed=new Set(remote?.removed??[]);
  const known=new Map((remote?.seats??[]).map(seat=>[seat.code,seat.token]));
  const mine=new Map(local.map(seat=>[seat.code,seat.token]));
  return {
    download:[...known].filter(([code,token])=>mine.get(code)!==token).map(([code,token])=>({code,token})),
    upload:local.filter(seat=>!known.has(seat.code)&&!removed.has(seat.code)),
    drop:local.filter(seat=>removed.has(seat.code)&&!known.has(seat.code)).map(seat=>seat.code)
  };
}

// A stable colour for a profile in lists and avatars.
export const profileHue=key=>parseInt(key.slice(0,2),16)%10;
