// Release number shown next to the logo. Bump it with every published change.
// The core update time is not stored here: the server reports it through /api/config.
export const version='2.6.0';

// Accepts ISO strings and epoch values in seconds or milliseconds.
export function updatedAt(value) {
  if(typeof value==='number'&&Number.isFinite(value)&&value>0) {
    const date=new Date(value<1e12?value*1000:value);
    return Number.isFinite(date.getTime())?date:null;
  }
  if(typeof value!=='string'||!value.trim())return null;
  // Cloudflare sends microseconds; some browsers only parse milliseconds.
  const date=new Date(value.trim().replace(/(\.\d{3})\d+/,'$1'));
  return Number.isFinite(date.getTime())?date:null;
}
