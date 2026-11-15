/**
 * CORE-05/06/07: a contradiction needs two VALID items that GOVERN the same place; domain rules come from a rule pack.
 * The cases marked «before» were wrong before this change (the rule engine compared every pair, whatever its section,
 * expiry or exception).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectContradictions, calculateReadinessAndGaps } from './contextEngine';
import { candidatePairs, unresolvedContradictions, pairKey } from './contradictionCandidates';
import { governanceOf } from './coGoverning';
import type { RulePack } from './contradictionRules';
import type { ContextObject, ContextRelationship, TreeNode, WorkstreamSpec } from '../types';

const NODES: TreeNode[] = [
  { id: 'root', label: 'همه', description: '' },
  { id: 'shop', label: 'فروشگاه', description: '', parentId: 'root' },
  { id: 'shop_vip', label: 'مشتری ویژه', description: '', parentId: 'shop' },
  { id: 'home', label: 'پروژهٔ شخصی', description: '', parentId: 'root' },
];
const NOW = new Date('2026-11-15T09:00:00Z');
const o = (id: string, p: Partial<ContextObject>): ContextObject => ({ id, workspaceId: 'w', type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'تخفیف', content: '', nodeId: 'shop', version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...p });
const noDiscount = (p: Partial<ContextObject> = {}) => o('nd', { type: 'Decision', content: 'تخفیف نداریم', ...p });
const discount = (p: Partial<ContextObject> = {}) => o('d', { content: 'تخفیف ۲۰٪ برای خرید اول', ...p });
const keys = (cs: Array<{ itemA: ContextObject; itemB: ContextObject }>) => cs.map((c) => pairKey(c.itemA.id, c.itemB.id));
const ctx = (relationships: ContextRelationship[] = []) => ({ nodes: NODES, relationships, now: NOW });
const overrides = (sourceId: string, targetId: string): ContextRelationship => ({ id: `r_${sourceId}`, workspaceId: 'w', sourceId, targetId, type: 'overrides', createdAt: '' } as ContextRelationship);

test('two sibling sections never contradict (before: «تخفیف نداریم» in one project flagged a discount in another)', () => {
  assert.deepEqual(keys(detectContradictions([noDiscount({ nodeId: 'home' }), discount({ nodeId: 'shop' })], ctx())), []);
});

test('inherited from a parent section: the parent governs the child, so they contradict', () => {
  assert.deepEqual(keys(detectContradictions([noDiscount({ nodeId: 'shop' }), discount({ nodeId: 'shop_vip' })], ctx())), ['d|nd']);
});

test('a «همه‌جا» red line governs every section, also a sibling one', () => {
  const redLine = noDiscount({ type: 'Constraint', nodeId: 'home' });
  assert.deepEqual(keys(detectContradictions([redLine, discount({ nodeId: 'shop_vip' })], ctx())), ['d|nd']);
  // reach = global on any type is the same
  assert.deepEqual(keys(detectContradictions([noDiscount({ nodeId: 'home', reach: 'global' }), discount()], ctx())), ['d|nd']);
});

test('an exception switches the red line off in its sub-tree only (before: the excepted pair was still flagged)', () => {
  const redLine = noDiscount({ type: 'Constraint', nodeId: 'root' });
  const vipRule = o('vip', { nodeId: 'shop_vip', title: 'مشتری ویژه', content: 'برای مشتری ویژه قاعدهٔ دیگری داریم' });
  const rel = [overrides('vip', 'nd')];
  assert.deepEqual(keys(detectContradictions([redLine, vipRule, discount({ nodeId: 'shop_vip' })], ctx(rel))), []);
  assert.deepEqual(keys(detectContradictions([redLine, vipRule, discount({ nodeId: 'shop' })], ctx(rel))), ['d|nd'], 'outside the exception it still governs');
  // an exception that has itself expired switches nothing off
  assert.deepEqual(keys(detectContradictions([redLine, { ...vipRule, validUntil: '2026-11-01' }, discount({ nodeId: 'shop_vip' })], ctx(rel))), ['d|nd']);
});

test('expired knowledge contradicts nothing (before: an expired «تخفیف نداریم» still flagged every discount)', () => {
  assert.deepEqual(keys(detectContradictions([noDiscount({ validUntil: '2026-11-14' }), discount()], ctx())), []);
  assert.deepEqual(keys(detectContradictions([noDiscount({ validUntil: '2026-11-15' }), discount()], ctx())), ['d|nd'], 'valid through the end of its day');
  // the semantic candidates and an earlier verdict follow the same rule
  const a = o('a', { title: 'قیمت اشتراک', content: 'قیمت ۴ میلیون تومان', validUntil: '2026-11-01' });
  const b = o('b', { title: 'قیمت اشتراک', content: 'قیمت ۶ میلیون تومان' });
  assert.equal(candidatePairs([a, b], 10, [], NODES, NOW).length, 0);
  const verdict = { key: pairKey('a', 'b'), aVersion: 1, bVersion: 1, conflict: true, reason: 'x' };
  assert.equal(unresolvedContradictions([{ ...a, content: 'الف' }, { ...b, content: 'ب' }], [verdict], ctx()).length, 0);
});

test('CORE-07: the «تخفیف نداریم» rule lives in a replaceable pack', () => {
  const pair = [noDiscount(), discount()];
  assert.equal(detectContradictions(pair, { ...ctx(), rules: [] }).length, 0, 'without the pricing pack the engine knows nothing about discounts');
  const delivery: RulePack = [{ id: 'no_weekend', says: /جمعه ارسال نداریم/, contradictedBy: /ارسال جمعه/, reason: 'r', suggestedResolution: 's' }];
  const found = detectContradictions([o('x', { title: 'ارسال', content: 'جمعه ارسال نداریم' }), o('y', { title: 'ارسال', content: 'ارسال جمعه با هزینهٔ بیشتر' })], { ...ctx(), rules: delivery });
  assert.deepEqual(found.map((c) => c.reason), ['r']);
  assert.equal(detectContradictions(pair, ctx()).length, 1, 'the default pack still finds it');
});

test('CORE-05: an expired item does not fill a gap', () => {
  const spec: WorkstreamSpec = { id: 's', title: 's', target: 't', description: '', requiredContext: [{ key: 'price', label: 'قیمت', description: '', nodeId: 'shop' }], suggestedContext: [] } as unknown as WorkstreamSpec;
  const price = o('p', { title: 'قیمت', content: '۴ میلیون', slotKey: 'price', validUntil: '2026-11-10' });
  const r = calculateReadinessAndGaps(spec, [price], [], {}, NOW);
  assert.equal(r.gaps.some((g) => g.importance === 'required'), true, 'before: the expired price counted as filled');
  assert.equal(calculateReadinessAndGaps(spec, [{ ...price, validUntil: undefined }], [], {}, NOW).gaps.filter((g) => g.importance === 'required').length, 0);
});

test('governance is computed once and stays cheap', () => {
  const g = governanceOf({ objects: [], nodes: NODES, now: NOW });
  assert.equal(g(o('a', { nodeId: 'shop' }), o('b', { nodeId: 'home' })), false);
  assert.equal(g(o('a', { nodeId: 'root' }), o('b', { nodeId: 'shop_vip' })), true);
});

test('UX-04: the «تناقض» marker and the counter read the same list (before: a pair the person resolved stayed marked)', async () => {
  const { conflictPartners } = await import('./displayState');
  const objs = [noDiscount(), discount()];
  const resolved = [{ key: pairKey('d', 'nd'), aVersion: 1, bVersion: 1, conflict: true, reason: 'x', resolution: 'separated' }];
  const unresolved = unresolvedContradictions(objs, resolved, ctx());
  assert.equal(unresolved.length, 0, 'the counter says none');
  assert.equal(conflictPartners(objs, unresolved).size, 0, 'and so does the marker');
  assert.equal(conflictPartners(objs).size, 2, 'the rules alone (the old marker) still saw a conflict');
  // a semantic verdict is counted AND marked
  const a = o('a', { title: 'قیمت', content: 'الف' }), b = o('b', { title: 'قیمت', content: 'ب' });
  const sem = unresolvedContradictions([a, b], [{ key: pairKey('a', 'b'), aVersion: 1, bVersion: 1, conflict: true, reason: 'x' }], ctx());
  assert.equal(conflictPartners([a, b], sem).size, 2);
});
