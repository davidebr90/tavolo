import test from 'node:test';
import assert from 'node:assert/strict';
import {cardKey,cardSvg,loadDeck,scopaDecks} from '../public/card-art.mjs';

test('Original HD scans cover the complete regional decks without external assets',async()=>{
  for(const deck of Object.keys(scopaDecks)) {
    const cards=await loadDeck(deck);
    assert.equal(Object.keys(cards).length,40);
    for(let i=0;i<40;i++) {
      const image=Buffer.from(cards[cardKey('scopa',i)],'base64');
      assert.equal(image.toString('ascii',8,12),'WEBP');
      assert.ok(image.length>2000);
    }
  }
});

test('All 174 faces are renderable vector paths with no raster dependency',async ()=>{
  const scopa=Array.from({length:40},(_,n)=>cardKey('scopa',n));
  const uno=['R','B','G','Y'].flatMap(c=>Array.from({length:10},(_,n)=>n).concat('skip','reverse','two').map(rank=>cardKey('uno',c+':'+rank+':0')));
  uno.push(cardKey('uno','W:wild:0'),cardKey('uno','W:four:0'));
  for(const deck of ['uno',...Object.keys(scopaDecks)]) {
    const cards=await loadDeck(deck,'vector'), keys=deck==='uno'?uno:scopa;
    assert.deepEqual(Object.keys(cards).sort(),keys.sort());
    for(const key of keys) {
      const svg=cardSvg(cards[key]);
      assert.match(svg,/<svg[\s\S]+<path[\s\S]+<\/svg>/,deck+'/'+key);
      assert.doesNotMatch(svg,/<image|data:image|<text|https?:\/(?!\/www.w3.org)/);
    }
  }
  assert.equal(cardKey('scopa',6),'7d');
  assert.equal(cardKey('uno','G:two:1'),'GA2');
});
