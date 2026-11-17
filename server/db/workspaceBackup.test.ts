import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';
import { Repo } from './repo.ts';
import { applyDemo } from './demo.ts';
import { exportWorkspace, restoreWorkspace, workspaceTables, RESTORE_WORKSPACE_CAP } from './workspaceBackup.ts';
import type { WorkspaceBackup } from './workspaceBackup.ts';
import { openDatabase } from './database.ts';

const NOW = new Date('2026-11-15T08:00:00Z');

/** a rich workspace: the showcase plus thoughts with revisions, a derived thought, a relation to a thought, the weekly mark */
function rich() {
  const db = openDatabase(':memory:');
  const repo = new Repo(db);
  const ws = applyDemo(repo, 'person_a_0001', NOW);
  const s = { userId: 'person_a_0001', workspaceId: ws.id };
  const t1 = repo.insertThought(s, { nodeId: 'business', kind: 'idea', text: 'ایدهٔ اول برای پشتیبان' });
  repo.reviseThought(s, t1.id, 'ایدهٔ اول، بازنویسی‌شده');
  repo.deriveThought(s, { parentIds: [t1.id], nodeId: 'business', kind: 'question', text: 'سؤالی از دل ایده' });
  repo.setThoughtAbout(s, t1.id, [{ kind: 'object', id: repo.listObjects(s)[0].id }, { kind: 'node', id: 'business' }]);
  repo.markWeeklyReview(s);
  return { db, repo, s };
}

/** every table's rows with the restore's id suffix taken off, sorted: what must be identical after a round trip */
function normalised(b: WorkspaceBackup, suffix = '') {
  const strip = (v: unknown): unknown => (typeof v === 'string' && suffix ? v.split(suffix).join('') : v);
  const out: Record<string, string[]> = {};
  for (const [t, rows] of Object.entries(b.tables)) out[t] = rows.map((r) => JSON.stringify(Object.fromEntries(Object.entries(r).sort().map(([k, v]) => [k, strip(v)])))).sort();
  return out;
}

test('workspace backup: complete by construction (every table of a workspace, from the schema), nothing of another person', () => {
  const { repo, s } = rich();
  const b = exportWorkspace(repo, s, NOW);
  const must = ['context_objects', 'context_object_versions', 'context_changes', 'context_relationships', 'tree_nodes', 'notes', 'thoughts', 'thought_revisions', 'thought_derivations', 'thought_about', 'thought_events', 'canvas_view_items', 'files', 'file_chunks', 'saved_packs', 'metrics', 'measurements', 'deliverables', 'specs'];
  for (const t of must) assert.ok(b.tables[t]?.length, `${t} is in the backup`);
  assert.ok(b.weeklyReview);
  for (const t of Object.keys(b.tables)) assert.ok(workspaceTables(repo).includes(t));
  // another person's showcase is not in it
  applyDemo(repo, 'person_b_0002', NOW);
  const again = exportWorkspace(repo, s, NOW);
  assert.deepEqual(normalised(again), normalised(b));
});

test('workspace backup → restore → backup: the same rows (ids renamed consistently), next to the original or in another account', () => {
  const { repo, s } = rich();
  const b = JSON.parse(JSON.stringify(exportWorkspace(repo, s, NOW))) as WorkspaceBackup; // through JSON, like a downloaded file

  // into another person's account
  const restored = restoreWorkspace(repo, 'person_c_0003', b, NOW);
  assert.match(restored.name, /برگردانده‌شده/);
  const sfx = restored.id.slice(b.workspace.id.length);
  assert.ok(sfx.startsWith('_r'));
  const back = exportWorkspace(repo, { userId: 'person_c_0003', workspaceId: restored.id }, NOW);
  assert.deepEqual(normalised(back, sfx), normalised(b));
  assert.equal(back.weeklyReview, b.weeklyReview);

  // what the app reads is whole: references point inside the restored copy
  const rs = { userId: 'person_c_0003', workspaceId: restored.id };
  const objIds = new Set(repo.listObjects(rs).map((o) => o.id));
  assert.equal(objIds.size, repo.listObjects(s).length);
  assert.ok(repo.listDeliverables(rs).every((d) => d.usedContext.every((u) => objIds.has(u.id))));
  assert.ok(repo.listRelationships(rs).every((r) => objIds.has(r.sourceId) || r.sourceId.startsWith('thought')));
  assert.equal(repo.listThoughts(rs, { includeResolved: true }).length, repo.listThoughts(s, { includeResolved: true }).length);

  // next to the original, in the same account: both stay whole, and removing the original leaves the copy
  const twin = restoreWorkspace(repo, s.userId, b, NOW);
  assert.notEqual(twin.id, s.workspaceId);
  const before = repo.listObjects({ userId: s.userId, workspaceId: twin.id }).length;
  repo.resetWorkspaceData(s);
  assert.equal(repo.listObjects({ userId: s.userId, workspaceId: twin.id }).length, before);
});

