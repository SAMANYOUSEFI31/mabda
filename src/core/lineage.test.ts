import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLineageScene, lineageOf, lineageText } from './lineage';
import { buildScene } from './canvasScene';
import { provenanceOf } from './provenance';
import { connectOptions, connectionUndo } from './connectRules';
import type { ContextObject, ContextRelationship, TreeNode } from '../types';

const nodes: TreeNode[] = [{ id: 'root', label: 'ریشه', description: '' }, { id: 'sub', label: 'اشتراک', description: '', parentId: 'root' }, { id: 'gift', label: 'هدیه', description: '', parentId: 'sub' }];
const obj = (id: string, nodeId = 'root', p: Partial<ContextObject> = {}): ContextObject => ({ id, workspaceId: 'w', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: id, content: `متن ${id}`, nodeId, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...p });
const dep = (s: string, t: string): ContextRelationship => ({ id: `${s}>${t}`, sourceId: s, targetId: t, type: 'depends_on', createdAt: '' });
// price rests on cost and market; offer rests on price; gift rests on offer; promo rests on gift
const objs = ['cost', 'market', 'price', 'offer', 'gift', 'promo'].map((i) => obj(i));
const rels = [dep('price', 'cost'), dep('price', 'market'), dep('offer', 'price'), dep('gift', 'offer'), dep('promo', 'gift')];

test('lineage: what it rests on and what rests on it, by distance; the rest is counted, not drawn', () => {
  const l = lineageOf({ centerId: 'price', objects: objs, relationships: rels, depth: 1 })!;
  assert.deepEqual(l.upstream, [['cost', 'market']]);
  assert.deepEqual(l.downstream, [['offer']]);
  assert.deepEqual(l.hidden, { upstream: 0, downstream: 2 }, 'gift and promo are further away');
  const l2 = lineageOf({ centerId: 'price', objects: objs, relationships: rels, depth: 2 })!;
  assert.deepEqual(l2.downstream, [['offer'], ['gift']]);
  assert.deepEqual(l2.hidden.downstream, 1);
  assert.equal(lineageOf({ centerId: 'nope', objects: objs, relationships: rels }), undefined);
});

test('the scene puts what it rests on at the START side (right in RTL), what it affects at the end, the center between', () => {
  const s = buildScene('lineage', { nodes, objects: objs, relationships: rels, deliverables: [], notes: [], canvas: { decisions: [], free: [] }, reviewIds: new Set(), staleAssetIds: new Set() }, { centerId: 'price', depth: 2 });
  const x = (id: string) => s.items.find((i) => i.objectId === id)!.x;
  assert.ok(x('cost') > x('price') && x('price') > x('offer') && x('offer') > x('gift'), 'start → end: rests on, the center, affects, then');
  assert.equal(s.items.find((i) => i.objectId === 'price')!.depthFrom, 0);
  assert.equal(s.items.find((i) => i.objectId === 'cost')!.depthFrom, -1);
  assert.equal(s.items.find((i) => i.objectId === 'gift')!.depthFrom, 2);
  // arrows go from the influencer to the influenced
  assert.ok(s.edges.some((e) => e.influencer === 'o:cost' && e.influenced === 'o:price'));
  assert.ok(s.edges.every((e) => s.items.some((i) => i.id === e.influencer) && s.items.some((i) => i.id === e.influenced)));
  // no two cards overlap
  const boxes = s.items.map((i) => `${i.x},${i.y}`);
  assert.equal(new Set(boxes).size, boxes.length);
});

test('a link another path already implies is marked quiet; a cycle does not loop forever', () => {
  const r = [...rels, dep('gift', 'price')]; // gift → price directly, but also through offer
  const l = lineageOf({ centerId: 'price', objects: objs, relationships: r, depth: 3 })!;
  assert.equal(l.links.find((k) => k.from === 'price' && k.to === 'gift')!.redundant, true);
  const cyc = lineageOf({ centerId: 'price', objects: objs, relationships: [...rels, dep('cost', 'offer')], depth: 3 })!;
  assert.ok(cyc.upstream.flat().length > 0 && cyc.downstream.flat().length > 0);
});

