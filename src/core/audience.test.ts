/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, startTemplateFor, starterSpecIds } from './specs';

const BUSINESS = /کسب‌وکار|کسب و کار|مشتری|بازاریابی|فروش|برند|آفر/;
const texts = (n: { label: string; description?: string; children?: unknown[] }): string[] =>
  [n.label, n.description ?? '', ...((n.children ?? []) as typeof n[]).flatMap(texts)];

test('a new personal space has no business branch or text (audience.md)', () => {
  const t = startTemplateFor('personal');
  const all = [t.title, t.description ?? '', ...t.nodes.flatMap(texts)].join('\n');
  assert.doesNotMatch(all, BUSINESS);
  const specs = LIBRARY.filter((s) => starterSpecIds('personal').includes(s.id));
  for (const s of specs) assert.doesNotMatch(`${s.title}\n${s.description ?? ''}`, BUSINESS, s.id);
});
