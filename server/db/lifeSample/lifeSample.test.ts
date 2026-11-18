/**
 * «زندگی من» (docs/life-sample.md): the story is told through the product's routes, so what the engines read is genuine.
 * Runs on SQLite; with MABDA_TEST_DATABASE_URL set, on Postgres too (openDatabase(':memory:') then makes a fresh schema).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.ts';
import { Repo } from '../repo.ts';
import { applyLifeSample, lifeWorkspaceIdFor } from './index.ts';
import { needsReview } from '../../../src/core/decisionGraph.ts';
import { assumptionsDue, decisionsDue } from '../../../src/core/assumptions.ts';
import { candidatePairs } from '../../../src/core/contradictionCandidates.ts';
import { truthAt, compareTruth, presetMoments } from '../../../src/core/truthCompare.ts';

const NOW = new Date('2026-11-18T09:00:00Z');

test('the long-use sample shows every state through the product\'s own engines', async () => {
  const repo = new Repo(openDatabase(':memory:'));
  const ws = await applyLifeSample(repo, 'u-life', NOW);
  const s = { userId: 'u-life', workspaceId: ws.id };
  const st = repo.state(s);
  const objs = st.objects;
  const has = (f: (o: (typeof objs)[number]) => boolean) => objs.filter(f).length;

  assert.equal(ws.name, 'زندگی من'); assert.equal(ws.purpose, 'personal');
  assert.ok(st.nodes.length >= 30, 'sub-branches at several depths');
  const depth = (id: string): number => { const n = st.nodes.find((x) => x.id === id)!; return n.parentId ? 1 + depth(n.parentId) : 1; };
  assert.ok(Math.max(...st.nodes.map((n) => depth(n.id))) >= 4);
  for (const t of ['Fact', 'Decision', 'Constraint']) assert.ok(has((o) => o.type === t) >= 3, t);
  for (const sName of ['Confirmed', 'Proposed', 'Archived', 'Superseded']) assert.ok(has((o) => o.status === sName) >= 2, sName);
  assert.ok(has((o) => !!o.assumption) >= 3, 'assumptions'); assert.ok(has((o) => !!o.draft) >= 2, 'pending drafts');
  assert.ok(has((o) => o.version >= 3) >= 3, 'confirmed items with several versions');
  assert.ok(st.relationships.some((r) => r.type === 'overrides') && st.relationships.some((r) => r.type === 'supersedes') && st.relationships.some((r) => r.type === 'depends_on'));

  // computed, not written: needs-review, stale outputs, due assumption / decision, contradiction candidates
  assert.ok(needsReview(objs, st.relationships, st.changes).size >= 3);
  assert.ok(st.stale.length >= 2 && st.deliverables.some((d) => d.archivedAt) && st.deliverables.some((d) => !st.stale.some((x) => x.deliverableId === d.id)));
  assert.ok(assumptionsDue(objs, NOW).length >= 1 && decisionsDue(objs, st.changes, NOW).length >= 1);
  assert.ok(candidatePairs(objs, 10, st.relationships, st.nodes, NOW).length >= 3);

  // thoughts of every kind, open and resolved, one whose line was removed and one whose note was removed; placeless ones on the tray
  for (const k of ['idea', 'question', 'assumption', 'open_decision']) assert.ok(st.thoughts.some((t) => t.kind === k && t.status === 'open'), k);
  assert.ok(st.thoughts.some((t) => t.status === 'resolved'));
  assert.ok(st.thoughts.some((t) => t.sourceState === 'line_deleted') && st.thoughts.some((t) => t.sourceState === 'note_deleted'));
  assert.ok(st.notes.some((n) => !st.canvas.free.some((c) => c.itemRef === `note:${n.id}`)), 'notes not placed on the canvas');
  assert.ok(st.canvas.free.length >= 6);

  // history spread over weeks: «هفتهٔ پیش» shows something, and so did the weeks before
  const days = new Set(st.changes.map((c) => c.at.slice(0, 10)));
  assert.ok(days.size >= 20, `${days.size} distinct days`);
  const week = presetMoments(NOW, []).weekAgo;
  const cmp = compareTruth(truthAt({ objects: objs, changes: st.changes }, week), truthAt({ objects: objs, changes: st.changes }, NOW));
  assert.ok(cmp.deltas.length >= 1, 'something changed since last week');
  assert.ok(st.changes.some((c) => Date.parse(c.at) < NOW.getTime() - 50 * 86_400_000));

  assert.ok(st.metrics.length >= 3 && st.measurements.length >= 15);
  assert.ok(repo.listSavedPacks(s).length >= 4 && st.files.length >= 1 && st.weeklyReviewAt);

  // building again replaces the space (the same step as «delete the space, make it again»); another person's data is untouched
  await applyLifeSample(repo, 'u-other', NOW);
  const otherCount = repo.listObjects({ userId: 'u-other', workspaceId: lifeWorkspaceIdFor('u-other') }).length;
  const again = await applyLifeSample(repo, 'u-life', NOW);
  assert.equal(repo.listObjects({ userId: 'u-life', workspaceId: again.id }).length, objs.length);
  assert.equal(repo.listObjects({ userId: 'u-other', workspaceId: lifeWorkspaceIdFor('u-other') }).length, otherCount);
  assert.notEqual(lifeWorkspaceIdFor('u-other'), again.id);
  assert.equal(repo.listWorkspaces('u-life').filter((w) => w.name === 'زندگی من').length, 1);
});