test('suggestions are not part of the truth view unless asked; a suggested center says what WOULD need a review if approved', () => {
  const p = obj('draftprice', 'root', { status: 'Proposed' });
  const all = [...objs, p];
  const r = [...rels, dep('draftprice', 'cost'), dep('offer', 'draftprice')];
  assert.deepEqual(lineageOf({ centerId: 'price', objects: all, relationships: r, depth: 1 })!.downstream, [['offer']], 'the suggestion is not drawn');
  const l = lineageOf({ centerId: 'draftprice', objects: all, relationships: r, depth: 1 })!;
  assert.deepEqual(l.ifApproved.sort(), ['gift', 'offer', 'promo'], 'everything downstream, at any depth');
  const s = buildLineageScene({ objects: all, relationships: r, reviewIds: new Set() }, { centerId: 'draftprice', depth: 1 });
  assert.equal(s.items.find((i) => i.objectId === 'offer')!.ifApproved, true);
  assert.equal(s.items.find((i) => i.objectId === 'cost')!.ifApproved, undefined);
  // confirmed knowledge with an unapproved rewrite counts as «not approved» too
  const withDraft = objs.map((o) => (o.id === 'price' ? { ...o, draft: { content: 'x', at: '' } as never } : o));
  assert.ok(lineageOf({ centerId: 'price', objects: withDraft, relationships: rels, depth: 1 })!.ifApproved.includes('offer'));
  assert.deepEqual(lineageOf({ centerId: 'price', objects: objs, relationships: rels })!.ifApproved, [], 'a confirmed center asks nothing');
});

test('the text equivalent for a screen reader and phones', () => {
  const l = lineageOf({ centerId: 'price', objects: objs, relationships: rels, depth: 2 })!;
  const t = lineageText(l, (id) => `«${id}»`);
  assert.deepEqual(t.rests, ['«cost»', '«market»']);
  assert.deepEqual(t.affects, ['«offer»', '«gift» (غیرمستقیم)']);
});

// ── provenance ──
test('provenance: the thought it came from, the source, what it replaced, what replaced it, the outputs — only what exists', () => {
  const thought = obj('k', 'root', { source: { kind: 'note', noteId: 'n1', quote: 'قیمت اشتراک ماهانه بشود ۲۹۰' } as never });
  const old = obj('old', 'root', { status: 'Superseded' });
  const neu = obj('neu', 'root', { status: 'Confirmed' });
  const note = { id: 'n1', nodeId: 'sub', content: '[ایده] قیمت اشتراک ماهانه بشود ۲۹۰' };
  const sup = (s: string, t: string): ContextRelationship => ({ id: `${s}s${t}`, sourceId: s, targetId: t, type: 'supersedes', createdAt: '' });
  const p = provenanceOf({ objectId: 'k', objects: [thought, old, neu], relationships: [sup('k', 'old'), sup('neu', 'k')], notes: [note], deliverables: [{ id: 'd1', title: 'صفحهٔ فروش', usedContext: [{ id: 'k', version: 1 }] }, { id: 'd2', title: 'قدیمی', usedContext: [{ id: 'k', version: 1 }], archivedAt: 'x' }, { id: 'd3', title: 'نامربوط', usedContext: [{ id: 'zzz', version: 1 }] }] as never });
  assert.deepEqual(p.links.map((l) => l.kind), ['thought', 'replaced', 'replacedBy', 'output']);
  assert.match(p.links[0].text, /قیمت اشتراک ماهانه/);
  assert.deepEqual(p.links[0].target, { type: 'note', noteId: 'n1', nodeId: 'sub' });
  assert.deepEqual(p.links[1].target, { type: 'object', objectId: 'old' });
  assert.deepEqual(p.counts, { outputs: 1, replaced: 1 });
  const none = provenanceOf({ objectId: 'old', objects: [old], relationships: [], notes: [], deliverables: [] });
  assert.deepEqual(none.links, [], 'nothing invented');
});

