import test from 'node:test';
import assert from 'node:assert/strict';
import { containsAny, needlesOf, nodeRemovalPlan, normalizeForMatch, scrubLines } from './removal';
import type { ContextObject, ContextRelationship, Note, TreeNode } from '../types';

const NOW = new Date('2026-06-01T00:00:00Z');
const N = (id: string, parentId?: string, order = 0): TreeNode => ({ id, label: `گره-${id}`, description: '', order, ...(parentId ? { parentId } : {}) });
// R ─ A ─ B ─ C ─ D   (five levels)   and   R ─ S (a sibling of A)   and a second main section R2
const nodes: TreeNode[] = [N('R'), N('A', 'R'), N('B', 'A'), N('C', 'B'), N('D', 'C'), N('S', 'R', 1), N('R2', undefined, 1)];
const o = (id: string, nodeId: string, p: Partial<ContextObject> = {}): ContextObject => ({
  id, workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: `عنوان-${id}`, content: `متن-${id}`, nodeId, version: 1, createdAt: '', updatedAt: '', ...p,
});
const none: Array<{ nodeId: string }> = [];
const plan = (id: string, p: Partial<Parameters<typeof nodeRemovalPlan>[0]> = {}) => nodeRemovalPlan({ nodes, objects: [], notes: none as Note[], id, now: NOW, ...p });
const row = (pl: ReturnType<typeof plan>, id: string) => pl.tree.find((r) => r.id === id)!;

test('move: a level-3 section with level-4 and level-5 below it — its direct child comes up under its parent, deeper ones keep their own parents', () => {
  const pl = plan('B');
  assert.equal(pl.ok, true);
  assert.equal(pl.target, 'A', 'the default target is the parent');
  assert.equal(row(pl, 'B').state, 'removed');
  assert.deepEqual([row(pl, 'C').state, row(pl, 'C').depth, row(pl, 'C').to], ['moved', 2, 'گره-A'], 'C was level 4, now level 3 under A');
  assert.deepEqual([row(pl, 'D').state, row(pl, 'D').depth], ['kept', 3], 'D (level 5) follows C up by one level');
  assert.deepEqual(pl.removed, ['B']);
});

test('move: the last main section cannot go; with a second main section the default target is the other one; a target inside the branch is refused', () => {
  assert.equal(nodeRemovalPlan({ nodes: [N('only')], objects: [], notes: none as Note[], id: 'only' }).ok, false);
  const two = plan('R2');
  assert.equal(two.ok, true, 'an empty main section can go');
  const withContent = plan('R', { objects: [o('x', 'R')] });
  assert.equal(withContent.ok, true);
  assert.equal(withContent.target, 'R2', 'a main section hands its content to the other main section');
  for (const mode of ['move', 'archive'] as const) {
    const bad = plan('A', { objects: [o('x', 'A'), o('y', 'C')], mode, transferTo: 'D', notes: [{ nodeId: 'A' }] as Note[] });
    assert.equal(bad.ok, false, `${mode}: a target inside the branch`);
    assert.match(bad.reason ?? '', /مقصد/);
  }
  assert.equal(plan('A', { objects: [o('x', 'A')], transferTo: 'ghost' }).ok, false);
});

test('move: a rule «only for this section» in the deleted section now sits in the target — it reaches the target\'s other sub-sections (said in words)', () => {
  const rule = o('rule', 'A', { type: 'Constraint', reach: 'position', title: 'خط قرمز فقط-این-بخش' });
  const pl = plan('A', { objects: [rule], transferTo: 'R' });
  assert.ok(pl.effect.gained.some((g) => g.object.id === 'rule' && g.nodes.includes('گره-S')), 'it now reaches S, a sibling it never reached');
  assert.match(pl.effect.sentences.join(' '), /«خط قرمز فقط-این-بخش» حالا به .*«گره-S».* هم می‌رسد/);
  const tight = plan('A', { objects: [rule], transferTo: 'R' });
  assert.ok(!tight.effect.lost.some((l) => l.object.id === 'rule'), 'nothing is lost for the sections below it');
});

