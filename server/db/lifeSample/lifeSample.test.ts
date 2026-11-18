/**
 * «زندگی من» (docs/life-sample.md): the story is told through the product's routes, so what the engines read is genuine.
 * Runs on SQLite; with MABDA_TEST_DATABASE_URL set, on Postgres too (openDatabase(':memory:') then makes a fresh schema).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.ts';
import { Repo } from '../repo.ts';
import { applyLifeSample, lifeSampleOf, ensureOwnerSample } from './index.ts';
import { openDriver } from './driver.ts';
import { importLegacy, seedPayload } from '../legacy.ts';
import { RepoError } from '../repo.ts';
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

  assert.equal(ws.name, 'زندگی من (نمونهٔ کامل)'); assert.equal(ws.purpose, 'personal');
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

  assert.deepEqual(st.files.map((f) => f.name), ['نتیجهٔ آزمایش مهر.txt'], 'the Persian file name arrives intact');
  assert.equal(ws.slug, 'life-sample'); assert.notEqual(ws.id, 'ws_course');
});

const fresh = () => new Repo(openDatabase(':memory:'));
const course = (repo: Repo, u: string) => {
  // the person's own first-run «زندگی من», with a note of theirs
  importLegacy(repo, u, seedPayload(u), 'seed');
  const wid = repo.listWorkspaces(u).find((w) => w.name === 'زندگی من')!.id;
  const n = repo.createNote({ userId: u, workspaceId: wid }, repo.listNodes({ userId: u, workspaceId: wid })[0].id, 'یادداشت واقعی من');
  return { wid, noteId: n.id };
};

test('it never touches the person\'s own «زندگی من»; a rebuild replaces only the space the seeder made', async () => {
  const repo = fresh(); const u = 'u-a';
  const mine = course(repo, u);
  const first = await applyLifeSample(repo, u, NOW);
  assert.ok(repo.getNote({ userId: u, workspaceId: mine.wid }, mine.noteId), 'their note is still there');
  assert.equal(repo.listWorkspaces(u).filter((w) => w.name === 'زندگی من').length, 1);
  const second = await applyLifeSample(repo, u, NOW);
  assert.notEqual(second.id, first.id);
  assert.equal(repo.getWorkspace(u, first.id), undefined, 'the old sample is gone only after the new one is whole');
  assert.equal(lifeSampleOf(repo, u)!.id, second.id);
  assert.ok(repo.getNote({ userId: u, workspaceId: mine.wid }, mine.noteId));
  // another person is untouched
  await applyLifeSample(repo, 'u-b', NOW);
  assert.equal(repo.listWorkspaces(u).filter((w) => w.slug === 'life-sample').length, 1);
});

test('a failed rebuild leaves the previous sample whole and no half-built space', async () => {
  const repo = fresh(); const u = 'u-c';
  const first = await applyLifeSample(repo, u, NOW);
  const before = repo.listObjects({ userId: u, workspaceId: first.id }).length;
  // a story that dies half-way: the repo refuses one write
  const orig = repo.createNote.bind(repo); let n = 0;
  repo.createNote = ((...a: Parameters<Repo['createNote']>) => { if (++n === 5) throw new Error('boom'); return orig(...a); }) as Repo['createNote'];
  await assert.rejects(applyLifeSample(repo, u, NOW), /خطایی در سرور/);
  repo.createNote = orig;
  assert.deepEqual(repo.listWorkspaces(u).filter((w) => w.slug === 'life-sample').map((w) => w.id), [first.id]);
  assert.equal(repo.listObjects({ userId: u, workspaceId: first.id }).length, before);
  assert.equal(lifeSampleOf(repo, u)!.id, first.id);
});

test('two builds at once for one person: the second is refused', async () => {
  const repo = fresh(); const u = 'u-d';
  const a = applyLifeSample(repo, u, NOW);
  await assert.rejects(applyLifeSample(repo, u, NOW), (e: Error & { code?: string }) => e instanceof RepoError && e.code === 'conflict');
  await a;
  assert.equal(repo.listWorkspaces(u).filter((w) => w.slug === 'life-sample').length, 1);
});

test('the private gateway refuses a call without the run\'s secret', async () => {
  const repo = fresh();
  const d = await openDriver(repo, 'u-e');
  try {
    assert.equal((await fetch(`${d.base}/workspaces`)).status, 401);
    assert.equal((await fetch(`${d.base}/workspaces`, { headers: { 'x-sample-token': 'x'.repeat(48) } })).status, 401);
    assert.deepEqual((await d.get<{ workspaces: unknown[] }>('/workspaces')).workspaces, []);
  } finally { await d.close(); }
});

test('the reset route: owner or the one local person only; off in production unless the host switches it on', async () => {
  const { createApp } = await import('../../app.ts');
  const call = async (auth: unknown, env: Record<string, string>) => {
    const old = { ...process.env }; Object.assign(process.env, env);
    try {
      const { app } = createApp(openDatabase(':memory:'), { auth: auth as never });
      const srv = app.listen(0); const port = (srv.address() as { port: number }).port;
      try { return (await fetch(`http://127.0.0.1:${port}/api/demo/life/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status; } finally { srv.close(); }
    } finally { process.env = old; }
  };
  assert.equal(await call({ mode: 'local' }, { NODE_ENV: 'test' }), 200);
  assert.equal(await call({ mode: 'local' }, { NODE_ENV: 'production' }), 403, 'production needs MABDA_ALLOW_SAMPLES');
  assert.equal(await call({ mode: 'local' }, { NODE_ENV: 'production', MABDA_ALLOW_SAMPLES: '1' }), 200);
});

test('the owner\'s copy: once, only for the owner (or local person) and only with the flag; never a tester; never touches «زندگی من»', async () => {
  const on = { MABDA_ALLOW_SAMPLES: '1' } as NodeJS.ProcessEnv;
  const repo = fresh(); const u = 'owner-1';
  const mine = course(repo, u);
  assert.equal(await ensureOwnerSample(repo, u, 'owner', NOW, {} as NodeJS.ProcessEnv), false, 'flag off');
  assert.equal(await ensureOwnerSample(repo, 't-1', 'tester', NOW, on), false, 'tester');
  assert.equal(lifeSampleOf(repo, 't-1'), undefined);
  assert.equal(await ensureOwnerSample(repo, u, 'owner', NOW, on), true);
  const ws = lifeSampleOf(repo, u)!;
  assert.ok(ws && repo.getNote({ userId: u, workspaceId: mine.wid }, mine.noteId), 'their own space is untouched');
  assert.equal(await ensureOwnerSample(repo, u, 'owner', NOW, on), false, 'only once');
  // deleted by the person → not brought back on the next load
  repo.db.prepare('DELETE FROM kv WHERE user_id = ? AND key = ?').run(u, 'life_sample_workspace');
  assert.equal(await ensureOwnerSample(repo, u, 'owner', NOW, on), false);
});
