import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapModel, CARD_W, GAP_X, highlightOf, impactOf, latestChangedObject, visibleVertices } from './mapModel';
import type { ContextChange, ContextObject, ContextRelationship, GeneratedDeliverable, TreeNode } from '../types';

const node = (id: string, parentId?: string, order = 0): TreeNode => ({ id, label: `بخش ${id}`, description: '', ...(parentId ? { parentId } : {}), order });
const obj = (id: string, nodeId: string, o: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: `مورد ${id}`, content: id, nodeId, version: 1, createdAt: '', updatedAt: '', ...o });
const rel = (type: ContextRelationship['type'], s: string, t: string): ContextRelationship => ({ id: `${type}${s}${t}`, sourceId: s, targetId: t, type, createdAt: '' });
const asset = (id: string, used: string[]): GeneratedDeliverable => ({ id, title: `خروجی ${id}`, usedContext: used.map((u) => ({ id: u, version: 1 })) } as unknown as GeneratedDeliverable);
const base = { nodes: [node('root'), node('a', 'root', 1), node('b', 'root', 2)], objects: [obj('a1', 'a'), obj('a2', 'a'), obj('b1', 'b')], relationships: [rel('depends_on', 'b1', 'a1'), rel('depends_on', 'a2', 'a1')], deliverables: [asset('x', ['b1'])] };
const v = (m: ReturnType<typeof buildMapModel>, id: string) => m.vertices.find((x) => x.id === id)!;

test('a small workspace is expanded: only FLOW edges (dependency / lineage), labelled in Persian; the tree is boxes, never an edge', () => {
  const m = buildMapModel(base);
  assert.deepEqual(m.vertices.map((x) => x.kind).filter((k, i, a) => a.indexOf(k) === i).sort(), ['asset', 'object']);
  assert.ok(m.edges.every((e) => e.kind !== ('structural' as string)), 'no structural edge exists any more');
  const kinds = (k: string) => m.edges.filter((e) => e.kind === k).length;
  assert.deepEqual([kinds('dependency'), kinds('lineage')], [2, 1]);
  const dep = m.edges.find((e) => e.kind === 'dependency' && e.from === 'o:b1')!;
  assert.deepEqual([dep.to, dep.label], ['o:a1', 'وابسته به']);
  assert.equal(m.edges.find((e) => e.kind === 'lineage')!.label, 'ساخته‌شده از');
});

test('layers come only from dependency / lineage / supersedes: two sibling nodes with no dependency share a layer; a dependency chain orders right → left (RTL)', () => {
  const free = buildMapModel({ nodes: base.nodes, objects: [obj('p', 'a'), obj('q', 'b')], relationships: [], deliverables: [] });
  assert.equal(v(free, 'o:p').layer, v(free, 'o:q').layer, 'siblings are not ordered');
  assert.equal(v(free, 'o:p').x, v(free, 'o:q').x, 'same layer = same column; the tree gives no left/right');
  assert.notEqual(v(free, 'o:p').y, v(free, 'o:q').y, 'they are stacked, not chained');
  const m = buildMapModel(base);
  assert.ok(v(m, 'o:a1').layer < v(m, 'o:b1').layer && v(m, 'o:b1').layer < v(m, 'a:x').layer);
  assert.ok(v(m, 'o:a1').x > v(m, 'o:b1').x && v(m, 'o:b1').x > v(m, 'a:x').x, 'RTL: the depended-on object sits furthest right, the output furthest left');
  assert.equal(v(m, 'o:a1').x - v(m, 'o:b1').x, CARD_W + GAP_X);
  assert.equal(v(m, 'o:a2').layer, v(m, 'o:b1').layer, 'two things that rest on a1 share a layer');
  assert.ok(m.vertices.every((x) => x.x >= 0 && x.y >= 0 && x.x + x.w <= m.width && x.y + x.h <= m.height));
  // the nesting of the tree changes nothing about layers
  const deeper = buildMapModel({ ...base, nodes: [node('root'), node('a', 'root', 1), node('b', 'a', 2)] });
  assert.deepEqual(['o:a1', 'o:a2', 'o:b1', 'a:x'].map((id) => v(deeper, id).layer), ['o:a1', 'o:a2', 'o:b1', 'a:x'].map((id) => v(m, id).layer));
});

