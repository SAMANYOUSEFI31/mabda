import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate, currentVersion, LATEST_VERSION, MIGRATIONS } from './migrations.ts';
import { Repo, RepoError } from './repo.ts';
import { importLegacy, seedPayload } from './legacy.ts';
import { computeStaleAssets } from '../../src/core/impactEngine.ts';
import type { GeneratedDeliverable, Workspace } from '../../src/types/index.ts';

const U = 'local';
const ws = (id: string, plan: Workspace['planId'] = 'pro'): Workspace => ({ id, name: id, slug: id, description: '', planId: plan, creditsRemaining: 100, todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' });
const fresh = () => { const db = new Database(':memory:'); migrate(db); const repo = new Repo(db); repo.saveWorkspace(U, ws('w1')); return { db, repo, s: { userId: U, workspaceId: 'w1' } }; };
const del = (id: string, used: Array<[string, number]>): GeneratedDeliverable => ({
  id, workspaceId: 'w1', workstreamId: 'x', deliverableId: 'd', title: `دارایی ${id}`, content: 'm', executionMode: 'auto', creditCost: 2,
  usedContext: used.map(([i, version]) => ({ id: i, version })), rebuildCount: 0, createdAt: '2026-02-01T00:00:00Z',
});

test('migrations apply in order, are idempotent, and keep existing rows (v1 → latest)', () => {
  const db = new Database(':memory:');
  assert.deepEqual(migrate(db, 1), [1]);
  assert.equal(currentVersion(db), 1);
  // data written under schema v1 (no version column yet)
  db.prepare('INSERT INTO workspaces (id,user_id,workspace_id,data,created_at) VALUES (?,?,?,?,?)').run('w1', U, 'w1', JSON.stringify(ws('w1')), 'x');
  db.prepare('INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('c1', U, 'w1', 'Fact', 'Confirmed', 'User Input', 'عنوان', 'متن', 'business', 't', 't');
  assert.deepEqual(migrate(db), MIGRATIONS.slice(1).map((m) => m.version));
  assert.equal(currentVersion(db), LATEST_VERSION);
  assert.deepEqual(migrate(db), [], 'second run is a no-op');
  const repo = new Repo(db);
  const o = repo.getObject({ userId: U, workspaceId: 'w1' }, 'c1')!;
  assert.equal(o.version, 1, 'pre-existing rows get version 1');
  assert.equal(repo.listVersions({ userId: U, workspaceId: 'w1' }, 'c1').length, 1, 'and a version-1 snapshot');
  for (const t of ['notes', 'files', 'file_chunks', 'file_usage', 'context_object_versions']) {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(t), `${t} exists`);
  }
});

test('every table carries user_id and workspace_id', () => {
  const { db } = fresh();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_migrations','kv','sqlite_sequence')").all() as Array<{ name: string }>).map((t) => t.name);
  for (const t of tables) {
    const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
    assert.ok(cols.includes('user_id') && cols.includes('workspace_id'), `${t} lacks user_id/workspace_id`);
  }
});

test('a new workspace gets the 5 system nodes; data of another user/workspace is invisible', () => {
  const { repo, s } = fresh();
  assert.deepEqual(repo.listNodes(s).map((n) => n.id), ['business', 'brand', 'product', 'offer', 'content']);
  assert.ok(repo.listNodes(s).every((n) => n.isSystem));
  repo.saveWorkspace(U, ws('w2'));
  const o = repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'الف', content: 'ب', nodeId: 'business' });
  assert.equal(repo.listObjects({ userId: U, workspaceId: 'w2' }).length, 0);
  assert.equal(repo.listObjects({ userId: 'someone-else', workspaceId: 'w1' }).length, 0);
  assert.equal(repo.getObject({ userId: U, workspaceId: 'w2' }, o.id), undefined);
});

test('nodes: system = rename only; user nodes create / move / delete (empty or with transfer)', () => {
  const { repo, s } = fresh();
  assert.equal(repo.updateNode(s, 'brand', { label: 'هویت برند' }).label, 'هویت برند');
  assert.throws(() => repo.deleteNode(s, 'brand'), (e) => e instanceof RepoError && e.code === 'forbidden');
  assert.throws(() => repo.moveNode(s, 'brand', 'offer'), (e) => e instanceof RepoError && e.code === 'forbidden');
  const a = repo.createNode(s, { parentId: 'content', label: 'کمپین' });
  const b = repo.createNode(s, { parentId: a.id, label: 'اینستاگرام' });
  assert.throws(() => repo.moveNode(s, a.id, b.id), RepoError);
  repo.moveNode(s, a.id, 'offer');
  assert.equal(repo.listNodes(s).find((n) => n.id === a.id)!.parentId, 'offer');
  // not empty → refuse; then transfer
  const o = repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'x', content: 'y', nodeId: b.id });
  repo.createNote(s, b.id, 'یادداشت');
  assert.throws(() => repo.deleteNode(s, b.id), RepoError);
  repo.deleteNode(s, b.id, 'brand');
  assert.equal(repo.getObject(s, o.id)!.nodeId, 'brand');
  assert.equal(repo.listNotes(s)[0].nodeId, 'brand');
  assert.ok(!repo.listNodes(s).some((n) => n.id === b.id));
  // a node with children: children move to the target
  const c = repo.createNode(s, { parentId: a.id, label: 'زیر' });
  repo.deleteNode(s, a.id, 'product');
  assert.equal(repo.listNodes(s).find((n) => n.id === c.id)!.parentId, 'product');
  // empty leaf deletes without transfer
  repo.deleteNode(s, c.id);
  assert.ok(!repo.listNodes(s).some((n) => n.id === c.id));
});

