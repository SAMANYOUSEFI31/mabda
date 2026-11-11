import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_SHOWN, MORE_STEP, allCommands, buildSearchIndex, registerPaletteCommand, searchIndex, shownCount, snippetFor } from './globalSearch';
import type { ContextObject, StoredFile, Thought, TreeNode } from '../types';

// «جست‌وجوی واحد»: every kind, no fixed ceiling, progressive disclosure, Persian folding, a registration point for commands.

const nodes: TreeNode[] = [
  { id: 'business', label: 'کسب‌وکار', description: '', order: 0 },
  { id: 'offer', label: 'آفر و قیمت‌گذاری', parentId: 'business', description: '', order: 0 },
  { id: 'brand', label: 'برند و پیام', parentId: 'business', description: '', order: 1 },
];
const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: `متن ${id}`, nodeId: 'business', version: 1, createdAt: '', updatedAt: '', ...p,
});
const th = (id: string, text: string, p: Partial<Thought> = {}): Thought => ({ id, workspaceId: 'w', nodeId: 'brand', kind: null, text, status: 'open', createdAt: '', updatedAt: '', ...p });
const fl = (id: string, name: string, p: Partial<StoredFile> = {}): StoredFile => ({ id, workspaceId: 'w', name, mime: 'application/pdf', sizeBytes: 1, status: 'ready', tokens: 1, chunkCount: 1, createdAt: '', ...p });

test('thoughts and files are found too, each in its own group, with the section path', () => {
  const ix = buildSearchIndex({
    nodes, objects: [],
    thoughts: [th('t1', 'آیا تخفیف همکاری لازم است؟\nبررسی رقبا'), th('t2', 'سقف سفارش', { status: 'resolved' })],
    files: [fl('f1', 'قرارداد-تخفیف.pdf', { nodeId: 'offer', summary: 'شرایط تخفیف' })],
  });
  const g = searchIndex(ix, 'تخفیف');
  assert.equal(g.thought[0].id, 't1');
  assert.equal(g.thought[0].subtitle, 'کسب‌وکار ‹ برند و پیام');
  assert.equal(g.file[0].id, 'f1');
  assert.equal(g.file[0].subtitle, 'کسب‌وکار ‹ آفر و قیمت‌گذاری');
  assert.match(searchIndex(ix, 'سقف').thought[0].subtitle ?? '', /^حل‌شده/);
  assert.match(searchIndex(ix, 'رقبا').thought[0].snippet ?? '', /رقبا/, 'the matching piece of a thought is shown');
});

test('Persian folding: harakat, tatweel, Arabic letters and digits in the TEXT are matched by a plain query; the snippet is cut from the original text', () => {
  const ix = buildSearchIndex({ nodes, objects: [o('z', { title: 'سقف', content: `${'الف '.repeat(30)}كِتـاب شمارهٔ ۱۲۳ را ببین` })] });
  for (const q of ['کتاب', 'كتاب', 'کِتاب', '123', '۱۲۳', 'شماره']) assert.equal(searchIndex(ix, q).object[0]?.id, 'z', q);
  assert.match(searchIndex(ix, 'کتاب').object[0].snippet ?? '', /كِتـاب/, 'the original text, not the folded one');
  assert.match(searchIndex(ix, '123').object[0].snippet ?? '', /۱۲۳/);
});

test('half-space: «می‌خواهم» is found by «می خواهم» and the reverse', () => {
  const ix = buildSearchIndex({ nodes, objects: [o('h', { title: 'برنامهٔ هفتگی', content: 'کارهای وقت‌گیر را می‌نویسم' })] });
  assert.equal(searchIndex(ix, 'وقت گیر').object[0]?.id, 'h');
  assert.equal(searchIndex(ix, 'می نویسم').object[0]?.id, 'h');
  assert.equal(searchIndex(ix, 'وقت‌گیر').object[0]?.id, 'h');
});

test('no fixed ceiling: every hit comes back, best first; the palette discloses them 5 + 10 + 10 …', () => {
  const many = Array.from({ length: 60 }, (_, i) => o(`m${i}`, { title: `قیمت ${i}`, content: i === 41 ? 'قیمت قیمت قیمت قیمت' : 'متن' }));
  const g = searchIndex(buildSearchIndex({ nodes, objects: many }), 'قیمت');
  assert.equal(g.object.length, 60);
  assert.equal(g.object[0].id, 'm41', 'the most relevant one is first');
  assert.equal(shownCount(undefined), FIRST_SHOWN);
  assert.equal(shownCount(2), FIRST_SHOWN + 2 * MORE_STEP);
});

test('snippets beyond the eager ones are cut on demand with snippetFor', () => {
  const many = Array.from({ length: 80 }, (_, i) => o(`s${i}`, { title: `عنوان ${i}`, content: `متن ${i} با واژهٔ پنهان` }));
  const ix = buildSearchIndex({ nodes, objects: many });
  const late = searchIndex(ix, 'پنهان').object[70];
  assert.equal(late.snippet, undefined);
  assert.equal(late.wantsSnippet, true);
  assert.match(snippetFor(ix, 'پنهان', late) ?? '', /پنهان/);
});

test('palette commands can be registered from outside (e.g. «ثبت سریع») and are found like the built-in ones', () => {
  const ix = buildSearchIndex({ nodes, objects: [] });
  const off = registerPaletteCommand({ id: 'quick-capture', title: 'ثبت سریع', keywords: ['یادداشت فوری'], run: () => undefined });
  assert.ok(allCommands().some((c) => c.id === 'quick-capture'));
  assert.ok(searchIndex(ix, 'فوری').command.some((c) => c.id === 'quick-capture'));
  assert.ok(searchIndex(ix, '').command.some((c) => c.id === 'quick-capture'));
  off();
  assert.ok(!allCommands().some((c) => c.id === 'quick-capture'));
});

test('5000 items: a keystroke answers well inside a frame budget (scripts/bench-search.ts prints the full table)', () => {
  const words = Array.from({ length: 800 }, (_, i) => `واژه${String.fromCharCode(0x0627 + (i % 28))}${String.fromCharCode(0x0627 + (((i / 28) | 0) % 28))}`);
  const text = (i: number, n: number) => Array.from({ length: n }, (_, k) => words[(i * 7 + k * 13) % words.length]).join(' ');
  const big = Array.from({ length: 5000 }, (_, i) => o(`b${i}`, { title: text(i, 3), content: text(i + 1, 40), nodeId: i % 2 ? 'offer' : 'brand' }));
  const ix = buildSearchIndex({ nodes, objects: big });
  searchIndex(ix, 'واژه');
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) searchIndex(ix, i % 2 ? 'واژه' : `${words[i * 11]} ${words[i * 5]}`);
  const per = (performance.now() - t0) / 10;
  assert.ok(per < 100, `one search took ${per.toFixed(1)} ms`);
});
