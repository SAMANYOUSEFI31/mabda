import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo, tehranAt } from './demoData';
import { calculateReadinessAndGaps, detectContradictions } from './contextEngine';
import { candidatePairs, unresolvedContradictions } from './contradictionCandidates';
import { flipFlops, needsReview, planDecisions, waitingDecisions } from './decisionGraph';
import { computeStaleAssets } from './impactEngine';
import { buildWeeklyReview } from './weeklyReview';
import { buildChangeDigest } from './changeDigest';
import { buildMapModel } from './mapModel';
import { buildCanvasModel } from './canvasModel';
import { DEFAULT_TREE_NODES } from './specs';

const NOW = new Date('2026-03-10T08:00:00Z'); // 11:30 in Tehran
const d = buildDemo(NOW);
const byId = new Map(d.objects.map((o) => [o.id, o]));
const gaps = (specId: string) => calculateReadinessAndGaps(d.specs.find((s) => s.id === specId)!, d.objects, d.relationships);

test('tehranAt: relative to «today in Tehran», fixed Tehran wall-clock hour (UTC+3:30)', () => {
  assert.equal(tehranAt(NOW, 0, 10, 0), '2026-03-10T06:30:00.000Z');
  assert.equal(tehranAt(NOW, 3, 9, 30), '2026-03-07T06:00:00.000Z');
  // 23:00 UTC is already the next day in Tehran
  assert.equal(tehranAt(new Date('2026-03-10T23:00:00Z'), 0, 10, 0), '2026-03-11T06:30:00.000Z');
});

test('every date is relative to now: nothing is in the future, and shifting `now` shifts everything by the same amount', () => {
  const all = [...d.objects.flatMap((o) => [o.createdAt, o.updatedAt]), ...d.changes.map((c) => c.at), ...d.deliverables.map((x) => x.createdAt), ...d.notes.map((n) => n.createdAt)];
  assert.ok(all.every((t) => t <= NOW.toISOString()), 'no future dates');
  const later = buildDemo(new Date(NOW.getTime() + 5 * 86_400_000));
  assert.equal(new Date(later.objects[0].createdAt).getTime() - new Date(d.objects[0].createdAt).getTime(), 5 * 86_400_000);
});

test('tree: four levels deep, user nodes under product and offer (subscription, workshop, support, content)', () => {
  const nodes = [...DEFAULT_TREE_NODES, ...d.nodes];
  const depth = (id: string): number => { const n = nodes.find((x) => x.id === id)!; return n.parentId ? 1 + depth(n.parentId) : 1; };
  assert.ok(Math.max(...d.nodes.map((n) => depth(n.id))) >= 4);
  assert.equal(d.nodes.find((n) => n.id === 'dn_sub')!.parentId, 'product');
  assert.equal(d.nodes.find((n) => n.id === 'dn_ws')!.parentId, 'offer');
  assert.ok(d.objects.every((o) => nodes.some((n) => n.id === o.nodeId)), 'every object lives in a real node');
});

test('objects: all three types in every status; Proposed come from mcp, chat, coach, import (file) and paste, each with a reason', () => {
  const types = new Set(d.objects.map((o) => o.type));
  assert.deepEqual([...types].sort(), ['Constraint', 'Decision', 'Fact']);
  for (const st of ['Confirmed', 'Proposed', 'Needs Review', 'Superseded', 'Archived'] as const) assert.ok(d.objects.some((o) => o.status === st), st);
  for (const t of ['Fact', 'Decision', 'Constraint'] as const) for (const st of ['Confirmed', 'Proposed'] as const) assert.ok(d.objects.some((o) => o.type === t && o.status === st) || t === 'Constraint', `${t}/${st}`);
  const proposed = d.objects.filter((o) => o.status === 'Proposed');
  assert.deepEqual([...new Set(proposed.map((o) => o.source!.kind))].sort(), ['chat', 'coach', 'file', 'mcp', 'paste']);
  assert.ok(proposed.every((o) => o.source!.reason), 'every suggestion says why');
  assert.ok(proposed.filter((o) => o.source!.kind === 'file' || o.source!.kind === 'paste').every((o) => o.source!.quote), 'imported ones keep their quote');
  assert.ok(d.objects.every((o) => o.status !== 'Proposed' || o.provenance === 'AI Suggested' || o.provenance === 'Imported'), 'no Proposed object pretends to be user input');
  assert.ok(d.objects.every((o) => o.version >= 1 && d.versions.some((v) => v.objectId === o.id && v.version === o.version && v.content === o.content)), 'every current version has its snapshot');
});

