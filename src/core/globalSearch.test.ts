import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, expandQuery, flattenGroups, groupOrder, searchIndex, totalHits } from './globalSearch';
import type { ContextObject, TreeNode } from '../types';

const nodes: TreeNode[] = [
  { id: 'business', label: 'کسب‌وکار', description: '', order: 0 },
  { id: 'offer', label: 'آفر و قیمت‌گذاری', parentId: 'business', description: 'بسته‌های قیمتی', order: 0 },
  { id: 'brand', label: 'برند و پیام', parentId: 'business', description: '', order: 1 },
];
const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: `متن ${id}`, nodeId: 'business', version: 1, createdAt: '', updatedAt: '', ...p,
});
const objects = [
  o('a', { title: 'قیمت اشتراک ماهانه', content: 'پانصد هزار تومان', nodeId: 'offer' }),
  o('b', { title: 'لحن برند', content: 'صمیمی و محترم؛ قیمت را پنهان نمی‌کنیم', nodeId: 'brand' }),
  o('c', { title: 'مخاطب اصلی', content: 'فریلنسرهای طراح' }),
  o('d', { title: 'قدیمی', content: 'قیمت قدیمی', status: 'Superseded' }),
  o('e', { title: 'بایگانی', content: 'قیمت بایگانی', status: 'Archived' }),
  o('s', { title: 'نمونه قیمت', content: 'قیمت نمونه', sample: true }),
  o('p', { title: 'پیشنهاد کانال', content: 'تلگرام', status: 'Proposed' }),
];
const idx = () => buildSearchIndex({
  nodes, objects,
  deliverables: [{ id: 'dl1', title: 'متن تبلیغ پاییز', content: 'تخفیف پاییزی برای اشتراک' }],
  notes: [{ id: 'n1', nodeId: 'brand', content: 'یادداشت: باید دربارهٔ قیمت‌گذاری رقبا فکر کنم\nخط دوم' }],
});

test('a few letters find it: the last word counts as a prefix', () => {
  const g = searchIndex(idx(), 'قیم');
  assert.equal(g.object[0].id, 'a', 'the title match comes first');
  assert.ok(g.object.some((h) => h.id === 'b'), 'a content match is found too');
  assert.ok(g.node.some((h) => h.id === 'offer'), 'the node «قیمت‌گذاری» is found by its prefix');
  assert.deepEqual(searchIndex(idx(), 'لح').object.map((h) => h.id), ['b']);
});

test('Persian normalisation: Arabic ي/ك, ZWNJ, digits and hamza do not matter', () => {
  const g = searchIndex(idx(), 'قيمت كذاری');
  assert.ok(g.node.some((h) => h.id === 'offer'), 'ي/ك');
  assert.ok(searchIndex(idx(), 'کسب وکار').node.some((h) => h.id === 'business'), 'ZWNJ vs space');
  const withDigits = buildSearchIndex({ nodes, objects: [o('x', { title: 'سقف ۵۰ سفارش', content: 'x' })] });
  assert.equal(searchIndex(withDigits, '50').object[0]?.id, 'x', 'Latin digits find Persian digits');
});

test('groups: nodes, knowledge, assets and notes each come back; samples, archived and superseded never', () => {
  const g = searchIndex(idx(), 'قیمت');
  assert.ok(g.asset.length === 0 && g.note.length === 1, 'the note mentions قیمت‌گذاری; the asset does not mention قیمت');
  const all = flattenGroups(g).map((h) => h.id);
  for (const hidden of ['d', 'e', 's']) assert.ok(!all.includes(hidden), hidden);
  assert.equal(searchIndex(idx(), 'پاییز').asset[0].id, 'dl1');
  assert.ok(searchIndex(idx(), 'تلگرام').object.some((h) => h.id === 'p' && /پیشنهاد/.test(h.subtitle ?? '') && h.state === 'proposed'), 'a Proposed item is found and labelled');
});

test('a note is found by its text and shows where it lives; the match inside the text is shown as a snippet', () => {
  const [n] = searchIndex(idx(), 'رقبا').note;
  assert.equal(n.id, 'n1');
  assert.match(n.title, /^یادداشت: باید/);
  assert.equal(n.subtitle, 'کسب‌وکار ‹ برند و پیام');
  assert.match(n.snippet ?? '', /رقبا/);
});

test('ranking: more of the typed words matched comes first, then BM25, then a stable id order', () => {
  const g = searchIndex(idx(), 'قیمت اشتراک');
  assert.equal(g.object[0].id, 'a');
  const again = searchIndex(idx(), 'قیمت اشتراک');
  assert.deepEqual(g.object.map((h) => h.id), again.object.map((h) => h.id));
});

