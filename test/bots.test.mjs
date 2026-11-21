import test from 'node:test';
import assert from 'node:assert/strict';
import {start,play,view,fleet} from '../src/games.mjs';
import {botAction,anyAction,botName,holdemStrength} from '../src/bots.mjs';
import {create,join,submit,snapshot,playBot,botTurn,spectator} from '../src/room.mjs';

const human='a'.repeat(64), guest='b'.repeat(64);
const actor=g=>g.id==='naval'&&!g.fleets.every(Boolean)?g.fleets.findIndex(f=>!f):g.turn;
const setups=[['tris'],['four'],['reversi'],['dama'],['chess'],['nim'],['dots'],['go'],['backgammon'],['naval',{size:8,ships:3}],
  ['scopa',{players:2}],['scopa',{players:4}],['briscola',{players:2}],['briscola',{players:4}],['uno',{players:3}],
  ['poker-italiano',{players:3}],['texas-holdem',{players:4}]];

test('The computer only ever plays legal moves, at every level and in every game',()=>{
  for(const [id,options] of setups) for(const mode of [{level:0},{level:1},{level:1,quick:true},{level:2}]) {
    let game=start(id,options);
    // Slow thinkers get a short game: legality is what is checked here.
    const limit=mode.level===2&&['chess','four','dama'].includes(id)?14:id==='chess'?40:160;
    for(let moves=0;game.result===null&&moves<limit;moves++) {
      const side=actor(game);
      game=play(game,botAction(game,side,mode),side);
    }
  }
});

test('The fallback action is legal in every game',()=>{
  for(const [id,options] of setups) {
    let game=start(id,options);
    for(let moves=0;game.result===null&&moves<60;moves++) {
      const side=actor(game);
      game=play(game,anyAction(game,side),side);
    }
  }
});

test('Tris: the computer takes a win and blocks a threat',()=>{
  const game=start('tris');
  game.board=[1,1,0, 2,2,0, 0,0,0];
  assert.deepEqual(botAction(game,0,{level:2}),{at:2});
  game.turn=1;
  assert.deepEqual(botAction(game,1,{level:2}),{at:5});
  game.board=[1,1,0, 0,2,0, 0,0,0];
  assert.deepEqual(botAction(game,1,{level:2}),{at:2});
});

test('Forza 4: the computer completes four in a row and stops the opponent',()=>{
  const game=start('four');
  for(const at of [35,36,37])game.board[at]=1;
  for(const at of [28,29,30])game.board[at]=2;
  assert.ok([{at:3},{at:6}].some(move=>move.at===botAction(game,0,{level:1}).at));
  game.turn=1;
  game.board[30]=0;
  const reply=botAction(game,1,{level:1}).at;
  assert.ok(reply===3||reply===6);
});

test('Nim: on the hard level the computer leaves a zero nim-sum',()=>{
  const game=start('nim');
  game.piles=[1,3,5,6];
  const {pile,count}=botAction(game,0,{level:2});
  const piles=game.piles.slice();
  piles[pile]-=count;
  assert.equal(piles.reduce((a,b)=>a^b,0),0);
});

test('Scacchi: the computer mates in one and takes a free queen',()=>{
  const game=start('chess');
  const put=layout=>{game.board=Array(64).fill('');for(const [at,piece] of Object.entries(layout))game.board[at]=piece;game.rights=0;};
  // White: Kg6 and Rb1 against Kg8. Rb8 is mate.
  put({6:'k',22:'K',57:'R'});
  assert.deepEqual(botAction(game,0,{level:1}),{from:57,to:1});
  put({4:'k',60:'K',35:'Q',27:'q',0:'r'});
  const capture=botAction(game,0,{level:1});
  assert.deepEqual(capture,{from:35,to:27});
});

test('Punti e quadrati: the computer closes a box that has three sides',()=>{
  const game=start('dots');
  for(const edge of [0,3,12])game.edges[edge]=1;
  assert.deepEqual(botAction(game,0,{level:1}),{edge:13});
});

test('Battaglia navale: after a hit the computer fires next to it',()=>{
  let game=start('naval',{size:8,ships:3});
  game=play(game,{ships:fleet(8,game.lengths)},0);
  game=play(game,{ships:[{at:27,vertical:false},{at:0,vertical:false},{at:63,vertical:false}]},1);
  game=play(game,{at:28},0);
  game.turn=0;
  assert.equal(game.shots[0][0].hit,true);
  assert.ok([27,29,20,36].includes(botAction(game,0,{level:2}).at));
});

test('Scopa: the computer sweeps the table when it can',()=>{
  const game=start('scopa',{players:2});
  game.table=[2,14];
  game.hands[0]=[7,21,35];
  // 3 and 5 on the table: the eight takes both and leaves it empty.
  assert.deepEqual(botAction(game,0,{level:2}),{card:7,take:[2,14]});
});