test('workstreams: one ready, one with a missing slot, one ambiguous — all from slotKeys and statuses, no AI judgement', () => {
  const intro = gaps('demo_spec_intro'), campaign = gaps('demo_spec_campaign'), cal = gaps('demo_spec_calendar');
  assert.equal(intro.status, 'ready');
  assert.equal(intro.gaps.filter((g) => g.importance === 'required').length, 0);
  assert.deepEqual(campaign.gaps.filter((g) => g.importance === 'required').map((g) => [g.key, g.status]), [['launch_date', 'missing']]);
  assert.deepEqual(cal.gaps.filter((g) => g.importance === 'required').map((g) => [g.key, g.status]), [['content_calendar', 'ambiguous']]);
  assert.ok(d.objects.filter((o) => o.slotKey).every((o) => o.status !== 'Archived'));
});

test('depends_on: a chain, a blocked decision, and the price ↔ package ↔ shipping loop (decided together); one decision replaced 3 times', () => {
  const plan = planDecisions(d.objects, d.relationships);
  assert.deepEqual(plan.groups, [['dm_pack', 'dm_price', 'dm_ship_policy']]);
  const w = waitingDecisions(plan);
  assert.deepEqual(w.concurrent.map((u) => u.ids), [['dm_pack', 'dm_price', 'dm_ship_policy']]);
  assert.deepEqual(w.blocked.map((u) => [u.ids, u.blockedBy]), [[['dm_tg_campaign'], ['dm_tg_budget']]]);
  assert.ok(w.ready.some((u) => u.ids[0] === 'dm_tg_budget'));
  const chain = plan.layers.flat().find((u) => u.ids[0] === 'dm_budget');
  assert.ok(chain && plan.layers.findIndex((l) => l.includes(chain)) > 0, 'budget rests on channel rests on audience');
  assert.deepEqual(flipFlops(d.objects, d.changes), [{ id: 'dm_day4', times: 3 }]);
});

test('contradictions: a numeric price clash (rule) and a «no discount» constraint vs a discount; free vs paid shipping is only a CANDIDATE (no AI verdict is stored)', () => {
  const rule = detectContradictions(d.objects).map((c) => [c.itemA.id, c.itemB.id].sort().join('|'));
  assert.ok(rule.includes('dm_price|dm_price2'));
  assert.ok(rule.includes('dm_discount|dm_nodiscount'));
  const cands = candidatePairs(d.objects, 50).filter((p) => p.reasons.includes('qualifier_differs')).map((p) => p.key);
  assert.ok(cands.includes('dm_ship_cost|dm_ship_policy'), 'رایگان vs هزینه');
  assert.equal(unresolvedContradictions(d.objects, []).filter((c) => c.source === 'semantic').length, 0, 'no semantic verdict is invented');
});