test('commands: an empty query lists them; a few letters of a word of the title or a keyword select them', () => {
  const empty = searchIndex(idx(), '');
  assert.ok(empty.command.length >= 5 && totalHits(empty) === empty.command.length);
  assert.equal(searchIndex(idx(), 'ثبت').command[0].id, 'record');
  assert.ok(searchIndex(idx(), 'درخو').command.some((c) => c.id === 'ai-request'));
  assert.ok(searchIndex(idx(), 'پرامپ').command.some((c) => c.id === 'ai-request'), 'a keyword');
  assert.ok(searchIndex(idx(), 'رفتن بوم').command.some((c) => c.id === 'go-canvas'));
});

test('nothing matches → empty groups; a one-letter query does not flood the list', () => {
  assert.equal(totalHits(searchIndex(idx(), 'ZZZZ')), 0);
  assert.equal(totalHits(searchIndex(idx(), 'ا')), 0);
});

test('expandQuery: prefix first, then substring (3+ letters), else as typed', () => {
  const { vocab } = idx();
  assert.ok(expandQuery('اشتر', vocab).terms[0].some((t) => t.startsWith('اشتر')));
  assert.deepEqual(expandQuery('qqqq', vocab).terms, [['qqqq']]);
});

test('a big workspace: found with a few letters, fast, limited per group', () => {
  const many: ContextObject[] = [];
  for (let i = 0; i < 3000; i++) many.push(o(`k${i}`, { title: `مورد شمارهٔ ${i} دربارهٔ موضوع ${i % 50}`, content: `توضیح ${'بلند '.repeat(20)}${i}`, nodeId: i % 2 ? 'offer' : 'brand' }));
  many.push(o('needle', { title: 'سوزن یکتا', content: 'پیدا شدنی' }));
  const t0 = Date.now();
  const index = buildSearchIndex({ nodes, objects: many });
  const g = searchIndex(index, 'سوزن');
  const ms = Date.now() - t0;
  assert.equal(g.object[0].id, 'needle');
  assert.ok(searchIndex(index, 'موضو', { limitPerGroup: 4 }).object.length === 4);
  assert.ok(ms < 3000, `index + search took ${ms}ms`);
});

test('the group with the best hit comes first, so the thing you named is the first row; commands stay on top', () => {
  const ix = buildSearchIndex({ nodes: [...nodes, { id: 'sup', label: 'پشتیبانی', parentId: 'business', description: 'ساعت و زمان پاسخ به مشتری', order: 5 }], objects: [o('h', { title: 'ساعت پاسخگویی', content: 'نه تا شش' })] });
  const g = searchIndex(ix, 'ساعت پاسخ');
  assert.equal(flattenGroups(g)[0].id, 'h', 'the object whose title you typed beats a node whose description mentions the words');
  assert.deepEqual(groupOrder(g).slice(0, 2), ['object', 'node']);
  const c = searchIndex(ix, 'ثبت');
  assert.equal(groupOrder(c)[0], 'command');
});

test('a rule contradiction reads «تناقض» in search, not a solid truth dot', () => {
  const nodes: TreeNode[] = [{ id: 'r', label: 'ریشه', description: '', order: 0 } as TreeNode];
  const mk = (id: string, content: string) => ({ id, nodeId: 'r', type: 'Fact', status: 'Confirmed', title: 'اجارهٔ ماهانه', content, provenance: 'User Input', version: 1 }) as unknown as ContextObject;
  const hits = searchIndex(buildSearchIndex({ nodes, objects: [mk('a', 'اجاره ۲۲ میلیون است'), mk('b', 'اجاره ۱۸ میلیون است')] }), 'اجاره').object;
  assert.ok(hits.length === 2 && hits.every((h) => h.state === 'conflict' && /تناقض/.test(h.subtitle ?? '')));
});

test('recent: newest first, no duplicates, no commands, and only what still exists', async () => {
  const { recentHits, pushRecent } = await import('./globalSearch');
  const nodes = [{ id: 'r', label: 'ریشه', description: '', order: 0 }] as unknown as TreeNode[];
  const o = (id: string) => ({ id, nodeId: 'r', type: 'Fact', status: 'Confirmed', title: `مورد ${id}`, content: 'x', provenance: 'User Input', version: 1 }) as unknown as ContextObject;
  let rec = pushRecent([], { kind: 'object', id: 'a' });
  rec = pushRecent(rec, { kind: 'object', id: 'gone' });
  rec = pushRecent(rec, { kind: 'command', id: 'record' });
  rec = pushRecent(rec, { kind: 'object', id: 'a' });
  assert.deepEqual(rec.map((r) => r.id), ['a', 'gone']);
  const hits = recentHits(buildSearchIndex({ nodes, objects: [o('a')] }), rec);
  assert.deepEqual(hits.map((h) => h.id), ['a']);
});
