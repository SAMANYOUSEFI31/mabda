/**
 * Spacing follows relationship (Gestalt proximity), one step of the stack scale per level (docs/design-system «فاصله و رابطه»):
 *   xs (4)  inside one thing: a title and its own line of explanation, a label and its value
 *   sm (8)  items of one list, fields of one group
 *   md (16) a group's head and its content; groups inside one section or card
 *   lg (24) sections of a page; sub-sections of a section
 *   xl (32) the main parts of a document (the tree's top sections)
 * The two mistakes this test catches are the ones found in the audit of 1405/09/06: a title and its explanation set apart by the
 * gap that separates whole items (the base taken one step too high), and a card's content spaced like the page's sections.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : /\.tsx$/.test(p) ? [p] : []);
const files = ['src/app', 'src/components', 'src/ui'].flatMap(walk);

test('a title and its explanation are one thing: stack-xs between them, not the gap between items', () => {
  const bad: string[] = [];
  for (const f of files) {
    const L = readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < L.length - 2; i++) {
      if (!/className="[^"]*(flex-col[^"]*gap-stack-(sm|md|lg|xl)|space-y-stack-(sm|md|lg|xl))/.test(L[i])) continue;
      const head = /^\s*<(h[1-6]|span)\b[^>]*className="[^"]*(heading-|label-md|label-lg|title)[^"]*"[^>]*>.*<\/\1>\s*$/.test(L[i + 1]);
      const line = /^\s*<p className="[^"]*(body-sm|caption)[^"]*"[^>]*>.*<\/p>\s*$/.test(L[i + 2]);
      if (head && line) bad.push(`${f}:${i + 1}`);
    }
  }
  assert.deepEqual(bad, [], 'wrap the title and its explanation in their own `flex flex-col gap-stack-xs`');
});

test('a card is one section: its content is spaced md, not like the page (lg and up)', () => {
  const bad: string[] = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (/<Card\b[^>]*className="[^"]*\bgap-stack-(lg|xl|2xl)\b/.test(l)) bad.push(`${f}:${i + 1}`); });
  assert.deepEqual(bad, []);
});