test('Briscola: the last player wins a rich trick with the cheapest card that takes it',()=>{
  const game=start('briscola',{players:2});
  game.trumpCard=39;
  game.turn=1;
  game.trick=[{side:0,card:0}];
  game.hands[1]=[2,31,15];
  // An ace of denari is led: the low trump takes eleven points, the three would add ten to the loss.
  assert.deepEqual(botAction(game,1,{level:2}),{card:31});
});

test('UNO: the computer draws when it has nothing to play, then passes or plays the drawn card',()=>{
  const game=start('uno',{players:2});
  game.discard=['R:5:0'];
  game.color='R';
  game.hands[0]=['B:7:0','G:2:0'];
  assert.deepEqual(botAction(game,0,{level:1}),{draw:true});
  game.hands[0].push('Y:9:0');
  game.drawn='Y:9:0';
  assert.deepEqual(botAction(game,0,{level:1}),{pass:true});
  game.hands[0]=['B:7:0','R:9:0'];
  game.drawn=null;
  assert.deepEqual(botAction(game,0,{level:1}),{card:'R:9:0'});
});

test('Poker: hands are ranked in the right order',()=>{
  const order=[
    ['AS','KD','9H','7C','4S','3D','2H'],['AS','AD','9H','7C','4S','3D','2H'],['AS','AD','9H','9C','4S','3D','2H'],
    ['AS','AD','AH','7C','4S','3D','2H'],['5S','4D','3H','2C','AS','KD','9H'],['AS','KS','9S','7S','4S','3D','2H'],
    ['AS','AD','AH','7C','7S','3D','2H'],['AS','AD','AH','AC','7S','3D','2H'],['9S','8S','7S','6S','5S','3D','2H']
  ].map(holdemStrength);
  for(let i=1;i<order.length;i++)assert.ok(order[i]>order[i-1],'hand '+i);
  assert.ok(holdemStrength(['AS','AD','KH','QC','JS'])>holdemStrength(['AS','AD','KH','QC','TS']));
});

test('Poker: the computer answers every phase with an action the table accepts',()=>{
  for(const id of ['texas-holdem','poker-italiano']) {
    let game=start(id,{players:3}), hands=0;
    for(let moves=0;game.result===null&&hands<4&&moves<400;moves++) {
      const legal=view(game,game.turn).legal;
      if(legal.next)hands++;
      game=play(game,botAction(game,game.turn,{level:1}),game.turn);
    }
    // A table can also end at the first showdown, when everybody went all-in.
    assert.ok(hands>=1||game.result!==null,id);
  }
});

test('A room against the computer is full at once and the computer moves when asked',()=>{
  const room=create('four','Anna',human,{bots:1,level:2});
  assert.deepEqual(room.players.map(p=>p.name),['Anna','Computer']);
  assert.equal(room.level,2);
  let state=snapshot(room,human);
  assert.deepEqual(state.bots,[false,true]);
  assert.equal(state.botTurn,-1);
  assert.equal(playBot(room,human,{version:room.version}),false,'not the computer\'s turn');
  submit(room,human,{id:'m1',version:room.version,action:{at:3}});
  assert.equal(snapshot(room,human).botTurn,1);
  assert.equal(playBot(room,human,{version:room.version-1}),false,'stale request');
  assert.throws(()=>playBot(room,guest,{version:room.version}),/Accesso/);
  assert.equal(playBot(room,human,{version:room.version}),true);
  state=snapshot(room,human);
  assert.equal(state.game.turn,0);
  assert.equal(state.game.board.filter(Boolean).length,2);
  assert.throws(()=>join(room,'Bruno',guest),/completo/);
});

test('Computer seats are validated and named',()=>{
  assert.throws(()=>create('chess','Anna',human,{bots:2}),/computer/);
  assert.throws(()=>create('chess','Anna',human,{bots:1,level:7}),/computer/);
  const table=create('texas-holdem','Anna',human,{players:5,bots:3});
  assert.equal(table.players.length,4);
  assert.equal(new Set(table.players.map(p=>p.name)).size,4);
  assert.equal(botName(0,1),'Computer');
  assert.equal(snapshot(table,human).botTurn,-1,'a seat is still free');
  join(table,'Bruno',guest);
  assert.equal(table.players.length,5);
  assert.ok(snapshot(table,human).players.at(-1)==='Bruno');
});

test('Battaglia navale: the computer has its fleet ready and shoots after you',()=>{
  const room=create('naval','Anna',human,{size:8,ships:3,bots:1});
  assert.deepEqual(snapshot(room,human).game.ready,[false,true]);
  submit(room,human,{id:'f',version:room.version,action:{ships:fleet(8,room.game.lengths)}});
  submit(room,human,{id:'s',version:room.version,action:{at:0}});
  assert.equal(botTurn(room),1);
  assert.equal(playBot(room,human,{version:room.version}),true);
  assert.equal(room.game.shots[1].length,1);
});