test('restore refuses what it cannot bring back whole, and changes nothing', () => {
  const { repo, s } = rich();
  const b = exportWorkspace(repo, s, NOW);
  const count = () => repo.listWorkspaces('person_d_0004').length;
  assert.throws(() => restoreWorkspace(repo, 'person_d_0004', { hello: 1 }, NOW), /پشتیبان/);
  assert.throws(() => restoreWorkspace(repo, 'person_d_0004', { ...b, schemaVersion: 9999 }, NOW), /تازه‌تر/);
  assert.throws(() => restoreWorkspace(repo, 'person_d_0004', { ...b, tables: { ...b.tables, accounts: [{ id: 'x' }] } }, NOW), /ناشناخته/);
  // a broken row: the transaction leaves nothing behind
  assert.throws(() => restoreWorkspace(repo, 'person_d_0004', { ...b, tables: { ...b.tables, notes: [{ id: 'n1' }] } }, NOW));
  assert.equal(count(), 0);
});

test('restore never stops at a plan (plans are frozen): a new person brings back a small-plan workspace several times; only a plain disk guard remains', () => {
  const { repo, s } = rich();
  const b = exportWorkspace(repo, s, NOW);
  const small = { ...b, workspace: { ...b.workspace, planId: 'starter' } };
  // before: the second restore was refused with «سقف فضا این پلن (1 عدد) پر شده است»
  for (let i = 0; i < 3; i++) restoreWorkspace(repo, 'person_e_0005', small, NOW);
  assert.equal(repo.listWorkspaces('person_e_0005').length, 3);
  for (let i = 3; i < RESTORE_WORKSPACE_CAP; i++) restoreWorkspace(repo, 'person_e_0005', small, NOW);
  assert.throws(() => restoreWorkspace(repo, 'person_e_0005', small, NOW), (e: Error) => /۲۰ فضا داری/.test(e.message) && !/بیش از/.test(e.message) && !/پلن/.test(e.message)); // at exactly 20, not «more than 20»
});

test('restore keeps a resolved contradiction resolved: the pair key and its order follow the new ids (LOGIC-05)', () => {
  const { repo, s } = rich();
  const [a, b] = repo.listObjects(s);
  repo.savePairJudgment(s, a, b, { conflict: true, reason: 'تناقض', resolution: 'kept' });
  const backup = JSON.parse(JSON.stringify(exportWorkspace(repo, s, NOW))) as WorkspaceBackup;
  const restored = restoreWorkspace(repo, 'person_e_0005', backup, NOW);
  const rs = { userId: 'person_e_0005', workspaceId: restored.id };
  const sfx = restored.id.slice(backup.workspace.id.length);
  const [ra, rb] = [a.id + sfx, b.id + sfx];
  const judged = repo.listPairJudgments(rs);
  assert.equal(judged.length, 1);
  assert.equal(judged[0].key, ra < rb ? `${ra}|${rb}` : `${rb}|${ra}`);
  assert.equal(judged[0].resolution, 'kept');
  const lo = ra < rb ? a : b; const hi = lo === a ? b : a;
  assert.deepEqual([judged[0].aVersion, judged[0].bVersion], [lo.version, hi.version]);
});
