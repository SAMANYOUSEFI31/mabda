import test from 'node:test';
import assert from 'node:assert/strict';
import { aroundOf, relatedFor } from './around';
import { registerSlotProvider } from './suggestionSlots';
import type { ContextObject, ContextRelationship, TreeNode } from '../types';

const nodes: TreeNode[] = [{ id: 'n', label: 'کسب‌وکار', description: '', order: 0 }];
const o = (id: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: `عنوان ${id}`, content: `متن ${id}`, nodeId: 'n', version: 1, createdAt: '', updatedAt: '', ...p,
});
let rid = 0;
const r = (type: ContextRelationship['type'], sourceId: string, targetId: string): ContextRelationship => ({ id: `r${rid++}`, type, sourceId, targetId, createdAt: '' });

const objects = [o('a'), o('b'), o('c'), o('d'), o('old', { status: 'Superseded' }), o('x', { source: { kind: 'note', noteId: 'note1', quote: 'قیمت را بررسی کن' } as ContextObject['source'] })];
const rels = [r('depends_on', 'a', 'b'), r('depends_on', 'c', 'a'), r('depends_on', 'd', 'c'), r('supersedes', 'a', 'old'), r('derived_from', 'a', 'x')];
const base = { objects, relationships: rels, nodes, thoughts: [], notes: [], deliverables: [] };
const group = (a: ReturnType<typeof aroundOf>, id: string) => a.groups.find((g) => g.id === id)!;

test('relations: both directions, what replaced what, and how many rest on it only through others', () => {
  const a = aroundOf({ ...base, objectId: 'a' });
  const roles = group(a, 'relations').items.map((i) => `${i.role}:${i.object?.id ?? i.text}`);
  assert.ok(roles.includes('به این وابسته است:b'));
  assert.ok(roles.includes('روی این سوار است:c'));
  assert.ok(roles.includes('جای این را گرفته:old'));
  assert.ok(roles.includes('از این مشتق شده:x'));
  assert.equal(group(a, 'relations').items.find((i) => i.object?.id === 'c')?.far, 1, 'd rests on c which rests on a');
  assert.ok(a.total >= 4);
});

test('thoughts that name it, outputs that used it (with the version) and the source are in the same place', () => {
  const a = aroundOf({
    ...base, objectId: 'x',
    thoughts: [{ text: 'آیا باید @«عنوان x» را عوض کنیم؟', key: 't1', nodeId: 'n' }, { text: 'بی‌ربط', key: 't2', nodeId: 'n' }, { text: 'نوشته‌شده با شناسه', key: 't3', nodeId: 'n', aboutObjectIds: ['x'] }],
    notes: [{ id: 'note1', nodeId: 'n', content: 'قیمت را بررسی کن' }],
    deliverables: [{ id: 'd1', title: 'متن تبلیغ', usedContext: [{ id: 'x', version: 0 }] }, { id: 'd2', title: 'بایگانی‌شده', usedContext: [{ id: 'x', version: 1 }], archivedAt: '2026-01-01' }],
  });
  assert.equal(group(a, 'thoughts').items.length, 2);
  assert.equal(group(a, 'thoughts').items[0].text, 'آیا باید را عوض کنیم؟');
  assert.deepEqual(group(a, 'outputs').items.map((i) => i.target), [{ type: 'output', deliverableId: 'd1' }]);
  assert.match(group(a, 'outputs').items[0].text, /نسخهٔ 0|نسخه/);
  assert.equal(group(a, 'source').items.length, 1);
  assert.deepEqual(group(a, 'source').items[0].target, { type: 'note', noteId: 'note1', nodeId: 'n' });
});

test('a lone piece of knowledge has four empty groups with a sentence each, and an unknown id has none', () => {
  const a = aroundOf({ ...base, objectId: 'd' });
  assert.equal(a.groups.length, 4);
  assert.equal(group(a, 'outputs').items.length, 0);
  assert.ok(group(a, 'outputs').empty.length > 5);
  assert.deepEqual(aroundOf({ ...base, objectId: 'nope' }), { groups: [], total: 0 });
});

test('related (semantic) is OFF by default: no provider → null; a provider only ever adds live, other, not-yet-connected knowledge', async () => {
  const me = objects[0];
  assert.equal(await relatedFor(me, objects, new Set()), null);
  const off = registerSlotProvider('related', async () => [
    { slot: 'related', targetId: 'a', label: 'خودش' },
    { slot: 'related', targetId: 'old', label: 'منسوخ' },
    { slot: 'related', targetId: 'b', label: 'وصل است' },
    { slot: 'related', targetId: 'd', label: 'خوب', score: 0.4 },
    { slot: 'related', targetId: 'x', label: 'بهتر', score: 0.9 },
    { slot: 'place', targetId: 'c', label: 'اسلات دیگر' },
  ]);
  try {
    const got = await relatedFor(me, objects, new Set(['b']));
    assert.deepEqual(got?.map((s) => s.objectId), ['x', 'd']);
  } finally { off(); }
  assert.equal(await relatedFor(me, objects, new Set()), null);
});
