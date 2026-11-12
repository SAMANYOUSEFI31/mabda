import test from 'node:test';
import assert from 'node:assert/strict';
import { reasonFor, affectedOutputs, approvalMoments, compareTruth, groupBySection, mostImportant, successionOf, summarySentence, toMarkdown, truthAt, truthIfApproved } from './truthCompare.ts';
import type { ContextChange, ContextObject, TreeNode } from '../types';

const nodes = [{ id: 'price', label: 'قیمت' }, { id: 'ship', label: 'ارسال' }, { id: 'sub', label: 'زیرارسال', parentId: 'ship' }] as unknown as TreeNode[];
const T = (d: string) => `2026-03-${d}T10:00:00.000Z`;
const ob = (id: string, p: Partial<ContextObject> = {}) => ({ id, nodeId: 'price', status: 'Confirmed', type: 'Decision', title: id, content: `متن ${id}`, version: 1, createdAt: T('01'), updatedAt: T('01'), ...p }) as unknown as ContextObject;
let n = 0;
const ch = (objectId: string, kind: ContextChange['kind'], at: string, p: Partial<ContextChange> = {}) => ({ id: `c${++n}`, workspaceId: 'w', objectId, fromVersion: 1, toVersion: 1, kind, actor: 'user', at, ...p }) as unknown as ContextChange;

test('حقیقت در گذشته: ویرایش‌های بعدی برگردانده می‌شوند و فقط تأییدشده می‌ماند', () => {
  const objects = [ob('a', { content: 'قیمت ۶ میلیون', version: 2, updatedAt: T('10') }), ob('b', { status: 'Archived' }), ob('late', { createdAt: T('12') })];
  const changes = [
    ch('a', 'created', T('01'), { toVersion: 1, after: { title: 'a', status: 'Confirmed', nodeId: 'price' } }),
    ch('a', 'edited', T('10'), { fromVersion: 1, toVersion: 2, before: { content: 'قیمت ۴ میلیون' }, after: { content: 'قیمت ۶ میلیون' } }),
    ch('b', 'created', T('01'), { after: { status: 'Confirmed' } }), ch('b', 'archived', T('08'), { before: { status: 'Confirmed' }, after: { status: 'Archived' } }),
    ch('late', 'created', T('12'), { after: { status: 'Confirmed' } }),
  ];
  const before = truthAt({ objects, changes }, T('05'));
  assert.equal(before.get('a')!.content, 'قیمت ۴ میلیون');
  assert.equal(before.get('a')!.version, 1);
  assert.ok(before.has('b'), 'b was still in force on the 5th');
  assert.ok(!before.has('late'), 'not yet created');
  const now = truthAt({ objects, changes }, T('20'));
  assert.deepEqual([...now.keys()].sort(), ['a', 'late']);
});

test('قدیمی و پیشنهادی و نمونه حقیقت نیستند', () => {
  const objects = [ob('exp', { validUntil: '2026-03-05' }), ob('prop', { status: 'Proposed' }), ob('s', { sample: true } as never)];
  assert.equal(truthAt({ objects, changes: [] }, T('10')).size, 0);
  assert.ok(truthAt({ objects, changes: [] }, T('03')).has('exp'));
});

test('مقایسه: افزوده، حذف، تغییر با diff، جابه‌جایی، دامنه — و فاصله/رقم/ی عربی تغییر نیست', () => {
  const A = truthAt({ objects: [ob('keep'), ob('gone'), ob('edit', { content: 'ارسال ۳ روزه' }), ob('mv'), ob('rc', { type: 'Fact' })], changes: [] }, T('02'));
  const B = truthAt({ objects: [ob('keep', { content: 'متن  keep' }), ob('new'), ob('edit', { content: 'ارسال ۵ روزه' }), ob('mv', { nodeId: 'ship' }), ob('rc', { type: 'Fact', reach: 'global' })], changes: [] }, T('02'));
  const c = compareTruth(A, B, { nodes });
  assert.deepEqual(c.counts, { added: 1, removed: 1, changed: 1, moved: 1, reach: 1, total: 5 });
  assert.ok(c.deltas.find((d) => d.id === 'edit')!.diff!.some((s) => s.kind === 'add' && s.text.includes('۵')));
  assert.equal(c.deltas.find((d) => d.id === 'keep'), undefined, 'only spacing differs');
  assert.equal(summarySentence(c, String), '1 افزوده، 1 تغییر، 1 حذف، 1 جابه‌جا، 1 تغییر در جای اعمال');
  assert.equal(summarySentence({ deltas: [], counts: { added: 0, removed: 0, changed: 0, moved: 0, reach: 0, total: 0 } }), 'چیزی عوض نشده است.');
});

test('بازنویسی تأییدشده (جایگزینی) یک مورد تغییرکرده است، نه یک حذف و یک افزوده', () => {
  const objects = [ob('old', { status: 'Superseded', supersededById: 'mid' } as never), ob('mid', { status: 'Superseded', supersededById: 'new', content: 'میانی' } as never), ob('new', { content: 'نسخهٔ تازه', createdAt: T('08') })];
  const changes = [ch('old', 'created', T('01'), { after: { status: 'Confirmed' } }), ch('old', 'superseded', T('05'), { before: { status: 'Confirmed' }, after: { status: 'Superseded' } }), ch('mid', 'created', T('05'), { after: { status: 'Confirmed' } }), ch('mid', 'superseded', T('08'), { before: { status: 'Confirmed' }, after: { status: 'Superseded' } }), ch('new', 'created', T('08'), { after: { status: 'Confirmed' } })];
  const A = truthAt({ objects, changes }, T('02')), B = truthAt({ objects, changes }, T('10'));
  const plain = compareTruth(A, B);
  assert.deepEqual([plain.counts.added, plain.counts.removed, plain.counts.changed], [1, 1, 0]);
  const c = compareTruth(A, B, { succession: successionOf(objects) });
  assert.deepEqual([c.counts.added, c.counts.removed, c.counts.changed], [0, 0, 1]);
  assert.equal(c.deltas[0].id, 'new');
  assert.ok(c.deltas[0].diff!.some((s) => s.kind !== 'same'));
});

