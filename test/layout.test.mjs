import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');

// Boards are sized as a share of their column. Beside the name plates that column must not be
// sized by its content, or an empty Forza 4 or Tris board shrinks to its border.
test('The board column beside the name plates has a width of its own',()=>{
  const rule=/\.duel\{[^}]*grid-template-columns:([^;]+);/.exec(css);
  assert.ok(rule,'the duel grid is defined');
  const [plates,board]=rule[1].trim().split(/\s+(?=minmax\()/);
  assert.match(plates,/^minmax\(140px,230px\)$/);
  assert.doesNotMatch(board,/\bauto\b|max-content|min-content|fit-content/);
  assert.match(board,/var\(--duel-board\)\)$/);
  for(const board of ['.board.four','.board.tris','.dots-board','.nim-board','.bg-board'])
    assert.ok(css.includes('.duel:has('+board+')'),board+' sets the width of its column');
});