test('Against the computer a rematch starts at once and the room closes without waiting',()=>{
  const room=create('tris','Anna',human,{bots:1});
  room.game.result=0;
  submit(room,human,{id:'r',version:room.version,action:{rematch:true}});
  assert.equal(room.game.result,null);
  assert.equal(room.games,2);
  assert.deepEqual(room.players.map(p=>p.bot===true),[true,false]);
  assert.equal(botTurn(room),0,'the computer now moves first');
  playBot(room,human,{version:room.version});
  submit(room,human,{id:'m',version:room.version,action:anyAction(room.game,1)});
  submit(room,human,{id:'c',version:room.version,action:{close:'request'}});
  assert.equal(room.closed,true);
});

test('A full game against the computer runs through the room from the first move to the result',()=>{
  const room=create('briscola','Anna',human,{players:4,bots:3});
  let guard=0;
  while(room.game.result===null&&guard++<200) {
    if(botTurn(room)>=0)assert.equal(playBot(room,human,{version:room.version,quick:guard%2===0}),true);
    else submit(room,human,{id:'m'+guard,version:room.version,action:anyAction(room.game,0)});
  }
  assert.notEqual(room.game.result,null);
  assert.equal(room.game.scores[0]+room.game.scores[1],120);
});

test('A spectator sees the table but no hidden cards, and cannot play',()=>{
  const room=create('scopa','Anna',human,{players:2});
  join(room,'Bruno',guest);
  const watched=snapshot(room,spectator);
  assert.equal(watched.spectator,true);
  assert.deepEqual(watched.game.hand,[]);
  assert.deepEqual(watched.game.takes,{});
  assert.deepEqual(watched.game.handCounts,[3,3]);
  assert.equal(watched.game.table.length,4);
  assert.equal(watched.requiresConsent,false);
  assert.throws(()=>submit(room,spectator,{id:'x',version:room.version,action:{card:room.game.hands[0][0],take:[]}}),/Accesso/);
  const poker=create('texas-holdem','Anna',human,{players:2});
  join(poker,'Bruno',guest);
  const table=snapshot(poker,spectator);
  assert.deepEqual(table.game.hand,[]);
  assert.deepEqual(table.game.legal,{});
  const sea=create('naval','Anna',human,{size:8,ships:3});
  join(sea,'Bruno',guest);
  submit(sea,human,{id:'f',version:sea.version,action:{ships:fleet(8,sea.game.lengths)}});
  assert.equal(snapshot(sea,spectator).game.mine,null);
  assert.equal(snapshot(sea,human).spectator,undefined);
});

test('Over HTTP the computer moves once per request and spectators read without a seat',async ()=>{
  const {handle,route}=await import('../src/service.mjs');
  assert.equal(route.exec('/api/rooms/'+'a'.repeat(24)+'/bot')?.[2],'bot');
  let saved;
  const published=[];
  const call=async (seat,operation,body,query='')=>{
    const request=new Request('https://example.test/api/rooms/'+'a'.repeat(24)+(operation?'/'+operation:'')+query,{
      method:body?'POST':'GET',headers:{Authorization:'Bearer '+seat},body:body?JSON.stringify(body):undefined});
    const res=await handle(request,operation,()=>structuredClone(saved),value=>{saved=value;published.push(value.version);});
    return [res.status,await res.json()];
  };
  const [created,room]=await call(human,null,{game:'four',name:'Anna',options:{bots:1,level:0}});
  assert.equal(created,200);
  assert.deepEqual(room.players,['Anna','Computer']);
  assert.equal((await call(human,null,{game:'four',name:'Anna',options:{bots:3}}))[0],200,'the room already exists');
  await call(human,'moves',{id:'m1',version:room.version,action:{at:0}});
  const before=saved.version;
  const replies=await Promise.all([call(human,'bot',{version:before}),call(human,'bot',{version:before})]);
  assert.deepEqual(replies.map(([status,data])=>[status,data.version]),[[200,before+1],[200,before+1]]);
  assert.equal(published.filter(version=>version===before+1).length,1);
  assert.equal((await call(guest,'bot',{version:saved.version}))[0],409);
  const [status,watched]=await call(guest,null,undefined,'?guarda=1');
  assert.equal(status,200);
  assert.equal(watched.spectator,true);
  assert.equal((await call(guest,null))[0],409,'without ?guarda an empty seat sees nothing');
  assert.equal((await call(guest,'moves',{id:'x',version:saved.version,action:{at:1}},'?guarda=1'))[0],409);
});