test('the tree is drawn as grouping boxes: a box contains its objects and its sub-nodes\' boxes; sibling boxes do not overlap', () => {
  const m = buildMapModel(base);
  const g = (id: string) => m.groups.find((x) => x.nodeId === id)!;
  assert.deepEqual(m.groups.map((x) => [x.nodeId, x.depth]).sort(), [['a', 1], ['b', 1], ['root', 0]]);
  const inside = (outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
  assert.ok(inside(g('root'), g('a')) && inside(g('root'), g('b')));
  for (const id of ['a1', 'a2']) assert.ok(inside(g('a'), v(m, `o:${id}`)), `${id} is inside its node's box`);
  assert.ok(inside(g('b'), v(m, 'o:b1')));
  assert.ok(g('a').y + g('a').h <= g('b').y || g('b').y + g('b').h <= g('a').y, 'sibling boxes are stacked');
  assert.ok(!inside(g('a'), v(m, 'o:b1')), 'an object is in its own node box only');
  assert.ok(v(m, 'a:x').y >= g('root').y + g('root').h, 'assets sit outside every box');
  assert.ok(m.groups.every((x) => x.x >= 0 && x.y >= 0 && x.x + x.w <= m.width && x.y + x.h <= m.height));
});

test('a cycle of dependencies does not break the layout (members share a layer)', () => {
  const m = buildMapModel({ ...base, relationships: [rel('depends_on', 'a1', 'a2'), rel('depends_on', 'a2', 'a1')] });
  assert.equal(v(m, 'o:a1').layer, v(m, 'o:a2').layer);
});

test('collapsed nodes stand for their objects: counts, merged edges with a count, no self-edges', () => {
  const m = buildMapModel(base, { expanded: new Set() });
  assert.equal(m.vertices.filter((x) => x.kind === 'object').length, 0);
  assert.equal(v(m, 'n:a').count, 2);
  assert.equal(m.rep['o:a2'], 'n:a');
  const dep = m.edges.filter((e) => e.kind === 'dependency');
  assert.deepEqual(dep.map((e) => [e.from, e.to, e.count]), [['n:b', 'n:a', 1]], 'a2→a1 is inside one group and disappears; b1→a1 becomes b→a');
  assert.deepEqual(m.edges.find((e) => e.kind === 'lineage'), { id: 'lineage|a:x|n:b', from: 'a:x', to: 'n:b', kind: 'lineage', label: 'ساخته‌شده از', count: 1, influencer: 'n:b', influenced: 'a:x' });
  assert.equal(m.summary.collapsedNodes, 2);
  const one = buildMapModel(base, { expanded: new Set(['a']) });
  assert.ok(one.vertices.some((x) => x.id === 'o:a1') && !one.vertices.some((x) => x.id === 'o:b1'));
});

test('superseded objects are hidden unless history is shown; assets can be hidden or clustered', () => {
  const objs = [...base.objects, obj('old', 'a', { status: 'Superseded' })];
  const rels = [...base.relationships, rel('supersedes', 'a1', 'old')];
  assert.ok(!buildMapModel({ ...base, objects: objs, relationships: rels }).vertices.some((x) => x.id === 'o:old'));
  const h = buildMapModel({ ...base, objects: objs, relationships: rels }, { includeHistory: true });
  assert.equal(h.edges.find((e) => e.kind === 'supersedes')!.label, 'جایگزین کرد');
  const sup = h.edges.find((e) => e.kind === 'supersedes')!;
  assert.deepEqual([sup.influencer, sup.influenced], ['o:a1', 'o:old'], 'the new one acts on the old one');
  const dep = h.edges.find((e) => e.kind === 'dependency')!;
  assert.deepEqual([dep.influencer, dep.influenced], [dep.to, dep.from], 'a dependency is drawn from the depended-on to the dependent');
  assert.ok(!buildMapModel(base, { showAssets: false }).vertices.some((x) => x.kind === 'asset'));
  const c = buildMapModel(base, { assetClusterAbove: 0 });
  assert.deepEqual([c.vertices.some((x) => x.kind === 'assets'), c.rep['a:x']], [true, 'assets']);
});

test('impactOf: the object, its transitive dependents and the assets built from any of them; highlight follows collapsed groups', () => {
  const imp = impactOf(base, 'a1');
  assert.deepEqual([...imp.objectIds].sort(), ['a1', 'a2', 'b1']);
  assert.deepEqual([...imp.assetIds], ['x']);
  assert.deepEqual([...impactOf(base, 'b1').objectIds], ['b1']);
  const m = buildMapModel(base);
  const h = highlightOf(m, imp);
  assert.ok(h.vertexIds.has('o:b1') && h.vertexIds.has('a:x') && !h.vertexIds.has('n:root'));
  assert.ok(h.edgeIds.size >= 3 && [...h.edgeIds].every((id) => /^(dependency|lineage|supersedes)\|/.test(id)));
  const collapsed = highlightOf(buildMapModel(base, { expanded: new Set() }), imp);
  assert.deepEqual([...collapsed.vertexIds].sort(), ['a:x', 'n:a', 'n:b']);
});

test('review flags are carried; latestChangedObject picks the newest content change only', () => {
  const m = buildMapModel({ ...base, reviewObjectIds: new Set(['b1']), staleAssetIds: new Set(['x']) });
  assert.deepEqual([v(m, 'o:b1').review, v(m, 'o:a1').review, v(m, 'a:x').review], [true, false, true]);
  const c = (id: string, objectId: string, at: string, kind: ContextChange['kind'], after?: Record<string, unknown>): ContextChange => ({ id, workspaceId: 'w', objectId, fromVersion: 1, toVersion: 2, kind, actor: 'user', at, ...(after ? { after } : {}) });
  assert.equal(latestChangedObject([c('1', 'a1', '2026-01-01', 'edited', { content: 'x' }), c('2', 'b1', '2026-01-02', 'edited', { content: 'y' }), c('3', 'a2', '2026-01-03', 'edited', { nodeId: 'b' }), c('4', 'a2', '2026-01-04', 'review_accepted')]), 'b1');
  assert.equal(latestChangedObject([]), undefined);
});

test('8000 objects: collapsed it is a handful of cards; one expanded node of 2000 lays out fast and culling keeps the drawn set small', () => {
  const nodes = [node('root'), ...Array.from({ length: 40 }, (_, i) => node(`n${i}`, 'root', i))];
  const objects = Array.from({ length: 8000 }, (_, i) => obj(`o${i}`, `n${i % 40}`));
  const relationships = objects.filter((_, i) => i >= 40).map((o, i) => rel('depends_on', o.id, `o${i}`)); // long chains
  const deliverables = Array.from({ length: 300 }, (_, i) => asset(`d${i}`, [`o${i * 20}`, `o${i * 20 + 1}`]));
  let t0 = Date.now();
  const closed = buildMapModel({ nodes, objects, relationships, deliverables });
  assert.ok(Date.now() - t0 < 1500, `collapsed layout took ${Date.now() - t0}ms`);
  assert.ok(closed.vertices.length < 60, `${closed.vertices.length} cards`);
  t0 = Date.now();
  const open = buildMapModel({ nodes, objects, relationships, deliverables }, { expanded: new Set(['n0']) });
  assert.ok(Date.now() - t0 < 2500, `expanded layout took ${Date.now() - t0}ms`);
  assert.ok(open.vertices.filter((x) => x.kind === 'object').length === 200);
  const all = buildMapModel({ nodes, objects: objects.slice(0, 3000), relationships: [], deliverables: [] }, { expanded: new Set(nodes.map((n) => n.id)) });
  t0 = Date.now();
  const seen = visibleVertices(all, { x: 0, y: 0, w: 1200, h: 800 });
  assert.ok(Date.now() - t0 < 100 && seen.length < 200, `${seen.length} visible`);
});

test('groupBy: dependency = no boxes, columns from depends_on alone; facet = one swimlane per facet (first facet, «بدون بُعد» last); status = one lane per status; domain stays the default', () => {
  const objs = [obj('a1', 'a', { facets: ['مخاطب سازمانی'] }), obj('a2', 'a', { facets: ['فصل پاییز', 'مخاطب سازمانی'] }), obj('b1', 'b'), obj('p', 'b', { status: 'Proposed', facets: ['مخاطب سازمانی'] })];
  const input = { ...base, objects: objs, deliverables: [] };
  const dom = buildMapModel(input);
  assert.deepEqual([dom.groupBy, dom.groups.length > 0], ['domain', true]);

  const dep = buildMapModel(input, { groupBy: 'dependency' });
  assert.equal(dep.groups.length, 0, 'no boxes');
  assert.deepEqual(['a1', 'a2', 'b1'].map((id) => v(dep, `o:${id}`).layer), ['a1', 'a2', 'b1'].map((id) => v(dom, `o:${id}`).layer), 'the columns do not depend on the grouping');
  assert.ok(!dep.vertices.some((x) => x.kind === 'node'), 'no node cards: every object is listed');

  const fac = buildMapModel(input, { groupBy: 'facet' });
  assert.deepEqual(fac.groups.map((g) => g.label), ['مخاطب سازمانی', 'فصل پاییز', 'بدون بُعد'].sort((a, b) => (a === 'بدون بُعد' ? 1 : b === 'بدون بُعد' ? -1 : a.localeCompare(b))));
  const lane = (label: string) => fac.groups.find((g) => g.label === label)!;
  const inside = (g: { x: number; y: number; w: number; h: number }, id: string) => { const x = v(fac, id); return x.x >= g.x && x.y >= g.y && x.x + x.w <= g.x + g.w && x.y + x.h <= g.y + g.h; };
  assert.ok(inside(lane('مخاطب سازمانی'), 'o:a1') && inside(lane('مخاطب سازمانی'), 'o:p'));
  assert.ok(inside(lane('فصل پاییز'), 'o:a2'), 'a2 sits in its FIRST facet');
  assert.ok(inside(lane('بدون بُعد'), 'o:b1'));
  assert.equal(v(fac, 'o:a2').facet, 'فصل پاییز', 'the vertex carries its first facet for colouring');

  const st = buildMapModel(input, { groupBy: 'status' });
  assert.deepEqual(st.groups.map((g) => g.label), ['تأییدشده', 'پیشنهادی']);
  assert.ok(st.vertices.every((x) => x.kind !== 'object' || x.x >= 0));
  assert.deepEqual(st.edges.map((e) => e.kind).sort(), dom.edges.map((e) => e.kind).sort(), 'edges are the same whatever the grouping');
});
