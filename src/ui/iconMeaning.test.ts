/**
 * One icon, one meaning (docs/design-system/iconography.md «یک آیکن، یک معنا»): the table there gives each icon one row, and every
 * icon the domain marks use (mabda.tsx: types, states, kinds of thought, reach) is in it, so a new mark cannot borrow an icon that
 * already means something else without the table saying so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = readFileSync('docs/design-system/iconography.md', 'utf8');
const section = doc.slice(doc.indexOf('### یک آیکن، یک معنا'), doc.indexOf('### ممنوع'));
const rows = section.split('\n').filter((l) => /^\| .* \| `[A-Za-z0-9]+` \|/.test(l)).map((l) => l.match(/`([A-Za-z0-9]+)`/)![1]);

test('each icon has one row in the meaning table', () => {
  const twice = rows.filter((r, i) => rows.indexOf(r) !== i);
  assert.ok(rows.length > 40);
  assert.deepEqual(twice, []);
});

test('every icon of a domain mark is in the meaning table', () => {
  const used = [...new Set([...readFileSync('src/ui/mabda.tsx', 'utf8').matchAll(/icon: '([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
  assert.deepEqual(used.filter((u) => !rows.includes(u)), []);
});
