import {closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {sessionLifetime} from './room.mjs';

const roomCode=/^[a-f0-9]{24}$/;
export function localRooms(directory) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  function file(code) {
    if(!roomCode.test(code))throw Error('Codice stanza non valido.');
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
      const code=/^([a-f0-9]{24})\.json$/.exec(name)?.[1];
      if(code) {
        const room=read(code);
        if(room&&now-room.updatedAt>=sessionLifetime) {
          rmSync(file(code),{force:true});
          expired.push(code);
        }
      } else if(/^[a-f0-9]{24}\.json\.[a-f0-9-]{36}\.tmp$/.test(name)) {
        const path=join(directory,name);
        if(now-statSync(path).mtimeMs>=sessionLifetime)rmSync(path,{force:true});
      }
    }
    return expired;
  }
  return {read,save,prune};
}
