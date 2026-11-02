import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedPairs, groupPairs } from './pairBlocking';
import { detectContradictions, jaccard, titleTokens } from './contextEngine';
import { candidatePairs, unresolvedContradictions } from './contradictionCandidates';
import type { ContextObject } from '../types';

const obj = (i: number, title: string, content: string, o: Partial<ContextObject> = {}): ContextObject => ({
  id: `o${String(i).padStart(5, '0')}`, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title, content, nodeId: `n${i % 7}`, version: 1, createdAt: '', updatedAt: '', ...o,
});

test('blockedPairs: shared word → pair, sorted by (i, j); capped words and extras', () => {
  const sets = [new Set(['الف', 'ب']), new Set(['ب', 'پ']), new Set(['ت']), new Set(['الف'])];
  assert.deepEqual(blockedPairs(sets), [[0, 1], [0, 3]]);
  assert.deepEqual(blockedPairs(sets, { extra: [[3, 2]] }), [[0, 1], [0, 3], [2, 3]]);
  assert.deepEqual(blockedPairs(sets, { cap: 1 }), [], 'a word in more than `cap` objects is ignored');
  assert.deepEqual(groupPairs(['s', undefined, 's', 's']), [[0, 2], [0, 3], [2, 3]]);
});

test('blocking loses nothing: every pair above the similarity threshold shares a word, so it is found (vs. brute force)', () => {
  const words = ['قیمت', 'پایه', 'ماهانه', 'محصول', 'مخاطب', 'کانال', 'بودجه', 'تیم', 'لحن', 'برند', 'پشتیبانی', 'ساعت'];
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const objs = Array.from({ length: 70 }, (_, i) => {
    const title = Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => words[Math.floor(rnd() * words.length)]).join(' ');
    return obj(i, title, `${title} ${1 + Math.floor(rnd() * 9)} میلیون تومان`);
  });
  const brute = new Set<string>();
  const tok = new Map(objs.map((o) => [o.id, titleTokens(o.title)]));
  for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++) if (jaccard(tok.get(objs[i].id)!, tok.get(objs[j].id)!) >= 0.6) brute.add(`${objs[i].id}|${objs[j].id}`);
  const blocked = new Set(blockedPairs(objs.map((o) => tok.get(o.id)!)).map(([i, j]) => `${objs[i].id}|${objs[j].id}`));
  for (const k of brute) assert.ok(blocked.has(k), `missed ${k}`);
  assert.ok(detectContradictions(objs).length >= 0);
});

test('8000 objects: contradictions and candidate pairs stay fast (they were N²: minutes)', () => {
  const objs = Array.from({ length: 8000 }, (_, i) => obj(i, `مورد ${i} در حوزهٔ ${i % 40}`, `متن مورد ${i}`));
  let t = Date.now();
  unresolvedContradictions(objs, []);
  const a = Date.now() - t;
  t = Date.now();
  candidatePairs(objs);
  const b = Date.now() - t;
  assert.ok(a < 3000 && b < 3000, `unresolvedContradictions ${a}ms, candidatePairs ${b}ms`);
  // real titles are far more varied than this worst case; a pair of near-identical titles with different numbers is still found
  const real = [...objs.slice(0, 500), obj(9001, 'قیمت پایه ماهانه محصول', '5 میلیون تومان'), obj(9002, 'قیمت پایه ماهانه محصول', '7 میلیون تومان')];
  assert.ok(candidatePairs(real, 100000).some((p) => p.key === 'o09001|o09002'));
  assert.ok(unresolvedContradictions(real, []).some((c) => c.itemA.id === 'o09001' && c.itemB.id === 'o09002'));
});

test('8000 objects spread over a 4-level tree: parent/child pairing (inherits_conflict) stays bounded and fast', () => {
  const nodes = [{ id: 'r', label: 'r', description: '' }, ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, label: 'a', description: '', parentId: 'r' })), ...Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, label: 'b', description: '', parentId: `a${i % 10}` })), ...Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, label: 'c', description: '', parentId: `b${i % 40}` }))];
  const objs = Array.from({ length: 8000 }, (_, i) => ({ ...obj(i, `مورد ${i} در حوزهٔ ${i % 40}`, `متن مورد ${i}`), nodeId: i % 3 === 0 ? 'r' : i % 3 === 1 ? `b${i % 40}` : `c${i % 80}` }));
  const t = Date.now();
  const r = candidatePairs(objs, 10, [], nodes);
  assert.ok(Date.now() - t < 4000, `candidatePairs with a tree took ${Date.now() - t}ms`);
  assert.ok(r.length <= 10);
});