test('دامنه: فقط یک بخش و زیربخش‌هایش', () => {
  const A = truthAt({ objects: [ob('p1'), ob('s1', { nodeId: 'ship' }), ob('s2', { nodeId: 'sub' })], changes: [] }, T('02'));
  const B = truthAt({ objects: [ob('p1', { content: 'x' }), ob('s1', { nodeId: 'ship', content: 'y' }), ob('s2', { nodeId: 'sub', content: 'z' })], changes: [] }, T('02'));
  assert.deepEqual(compareTruth(A, B, { nodes, scopeNodeId: 'ship' }).deltas.map((d) => d.id).sort(), ['s1', 's2']);
});

test('اگر تأیید کنم: پیشنهاد، در انتظار بازبینی و پیش‌نویس؛ انتخاب‌شده‌ها', () => {
  const objects = [ob('c'), ob('p', { status: 'Proposed' }), ob('r', { status: 'Needs Review' }), ob('d', { draft: { title: 'd', content: 'نسخهٔ تازه', at: T('09') } }), ob('arch', { status: 'Archived' })];
  const now = truthAt({ objects, changes: [] }, T('10'));
  const all = compareTruth(now, truthIfApproved({ objects }, { now: T('10') }), { nodes });
  assert.deepEqual(all.deltas.map((d) => d.id).sort(), ['d', 'p', 'r']);
  const only = compareTruth(now, truthIfApproved({ objects }, { now: T('10'), only: new Set(['p']) }), { nodes });
  assert.deepEqual(only.deltas.map((d) => d.id), ['p']);
});

test('مهم‌ترین، گروه‌بندی بخش، خروجی‌های اثرپذیر، Markdown، لحظه‌های تأیید', () => {
  const A = truthAt({ objects: [ob('c', { type: 'Constraint', nodeId: 'ship', content: 'الف' }), ob('f', { type: 'Fact', content: 'ب' })], changes: [] }, T('02'));
  const B = truthAt({ objects: [ob('c', { type: 'Constraint', nodeId: 'ship', content: 'ج' }), ob('f', { type: 'Fact', content: 'د' })], changes: [] }, T('02'));
  const c = compareTruth(A, B, { nodes });
  assert.equal(mostImportant(c)!.id, 'c');
  assert.deepEqual(groupBySection(c, nodes).map((g) => g.label), ['قیمت', 'ارسال']);
  const out = affectedOutputs(c, [{ id: 'd1', title: 'پیشنهاد', createdAt: T('03'), usedContext: [{ id: 'f', version: 1 }] }, { id: 'd2', title: 'بی‌ربط', createdAt: T('03'), usedContext: [{ id: 'zzz', version: 1 }] }] as never);
  assert.deepEqual(out.map((o) => o.id), ['d1']);
  assert.ok(toMarkdown(c, nodes, 'مقایسه', String, out).includes('## ارسال'));
  const ap = approvalMoments([ch('a', 'proposal_accepted', T('05')), ch('b', 'status_changed', T('05'), { after: { status: 'Confirmed' } }), ch('x', 'edited', T('07'))]);
  assert.deepEqual(ap, [T('05')]);
  const withEdit = approvalMoments([...[ch('a', 'edited', T('09'), { fromVersion: 1, toVersion: 2 }), ch('z', 'edited', T('11'), { fromVersion: 1, toVersion: 2 })]], 8, [ob('a'), ob('z', { status: 'Proposed' })]);
  assert.deepEqual(withEdit, [T('09')], 'an edit of confirmed knowledge counts; a draft does not');
});

test('کارایی: ۵۰۰۰ مورد و ۲۰۰۰۰ تغییر زیر یک ثانیه', () => {
  const objects: ContextObject[] = [], changes: ContextChange[] = [];
  for (let i = 0; i < 5000; i++) {
    objects.push(ob(`o${i}`, { content: `v4 ${i}`, version: 4 }));
    for (let v = 1; v <= 4; v++) changes.push(ch(`o${i}`, v === 1 ? 'created' : 'edited', `2026-03-${String(v + 1).padStart(2, '0')}T10:00:00.000Z`, { fromVersion: v - 1, toVersion: v, before: v > 1 ? { content: `v${v - 1} ${i}` } : undefined, after: { content: `v${v} ${i}`, status: 'Confirmed' } }));
  }
  const t0 = Date.now();
  const A = truthAt({ objects, changes }, '2026-03-03T12:00:00.000Z'), B = truthAt({ objects, changes }, '2026-03-20T00:00:00.000Z');
  const c = compareTruth(A, B);
  assert.equal(c.counts.changed, 5000);
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0}ms`);
});

test('دلیل تغییر: آخرین دلیل نوشته‌شده داخل بازه، از هر شناسهٔ زنجیره', () => {
  const cs = [ch('old', 'superseded', T('05'), { reason: 'قیمت عوض شد' }), ch('old', 'edited', T('03'), { reason: 'قدیمی‌تر' }), ch('x', 'edited', T('06'), { reason: 'بیرون از بازه' })];
  assert.equal(reasonFor(['new', 'old'], cs, T('02'), T('10')), 'قیمت عوض شد');
  assert.equal(reasonFor(['old'], cs, T('06'), T('10')), undefined);
});