test('versions: edits of title/content/type bump the version; status and node moves do not; history is kept', () => {
  const { repo, s } = fresh();
  const o = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'مخاطب اصلی', content: 'فریلنسرها', nodeId: 'business' });
  assert.equal(o.version, 1);
  const v2 = repo.updateObject(s, o.id, { content: 'فریلنسرهای ارشد' }).object;
  assert.equal(v2.version, 2);
  assert.equal(repo.updateObject(s, o.id, { status: 'Needs Review' }).object.version, 2);
  assert.equal(repo.updateObject(s, o.id, { nodeId: 'brand' }).object.version, 2);
  assert.equal(repo.updateObject(s, o.id, { content: 'فریلنسرهای ارشد' }).object.version, 2, 'identical content: no bump');
  assert.equal(repo.updateObject(s, o.id, { title: 'مخاطب هدف' }).object.version, 3);
  assert.deepEqual(repo.listVersions(s, o.id).map((v) => [v.version, v.content]), [[3, 'فریلنسرهای ارشد'], [2, 'فریلنسرهای ارشد'], [1, 'فریلنسرها']]);
});

test('supersede: new object continues the version, relationship supersedes, old one stays (never deleted)', () => {
  const { repo, s } = fresh();
  const o = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'مخاطب', content: 'الف', nodeId: 'business' });
  repo.updateObject(s, o.id, { content: 'ب' }); // v2
  const r = repo.supersedeObject(s, o.id, { type: 'Decision', provenance: 'User Input', title: 'مخاطب', content: 'ج', nodeId: 'business' });
  assert.equal(r.object.version, 3);
  assert.equal(r.previous.status, 'Superseded');
  assert.equal(r.previous.supersededById, r.object.id);
  const rel = repo.listRelationships(s).find((x) => x.type === 'supersedes')!;
  assert.deepEqual([rel.sourceId, rel.targetId], [r.object.id, o.id]);
  assert.throws(() => repo.supersedeObject(s, o.id, { type: 'Fact', provenance: 'User Input', title: 'x', content: 'y', nodeId: 'business' }), RepoError);
  assert.equal(repo.listObjects(s).length, 2);
});

test('impact: changing an object reports the assets that become stale, with the reason; unrelated assets are untouched', () => {
  const { repo, s } = fresh();
  const aud = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'مخاطب اصلی', content: 'الف', nodeId: 'business' });
  const price = repo.createObject(s, { type: 'Constraint', provenance: 'User Input', title: 'قیمت', content: 'ب', nodeId: 'offer' });
  repo.saveDeliverable(s, del('a1', [[aud.id, 1], [price.id, 1]]));
  repo.saveDeliverable(s, del('a2', [[price.id, 1]]));
  repo.saveDeliverable(s, del('a3', []));
  const r = repo.updateObject(s, aud.id, { content: 'ب' });
  assert.equal(r.impact.count, 1);
  assert.equal(r.impact.assets[0].id, 'a1');
  assert.equal(r.impact.assets[0].reasons[0], '«مخاطب اصلی» از نسخهٔ ۱ به ۲ تغییر کرد.');
  // second edit of the same object: a1 is already stale → signature changes (v3) so it is reported again
  assert.equal(repo.updateObject(s, aud.id, { content: 'ج' }).impact.count, 1);
  // status-only change affects nobody
  assert.equal(repo.updateObject(s, aud.id, { status: 'Needs Review' }).impact.count, 0);
  const sup = repo.supersedeObject(s, price.id, { type: 'Constraint', provenance: 'User Input', title: 'قیمت', content: 'د', nodeId: 'offer' });
  assert.equal(sup.impact.count, 2);
  const state = repo.state(s);
  assert.deepEqual(state.stale.map((x) => x.deliverableId).sort(), ['a1', 'a2']);
  assert.deepEqual(computeStaleAssets(state.deliverables, state.objects).map((x) => x.deliverableId).sort(), ['a1', 'a2']);
});

test('an object cannot be saved without provenance or into a missing node', () => {
  const { repo, s } = fresh();
  assert.throws(() => repo.createObject(s, { type: 'Fact', provenance: '' as never, title: 'x', content: 'y', nodeId: 'business' }), RepoError);
  assert.throws(() => repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'x', content: 'y', nodeId: 'ghost' }), RepoError);
});