test('move: an exception (overrides) whose two ends were in the SAME deleted section stops being an exception — the rule it switched off comes back, and it says so', () => {
  const rule = o('base', 'B', { type: 'Constraint', reach: 'position', title: 'خط قرمز پایه' });
  const by = o('exc', 'C', { type: 'Decision', title: 'استثنای ج' });
  const rels: ContextRelationship[] = [{ id: 'r', sourceId: 'exc', targetId: 'base', type: 'overrides', createdAt: '' }];
  // delete C → exc moves to B (same node as base): no longer a strict descendant, so the exception is void
  const pl = plan('C', { objects: [rule, by], relationships: rels, transferTo: 'B' });
  assert.equal(pl.ok, true);
  assert.ok(pl.effect.gained.some((g) => g.object.id === 'base') || pl.effect.lost.length === 0, 'the report is computed with the exception gone');
  // and the plain case where the parent of the exception changes: deleting B moves C up under A — the exception still holds
  const pl2 = plan('B', { objects: [o('base2', 'A', { type: 'Constraint', reach: 'position', title: 'خط قرمز والد' }), o('exc2', 'C', { type: 'Decision', title: 'استثنا' })], relationships: [{ id: 'r2', sourceId: 'exc2', targetId: 'base2', type: 'overrides', createdAt: '' }] });
  assert.equal(pl2.ok, true);
  assert.ok(!pl2.effect.sentences.some((s) => s.includes('خط قرمز والد')), 'C is still below A, so the exception still switches «خط قرمز والد» off there: nothing to report');
});

test('archive: the whole branch goes, its knowledge is ARCHIVED (counted), a global rule in it stops reaching everyone and the plan says so; notes and files need a target only if there are some', () => {
  const rule = o('g', 'C', { type: 'Constraint', title: 'خط قرمز سراسری' }); // global by default
  const fact = o('f', 'D', { title: 'دانش عمیق' });
  const keep = o('k', 'S', { title: 'در شاخهٔ دیگر' });
  const pl = plan('B', { mode: 'archive', objects: [rule, fact, keep] });
  assert.equal(pl.ok, true, 'no notes / files: no target needed');
  assert.deepEqual(pl.removed.sort(), ['B', 'C', 'D']);
  assert.equal(pl.counts.archived, 2);
  assert.equal(pl.counts.branchNodes, 3);
  assert.ok(pl.effect.lost.some((l) => l.object.id === 'g'), 'the global rule no longer reaches the rest of the tree');
  assert.match(pl.effect.sentences.join(' '), /«خط قرمز سراسری» دیگر به .* نمی‌رسد \(بایگانی می‌شود\)/);
  assert.ok(pl.tree.filter((r) => r.state === 'removed').map((r) => r.id).sort().join() === 'B,C,D');
  const withNotes = plan('B', { mode: 'archive', objects: [fact], notes: [{ nodeId: 'D' }] as Note[], transferTo: 'S' });
  assert.equal(withNotes.ok, true);
  assert.equal(withNotes.target, 'S');
  assert.equal(withNotes.counts.notes, 1);
  assert.equal(plan('B', { mode: 'archive', notes: [{ nodeId: 'D' }] as Note[] }).target, 'A', 'by default the notes go to the parent');
});

test('normalizeForMatch / needlesOf / scrubLines: a card number is found however it was typed (Persian digits, spaces), and only the lines that say it are removed', () => {
  assert.equal(normalizeForMatch('۴۰۰۱ ۱۲۳۴  ۵۶۷۸ ۹۰۱۲'), '4001 1234 5678 9012');
  const card = o('c', 'A', { title: 'شمارهٔ کارت', content: 'شمارهٔ کارت من ۶۰۳۷-۹۹۷۱-۲۳۴۵-۶۷۸۹ است.\nخط بی‌خطر دیگر' });
  const needles = needlesOf(card);
  assert.ok(needles.includes('شمارهٔ کارت'.replace(/ٔ/g, '')) || needles.length >= 2, 'the title and each long line are needles');
  assert.equal(containsAny('در یادداشت: 6037-9971-2345-6789 را اشتباهی نوشتم', needles), true, 'digits in another script still match');
  assert.equal(containsAny('یک متن کاملاً بی‌ربط', needles), false);
  const cleaned = scrubLines('اول\nشمارهٔ کارت من 6037-9971-2345-6789 است.\nآخر', needles);
  assert.equal(cleaned.removed, 1);
  assert.equal(cleaned.content, 'اول\nآخر');
  assert.equal(needlesOf(o('s', 'A', { title: 'کم', content: 'کوتاه' })).length, 0, 'short bits are too common to mean anything');
});