test('review states: the audience edit makes the channel / budget (and the value proposition behind the problem edit) «needs review»; assets: direct effect, dependency, fresh', () => {
  const review = needsReview(d.objects, d.relationships, d.changes);
  assert.deepEqual([...review.keys()].sort(), ['dm_budget', 'dm_channel', 'dm_valueprop']);
  assert.ok(!review.has('dm_pack'), 'dm_pack was reviewed after the price changed');
  const stale = computeStaleAssets(d.deliverables, d.objects, { relationships: d.relationships, changes: d.changes });
  const kinds = Object.fromEntries(stale.map((s) => [s.deliverableId, s.reasons.map((r) => r.kind)]));
  assert.deepEqual(kinds, { dd_campaign: ['dependency_changed'], dd_calendar: ['version_changed'] });
  assert.equal(d.deliverables.length, 3);
  assert.equal(new Set(d.deliverables.map((x) => x.workstreamId)).size, 3, 'one per workstream');
  assert.ok(d.deliverables.every((x) => x.source?.label === 'نمونهٔ دستی' && x.content.includes('هوش مصنوعی نساخته') && !x.plan && !x.usage), 'hand-made, never presented as AI output');
  assert.ok(d.deliverables.every((x) => x.usedContext.every((u) => byId.has(u.id))));
});

test('last week: Changes by user, MCP «Claude», chat, import and coach — with reasons — feed the weekly review and the digest', () => {
  const digest = buildChangeDigest({ changes: d.changes, objects: d.objects, relationships: d.relationships, deliverables: d.deliverables, now: NOW });
  const actors = new Set(digest.groups.map((g) => g.actor));
  for (const a of ['user', 'mcp', 'chat', 'import', 'coach']) assert.ok(actors.has(a as never), a);
  assert.ok(digest.groups.some((g) => g.actor === 'mcp' && g.label === 'Claude'));
  assert.ok(digest.groups.flatMap((g) => g.entries).filter((e) => e.change.actor === 'user' && e.change.reason).length >= 3);
  assert.ok(digest.assetsToReview >= 1);
  const week = buildWeeklyReview({ objects: d.objects, relationships: d.relationships, changes: d.changes, deliverables: d.deliverables, now: NOW });
  assert.ok(week.digest.total > 10 && week.reviews.length === 3 && week.waiting.ready.length === 3 && week.waiting.blocked.length === 1 && week.waiting.concurrent.length === 1);
  // proposals are recorded as created by whoever proposed them; accepted/rejected ones by the user
  assert.ok(d.changes.some((c) => c.kind === 'proposal_rejected' && c.actor === 'user' && c.reason));
  assert.ok(d.changes.every((c) => byId.has(c.objectId)));
});

test('notes, file, boards: free notes with coordinates, a ready text file with a summary, decision-board ranks that point at real objects', () => {
  assert.ok(d.notes.length >= 5 && new Set(d.notes.map((n) => n.nodeId)).size >= 4);
  assert.ok(d.canvas.free.every((i) => d.notes.some((n) => `note:${n.id}` === i.itemRef) && i.x !== undefined && i.y !== undefined));
  assert.ok(d.canvas.decisions.every((i) => byId.has(i.itemRef.slice(4)) && i.rank !== undefined));
  assert.ok(d.file.summary.length > 20 && d.file.chunks.length >= 1 && d.nodes.some((n) => n.id === d.file.nodeId));
});

test('the map and the board lay the showcase out without surprises', () => {
  const m = buildMapModel({ nodes: [...DEFAULT_TREE_NODES, ...d.nodes], objects: d.objects, relationships: d.relationships, deliverables: d.deliverables });
  assert.ok(m.edges.some((e) => e.kind === 'dependency') && m.edges.some((e) => e.kind === 'lineage') && m.edges.some((e) => e.kind === 'structural'));
  const board = buildCanvasModel({ nodes: [...DEFAULT_TREE_NODES, ...d.nodes], objects: d.objects, reviewIds: new Set(needsReview(d.objects, d.relationships, d.changes).keys()), ranks: new Map(d.canvas.decisions.map((i) => [i.itemRef.slice(4), i.rank!])) });
  for (const lane of ['thinking', 'confirmed', 'review'] as const) assert.ok(board.cards.some((c) => c.lane === lane), lane);
});
