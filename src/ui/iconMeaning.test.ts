/**
 * One icon, one meaning (docs/design-system/iconography.md «یک آیکن، یک معنا»): the table there gives each icon one row, and every
 * icon the domain marks use (mabda.tsx: types, states, kinds of thought, reach) is in it, so a new mark cannot borrow an icon that
 * already means something else without the table saying so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const doc = readFileSync('docs/design-system/iconography.md', 'utf8');
const section = doc.slice(doc.indexOf('### یک آیکن، یک معنا'), doc.indexOf('### ممنوع'));
const rows = section.split('\n').filter((l) => /^\| .* \| `[A-Za-z0-9]+` \|/.test(l)).map((l) => l.match(/`([A-Za-z0-9]+)`/)![1]);

test('each icon has one row in the meaning table', () => {
  const twice = rows.filter((r, i) => rows.indexOf(r) !== i);
  assert.ok(rows.length > 40);
  assert.deepEqual(twice, []);
});

// every icon the app draws anywhere, not only the domain marks: the first version read mabda.tsx alone, so «درخواست دوباره» could
// borrow «درخواست برای ابزار دیگر»'s icon in a menu and no test saw it. Now an icon in any file must have its one row, and a row
// that names a meaning is where the second use is noticed
test('every icon the app uses anywhere has its row in the meaning table', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(p) && !/\.test\./.test(p) && !p.endsWith('Icon.tsx') ? [p] : []; });
  const used = new Set<string>();
  for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/\bicon(?:Start|End)?(?:="|: ?'|=\{')([A-Z][A-Za-z0-9]+)/g)) used.add(m[1]);
  assert.deepEqual([...used].filter((u) => !rows.includes(u)).sort(), []);
});

test('every icon of a domain mark is in the meaning table', () => {
  const used = [...new Set([...readFileSync('src/ui/mabda.tsx', 'utf8').matchAll(/icon: '([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
  assert.deepEqual(used.filter((u) => !rows.includes(u)), []);
});