test('provenance: a note that is gone is said so; an AI source names itself; an older version used by an output is flagged', () => {
  const gone = provenanceOf({ objectId: 'a', objects: [obj('a', 'root', { source: { kind: 'note', noteId: 'missing' } as never })], relationships: [], notes: [], deliverables: [] });
  assert.match(gone.links[0].text, /دیگر نیست/);
  const ai = provenanceOf({ objectId: 'b', objects: [obj('b', 'root', { source: { kind: 'mcp', label: 'Claude' } as never, version: 3 })], relationships: [], notes: [], deliverables: [{ id: 'd', title: 'خروجی', usedContext: [{ id: 'b', version: 2 }] }] as never });
  assert.match(ai.links[0].text, /AI بیرونی \(«Claude»\)/);
  assert.match(ai.links[1].text, /نسخهٔ 2/);
});

// ── connect tool ──
const A = obj('A', 'gift'), B = obj('B', 'sub'), C = obj('C', 'root');
test('connect: the four sentences with both titles and the right direction', () => {
  const o = connectOptions(A, B, nodes, [], [A, B]);
  assert.deepEqual(o.map((x) => x.choice), ['relies', 'affects', 'replaces', 'exception']);
  assert.deepEqual([o[0].fromId, o[0].toId], ['A', 'B'], 'A rests on B: source A, target B');
  assert.deepEqual([o[1].fromId, o[1].toId], ['B', 'A'], 'A affects B = B rests on A');
  assert.match(o[0].label, /«A» بر «B» تکیه دارد/);
  assert.match(o[1].label, /«A» روی «B» اثر دارد/);
  assert.equal(o[0].type, 'depends_on'); assert.equal(o[2].type, 'supersedes'); assert.equal(o[3].type, 'overrides');
});

test('connect: «استثنا» only when A is below B; a self link, an existing one, a dead one are refused; a cycle is NOT refused', () => {
  assert.ok(!connectOptions(B, A, nodes, [], [A, B]).some((x) => x.choice === 'exception'), 'B is above A: no exception button at all');
  assert.ok(!connectOptions(A, A, nodes, [], [A]).some((x) => x.choice === 'exception'));
  assert.match(connectOptions(A, A, nodes, [], [A])[0].blocked!, /به خودش/);
  const have = connectOptions(A, B, nodes, [dep('A', 'B')], [A, B]);
  assert.match(have[0].blocked!, /لازم نیست/);
  assert.equal(have[1].blocked, undefined, 'the other direction is a cycle, which is allowed');
  assert.match(have[1].note!, /با هم تصمیم گرفته می‌شوند/);
  const dead = connectOptions(A, obj('D', 'sub', { status: 'Archived' }), nodes, [], [A]);
  assert.ok(dead.every((x) => x.blocked));
  const rep = connectOptions(A, C, nodes, [], [A, C]).find((x) => x.choice === 'replaces')!;
  assert.equal(rep.blocked, undefined);
  assert.match(connectOptions(A, obj('F', 'sub', { type: 'Fact' }), nodes, [], [A]).find((x) => x.choice === 'replaces')!.blocked!, /همان نوع/);
});

test('connect: an indirect duplicate and an unapproved end only add a note; nothing here ever creates a relation', () => {
  const objectsAll = [obj('A'), obj('M'), obj('Z')];
  const rs = [dep('A', 'M'), dep('M', 'Z')];
  const o = connectOptions(objectsAll[0], objectsAll[2], nodes, rs, objectsAll);
  assert.equal(o[0].blocked, undefined);
  assert.match(o[0].note!, /لازم نیست؛ از راه «M»/);
  const pend = connectOptions(obj('P', 'root', { status: 'Proposed' }), C, nodes, [], [obj('P'), C]);
  assert.match(pend[0].note!, /پیشنهادی می‌ماند/);
  const snap = JSON.stringify(rs);
  connectOptions(A, B, nodes, rs, [A, B]);
  assert.equal(JSON.stringify(rs), snap);
  assert.deepEqual(connectionUndo({ type: 'depends_on', fromId: 'A', toId: 'Z' }, rs), { type: 'setDependencies', objectId: 'A', targetIds: ['M'] });
  assert.deepEqual(connectionUndo({ type: 'overrides', fromId: 'A', toId: 'B' }, rs), { type: 'removeRelation', relType: 'overrides', fromId: 'A', toId: 'B' });
});