test('legacy import is one-time, keeps ids, converts usedContextIds → usedContext, and seeds on first run', () => {
  const db = new Database(':memory:'); migrate(db); const repo = new Repo(db);
  const payload = seedPayload();
  const first = importLegacy(repo, U, payload);
  assert.ok(!('skipped' in first) && first.workspaces === 2 && first.objects >= 8);
  assert.deepEqual(importLegacy(repo, U, payload), { skipped: true });
  assert.equal(repo.listWorkspaces(U).length, 2);
  const legacyDel = { ...payload.deliverables![0], usedContext: undefined, usedContextIds: ['ctx_domain', 'ctx_audience'] } as never;
  const db2 = new Database(':memory:'); migrate(db2); const repo2 = new Repo(db2);
  importLegacy(repo2, U, { ...payload, deliverables: [legacyDel] });
  assert.deepEqual(repo2.listDeliverables({ userId: U, workspaceId: 'ws_studio' })[0].usedContext, [{ id: 'ctx_domain', version: 1 }, { id: 'ctx_audience', version: 1 }]);
  assert.equal(repo2.state({ userId: U, workspaceId: 'ws_studio' }).stale.length, 0, 'imported assets are not falsely stale');
});

test('file usage counters are per workspace and month', () => {
  const { repo, s } = fresh();
  assert.equal(repo.fileUsage(s, '2026-10'), 0);
  assert.equal(repo.addFileUsage(s, '2026-10', 1000), 1000);
  assert.equal(repo.addFileUsage(s, '2026-10', 500), 1500);
  assert.equal(repo.fileUsage(s, '2026-11'), 0);
});

test('plan limits: workspaces and active objects are enforced (archived/superseded do not count); import is exempt', () => {
  const { repo, s } = fresh();
  // pro = 3 workspaces
  repo.saveWorkspace(U, ws('w2'));
  repo.saveWorkspace(U, ws('w3'));
  assert.throws(() => repo.saveWorkspace(U, ws('w4')), (e) => e instanceof RepoError && e.code === 'forbidden' && /سقف فضای کاری/.test(e.message));
  repo.saveWorkspace(U, { ...ws('w3'), name: 'renamed' }); // updating is fine
  const st = { userId: U, workspaceId: 'w2' };
  repo.saveWorkspace(U, ws('w2', 'starter')); // 400 objects
  assert.equal(repo.objectSlots(st), 400);
  const input = { type: 'Fact' as const, provenance: 'User Input' as const, title: 't', content: 'c', nodeId: 'business' };
  for (let i = 0; i < 400; i++) repo.db.prepare('INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)').run(`o${i}`, U, 'w2', 'Fact', 'Confirmed', 'User Input', 't', 'c', 'business', 't', 't');
  assert.equal(repo.objectSlots(st), 0);
  assert.throws(() => repo.createObject(st, input), (e) => e instanceof RepoError && e.code === 'forbidden' && /سقف قلم دانش/.test(e.message));
  repo.updateObject(st, 'o0', { status: 'Archived' });
  assert.equal(repo.objectSlots(st), 1, 'archiving frees a slot');
  assert.doesNotThrow(() => repo.createObject(st, input));
  void s;
});

test('slotKey: stored, patchable, inherited by the superseding object; migration 6 is forward-only and keeps old rows', () => {
  const { repo, s } = fresh();
  const o = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'مخاطب', content: 'الف', nodeId: 'business', slotKey: ' target_audience ' });
  assert.equal(o.slotKey, 'target_audience');
  assert.equal(repo.getObject(s, o.id)!.slotKey, 'target_audience');
  const n = repo.supersedeObject(s, o.id, { type: 'Decision', provenance: 'User Input', title: 'مخاطب جدید', content: 'ب', nodeId: 'business' });
  assert.equal(n.object.slotKey, 'target_audience', 'the replacement keeps filling the slot');
  assert.equal(repo.updateObject(s, n.object.id, { slotKey: 'core_problem' }).object.slotKey, 'core_problem');
  assert.equal(repo.updateObject(s, n.object.id, { slotKey: null as never }).object.slotKey, undefined, 'null clears the slot');
  assert.equal(repo.updateObject(s, n.object.id, { slotKey: 'x' }).object.version, n.object.version, 'a slot change is not a content edit');
  // old database (v5) with data → migrate → rows survive, slot empty
  const db = new Database(':memory:');
  migrate(db, 5);
  db.prepare('INSERT INTO workspaces (id,user_id,workspace_id,data,created_at) VALUES (?,?,?,?,?)').run('w1', U, 'w1', JSON.stringify(ws('w1')), 'x');
  db.prepare('INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)').run('c1', U, 'w1', 'Fact', 'Confirmed', 'User Input', 'عنوان', 'متن', 'business', 't', 't');
  assert.deepEqual(migrate(db, 6), [6]);
  assert.equal(new Repo(db).getObject({ userId: U, workspaceId: 'w1' }, 'c1')!.slotKey, undefined);
});
