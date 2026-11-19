import {closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {sessionLifetime} from './room.mjs';
import {profileLifetime} from './profiles.mjs';

// JSON files named by id, written atomically and pruned after `lifetime` without updates.
function localStore(directory,{length,lifetime,label}) {
  const valid=new RegExp('^[a-f0-9]{'+length+'}$');
  mkdirSync(directory,{recursive:true,mode:0o700});
  function file(code) {
    if(!valid.test(code))throw Error(label);
    return join(directory,code+'.json');
  }
  function read(code) {
    try {return JSON.parse(readFileSync(file(code),'utf8'));}
    catch(error) {if(error.code==='ENOENT')return undefined;throw error;}
  }
  function save(code,room) {
    const destination=file(code), temporary=destination+'.'+randomUUID()+'.tmp';
    try {
      const fd=openSync(temporary,'wx',0o600);
      try {
        writeFileSync(fd,JSON.stringify(room),'utf8');
        fsyncSync(fd);
      } finally {closeSync(fd);}
      renameSync(temporary,destination);
    } finally {rmSync(temporary,{force:true});}
  }
  function prune(now=Date.now()) {
    const expired=[];
    for(const name of readdirSync(directory)) {
      const code=new RegExp('^([a-f0-9]{'+length+'})\\.json$').exec(name)?.[1];
      if(code) {
        const room=read(code);
        if(room&&now-room.updatedAt>=lifetime) {
          rmSync(file(code),{force:true});
          expired.push(code);
        }
      } else if(new RegExp('^[a-f0-9]{'+length+'}\\.json\\.[a-f0-9-]{36}\\.tmp$').test(name)) {
        const path=join(directory,name);
        if(now-statSync(path).mtimeMs>=lifetime)rmSync(path,{force:true});
      }
    }
    return expired;
  }
  return {read,save,prune};
}
export const localRooms=directory=>localStore(directory,{length:24,lifetime:sessionLifetime,label:'Codice stanza non valido.'});
export const localProfiles=directory=>localStore(directory,{length:64,lifetime:profileLifetime,label:'Profilo non valido.'});
