import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate, currentVersion, LATEST_VERSION, MIGRATIONS } from './migrations.ts';
import { Repo, RepoError } from './repo.ts';
import { importLegacy, seedPayload } from './legacy.ts';
import { applyDemo } from './demo.ts';
import { treeOrder } from '../../src/core/nodeTree.ts';
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
  // usage_events is per install and holds only a feature key, a number and a time: it has no workspace (and no data of one)
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_migrations','kv','sqlite_sequence','usage_events')").all() as Array<{ name: string }>).map((t) => t.name);
  for (const t of tables) {
    const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
    assert.ok(cols.includes('user_id') && cols.includes('workspace_id'), `${t} lacks user_id/workspace_id`);
  }
});

test('a new workspace gets the 5 nodes of the default start (ordinary, unlocked); data of another user/workspace is invisible', () => {
  const { repo, s } = fresh();
  assert.deepEqual(treeOrder(repo.listNodes(s)), ['business', 'brand', 'content', 'product', 'offer'], 'the starting tree, in tree order');
  assert.equal(repo.listNodes(s).length, 5, 'the starting tree is back'); assert.ok(repo.listNodes(s).every((n) => !('isSystem' in n)), 'no node is locked');
  repo.saveWorkspace(U, ws('w2'));
  const o = repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'الف', content: 'ب', nodeId: 'business' });
  assert.equal(repo.listObjects({ userId: U, workspaceId: 'w2' }).length, 0);
  assert.equal(repo.listObjects({ userId: 'someone-else', workspaceId: 'w1' }).length, 0);
  assert.equal(repo.getObject({ userId: U, workspaceId: 'w2' }, o.id), undefined);
});

test('nodes: nothing is locked — rename, move, create, delete (empty or with transfer); the last root stays', () => {
  const { repo, s } = fresh();
  assert.equal(repo.updateNode(s, 'brand', { label: 'هویت برند' }).label, 'هویت برند');
  repo.moveNode(s, 'brand', 'offer'); // a node of the default start moves like any other
  repo.moveNode(s, 'brand', 'business');
  assert.throws(() => repo.deleteNode(s, 'brand'), RepoError, 'brand has a child node: it needs a place to go');
  assert.throws(() => repo.deleteNode(s, 'business', 'brand'), (e) => e instanceof RepoError && /آخرین گرهٔ اصلی/.test(e.message), 'the last root is never deleted: knowledge must live somewhere');
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

test('migration 8: old Asset objects become Fact (provenance, version, history kept); Asset is rejected as a type from now on', () => {
  const db = new Database(':memory:');
  migrate(db, 7);
  db.prepare('INSERT INTO workspaces (id,user_id,workspace_id,data,created_at) VALUES (?,?,?,?,?)').run('w1', U, 'w1', JSON.stringify(ws('w1')), 'x');
  db.prepare('INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,3)').run('a1', U, 'w1', 'Asset', 'Confirmed', 'Asset Derived', 'دارایی: پروفایل', 'متن', 'brand', 't', 't');
  db.prepare('INSERT INTO context_object_versions (object_id,version,user_id,workspace_id,type,title,content,created_at) VALUES (?,?,?,?,?,?,?,?)').run('a1', 3, U, 'w1', 'Asset', 'دارایی: پروفایل', 'متن', 't');
  assert.deepEqual(migrate(db, 8), [8]);
  const repo = new Repo(db);
  const s = { userId: U, workspaceId: 'w1' };
  const o = repo.getObject(s, 'a1')!;
  assert.deepEqual([o.type, o.provenance, o.version, o.status], ['Fact', 'Asset Derived', 3, 'Confirmed']);
  assert.equal(repo.listVersions(s, 'a1')[0].type, 'Fact');
  assert.throws(() => repo.createObject(s, { type: 'Asset' as never, provenance: 'User Input', title: 'x', content: 'y', nodeId: 'business' }), RepoError);
  assert.throws(() => repo.updateObject(s, 'a1', { type: 'Asset' as never }), RepoError);
});

test('every mutation path writes a Change in its transaction: created / edited / status / moved / superseded / resolved / review; actor follows the source', () => {
  const { repo, s } = fresh();
  const kinds = (id: string) => repo.listChanges(s, { objectId: id }).map((c) => c.kind);
  const a = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'قیمت', content: 'پنج', nodeId: 'business' });
  assert.deepEqual(kinds(a.id), ['created']);
  const p = repo.createObject(s, { type: 'Fact', status: 'Proposed', provenance: 'AI Suggested', title: 'پیشنهاد', content: 'x', nodeId: 'business', source: { kind: 'mcp', label: 'Claude', at: 't' } });
  const first = repo.listChanges(s, { objectId: p.id })[0];
  assert.deepEqual([first.actor, first.actorLabel, first.kind], ['mcp', 'Claude', 'created']);
  const imp = repo.createObject(s, { type: 'Fact', status: 'Proposed', provenance: 'Imported', title: 'حافظه', content: 'x', nodeId: 'business', source: { kind: 'paste', label: 'حافظهٔ ChatGPT', at: 't' } });
  assert.deepEqual(kinds(imp.id), ['imported']);

  repo.updateObject(s, a.id, { content: 'شش' });
  const edit = repo.listChanges(s, { objectId: a.id }).at(-1)!;
  assert.deepEqual([edit.kind, edit.fromVersion, edit.toVersion, edit.before, edit.after], ['edited', 1, 2, { content: 'پنج' }, { content: 'شش' }], 'only the changed field, with versions');
  repo.updateObject(s, a.id, { title: 'قیمت' });
  assert.equal(repo.listChanges(s, { objectId: a.id }).length, 2, 'a no-op patch writes nothing');

  repo.updateObject(s, p.id, { status: 'Confirmed' });
  repo.updateObject(s, imp.id, { status: 'Archived' });
  assert.equal(repo.listChanges(s, { objectId: p.id }).at(-1)!.kind, 'proposal_accepted');
  assert.equal(repo.listChanges(s, { objectId: imp.id }).at(-1)!.kind, 'proposal_rejected');
  repo.updateObject(s, a.id, { status: 'Needs Review', nodeId: 'offer' });
  assert.deepEqual(kinds(a.id).slice(-2), ['status_changed', 'edited'], 'status and move are two separate records');

  const sup = repo.supersedeObject(s, a.id, { type: 'Decision', provenance: 'User Input', title: 'قیمت', content: 'هفت', nodeId: 'business' }, { reason: 'بودجه عوض شد' });
  assert.equal(kinds(a.id).at(-1), 'superseded');
  assert.equal(repo.listChanges(s, { objectId: a.id }).at(-1)!.reason, 'بودجه عوض شد');
  assert.equal(sup.object.content, 'هفت', 'the reason never enters the object text');
  assert.equal(repo.listChanges(s, { objectId: sup.object.id })[0].reason, undefined);

  const b = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'قیمت دیگر', content: 'هشت', nodeId: 'business' });
  repo.supersedeBy(s, b.id, sup.object.id);
  assert.equal(kinds(b.id).at(-1), 'contradiction_resolved');

  const r = repo.acceptReview(s, sup.object.id);
  assert.deepEqual([r.kind, r.actor, r.fromVersion, r.toVersion], ['review_accepted', 'user', sup.object.version, sup.object.version]);
  assert.throws(() => repo.acceptReview(s, 'nope'), RepoError);
  assert.ok(repo.listChanges(s, { since: '2999-01-01T00:00:00Z' }).length === 0, 'since filter');
});

test('migration 9: change log rebuilt from versions; the reason glued to the text moves to the Change (and the text is clean everywhere)', () => {
  const db = new Database(':memory:');
  migrate(db, 8);
  const ins = (id: string, version: number, content: string, status = 'Confirmed') => db.prepare('INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, U, 'w1', 'Decision', status, 'User Input', 'قیمت', content, 'business', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', version);
  db.prepare('INSERT INTO workspaces (id,user_id,workspace_id,data,created_at) VALUES (?,?,?,?,?)').run('w1', U, 'w1', JSON.stringify(ws('w1')), 'x');
  const snap = (id: string, v: number, content: string, at: string) => db.prepare('INSERT OR REPLACE INTO context_object_versions (object_id,version,user_id,workspace_id,type,title,content,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, v, U, 'w1', 'Decision', 'قیمت', content, at);
  ins('old', 2, 'پنج', 'Superseded'); snap('old', 1, 'چهار', '2026-01-01T00:00:00Z'); snap('old', 2, 'پنج', '2026-01-02T00:00:00Z');
  ins('new', 3, 'شش\n\n[دلیل جایگزینی: بودجه [سالانه]\nکم شد]'); snap('new', 3, 'شش\n\n[دلیل جایگزینی: بودجه [سالانه]\nکم شد]', '2026-01-03T00:00:00Z');
  db.prepare("INSERT INTO context_relationships (id,user_id,workspace_id,source_id,target_id,type,created_at) VALUES ('r1',?,?,?,?,'supersedes','2026-01-03T00:00:00Z')").run(U, 'w1', 'new', 'old');
  ins('plain', 1, 'متن [دلیل جایگزینی: در وسط] ادامه'); snap('plain', 1, 'متن [دلیل جایگزینی: در وسط] ادامه', '2026-01-04T00:00:00Z');
  ins('arch', 1, 'x', 'Archived'); snap('arch', 1, 'x', '2026-01-01T00:00:00Z');

  assert.deepEqual(migrate(db, 9), [9]);
  const repo = new Repo(db); const s = { userId: U, workspaceId: 'w1' };
  assert.equal(repo.getObject(s, 'new')!.content, 'شش', 'object text is clean');
  assert.equal(repo.listVersions(s, 'new')[0].content, 'شش', 'and so is its history');
  assert.equal(repo.getObject(s, 'plain')!.content, 'متن [دلیل جایگزینی: در وسط] ادامه', 'a bracket in the middle is not a reason');
  const old = repo.listChanges(s, { objectId: 'old' });
  assert.deepEqual(old.map((c) => c.kind), ['created', 'edited', 'superseded']);
  assert.deepEqual([old[1].fromVersion, old[1].toVersion, old[1].before, old[1].after], [1, 2, { content: 'چهار' }, { content: 'پنج' }]);
  assert.equal(old[2].reason, 'بودجه [سالانه]\nکم شد');
  assert.deepEqual([old[2].fromVersion, old[2].toVersion], [2, 3]);
  assert.deepEqual(repo.listChanges(s, { objectId: 'new' }).map((c) => [c.kind, c.reason]), [['created', undefined]], 'the reason sits on the replaced object, not twice');
  assert.deepEqual(repo.listChanges(s, { objectId: 'arch' }).map((c) => c.kind), ['created', 'archived']);
  assert.ok(repo.listChanges(s).every((c) => c.actor === 'system'));
});

test('depends_on: set/validated through the repo, carried over on supersede, and an edited dependency makes the dependent\'s asset stale until reviewed', () => {
  const { repo, s } = fresh();
  const mk = (title: string) => repo.createObject(s, { type: 'Decision', provenance: 'User Input', title, content: title, nodeId: 'business' });
  const budget = mk('بودجه'); const channel = mk('کانال');
  assert.throws(() => repo.setDependencies(s, channel.id, [channel.id]), RepoError, 'no self-dependency');
  assert.throws(() => repo.setDependencies(s, channel.id, ['ghost']), RepoError);
  const r = repo.setDependencies(s, channel.id, [budget.id]);
  assert.deepEqual(r.relationships.filter((x) => x.type === 'depends_on').map((x) => [x.sourceId, x.targetId]), [[channel.id, budget.id]]);
  assert.equal(repo.setDependencies(s, channel.id, [budget.id]).change, undefined, 'same set = no record');
  repo.setDependencies(s, budget.id, [channel.id]); // a cycle is allowed
  repo.setDependencies(s, budget.id, []);

  const del = { id: 'a1', workspaceId: 'w1', workstreamId: 'x', deliverableId: 'd', title: 'برنامه کانال', content: 'm', executionMode: 'auto', creditCost: 1, usedContext: [{ id: channel.id, version: 1 }], rebuildCount: 0, createdAt: new Date(Date.now() - 60_000).toISOString() } as unknown as GeneratedDeliverable;
  repo.saveDeliverable(s, del);
  assert.deepEqual(repo.computeStale(s).map((x) => x.deliverableId), [], 'fresh');
  const edited = repo.updateObject(s, budget.id, { content: 'بودجهٔ تازه' });
  assert.deepEqual(edited.impact.assets.map((a) => a.id), ['a1'], 'the toast counts the dependency-driven asset too');
  const st = repo.computeStale(s);
  assert.equal(st[0].reasons[0].kind, 'dependency_changed');
  repo.acceptReview(s, channel.id);
  assert.deepEqual(repo.computeStale(s), [], 'review accepted → fresh without any rebuild');

  // superseding the dependency: the dependent follows the replacement, and is flagged
  const sup = repo.supersedeObject(s, budget.id, { type: 'Decision', provenance: 'User Input', title: 'بودجه', content: 'سوم', nodeId: 'business' }, { reason: 'تغییر' });
  assert.ok(repo.dependenciesOf(s, channel.id).includes(sup.object.id), 'the dependent now also rests on the replacement');
  assert.equal(repo.computeStale(s)[0].reasons.some((x) => x.kind === 'dependency_changed'), true);
});

test('showcase workspace: decided by the server only, never counted (workspace allowance, object cap, admin usage); reset deletes all its data and nothing else', () => {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace(U, ws('w1', 'starter'));
  const demo = applyDemo(repo, U, new Date('2026-03-10T08:00:00Z'));
  assert.equal(demo.isDemo, true);
  // a client cannot claim the flag on a normal workspace, nor drop it from the showcase one
  assert.equal(repo.saveWorkspace(U, { ...ws('w2', 'pro'), isDemo: true } as Workspace).isDemo, undefined);
  assert.equal(repo.saveWorkspace(U, { ...demo, isDemo: false }).isDemo, true);
  assert.equal(repo.getWorkspace(U, 'w2')!.isDemo, undefined);
  // workstream library: only real library ids survive; the showcase has none of the built-ins; absent = unchanged behaviour
  assert.deepEqual(repo.getWorkspace(U, 'ws_demo')!.enabledSpecIds, []);
  assert.deepEqual(repo.saveWorkspace(U, { ...ws('w2', 'pro'), enabledSpecIds: ['freelance_profile', 'nope', 'freelance_profile'] }).enabledSpecIds, ['freelance_profile']);
  assert.equal(repo.saveWorkspace(U, { ...ws('w2', 'pro') }).enabledSpecIds, undefined);
  // the allowance only counts real workspaces: starter allows 1 and w1 is it, w2 (pro, allows 3) still fits next to the showcase
  assert.throws(() => repo.saveWorkspace(U, ws('w3', 'starter')), RepoError);
  // no object cap, never in the admin usage
  const s = { userId: U, workspaceId: demo.id };
  assert.ok(repo.objectSlots(s) > 100_000);
  repo.addLedger(s, { id: 'l1', workspaceId: demo.id, timestamp: '2026-03-10T09:00:00.000Z', byok: false, estimatedAiCostUsd: 1 } as never);
  assert.ok(!repo.ledgerByWorkspaceForMonth('2026-03').some((r) => r.workspaceId === demo.id));
  // reset: all of the showcase workspace's data goes (and the system nodes come back); other workspaces are untouched
  const other = { userId: U, workspaceId: 'w1' };
  repo.createObject(other, { type: 'Fact', provenance: 'User Input', title: 'x', content: 'y', nodeId: 'business' });
  repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'x', content: 'y', nodeId: 'business' });
  repo.createNote(s, 'business', 'n');
  applyDemo(repo, U, new Date('2026-03-10T08:00:00Z'));
  assert.equal(repo.listObjects(other).length, 1);
  assert.ok(!repo.listNotes(s).some((n) => n.content === 'n'), 'the stray note is gone; the showcase notes are back');
  assert.ok(!repo.listObjects(s).some((o) => o.title === 'x'));
  assert.equal(repo.listLedger(s).length, 0);
  assert.ok(['business', 'brand', 'product', 'offer', 'content'].every((id) => repo.listNodes(s).some((n) => n.id === id)), 'the showcase keeps the default start as its base');
});

test('reach / validUntil: migration 11 leaves old rows untouched (type default), values are validated, an edit is a Change and bumps the version', () => {
  const db = new Database(':memory:');
  migrate(db, 10);
  new Repo(db).saveWorkspace(U, ws('w1'));
  db.prepare("INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at,version) VALUES ('c_old',?,?,'Constraint','Confirmed','User Input','قید قدیمی','x','business','2026-01-01','2026-01-01',1)").run(U, 'w1');
  assert.deepEqual(migrate(db).filter((v) => v === 11), [11]);
  const repo = new Repo(db);
  const s = { userId: U, workspaceId: 'w1' };
  const old = repo.getObject(s, 'c_old')!;
  assert.equal(old.reach, undefined, 'old data has no stored reach → the type default (global for a Constraint)');
  assert.equal(old.validUntil, undefined);
  const c = repo.createObject(s, { type: 'Constraint', provenance: 'User Input', title: 'قید بخش', content: 'y', nodeId: 'brand', reach: 'position', validUntil: '2026-12-01' });
  assert.deepEqual([c.reach, c.validUntil], ['position', '2026-12-01']);
  assert.equal(repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'ت', content: 'z', nodeId: 'brand', reach: 'nonsense' as never, validUntil: 'tomorrow' }).reach, undefined, 'invalid values are dropped');
  const e = repo.updateObject(s, c.id, { reach: 'global' }, { reason: 'برای همه' }).object;
  assert.deepEqual([e.reach, e.version], ['global', 2]);
  const ch = repo.listChanges(s).filter((x) => x.objectId === c.id).at(-1)!;
  assert.deepEqual([ch.kind, ch.after?.reach, ch.before?.reach], ['edited', 'global', 'position']);
  assert.equal(repo.updateObject(s, c.id, { validUntil: null as never }).object.validUntil, undefined, 'null clears the end date');
  assert.equal(repo.updateObject(s, c.id, { title: 'عنوان تازه' }).object.reach, 'global', 'an unrelated edit keeps the scope');
});

test('overrides: only child-node → ancestor-node, needs a reason (kept in the Change), live objects only; removing it is a Change too; nothing else reads it but the effective-context engine', () => {
  const { repo, s } = fresh();
  const parent = repo.createNode(s, { parentId: 'business', label: 'والد' });
  const child = repo.createNode(s, { parentId: parent.id, label: 'فرزند' });
  const sib = repo.createNode(s, { parentId: parent.id, label: 'هم‌سطح' });
  const mk = (nodeId: string, title: string) => repo.createObject(s, { type: 'Decision', provenance: 'User Input', title, content: title, nodeId });
  const rule = mk(parent.id, 'قاعدهٔ والد'), exc = mk(child.id, 'استثنا'), other = mk(sib.id, 'دیگر');
  assert.throws(() => repo.setOverride(s, exc.id, rule.id, {}), (e) => e instanceof RepoError && /دلیل/.test(e.message), 'a reason is required');
  assert.throws(() => repo.setOverride(s, rule.id, exc.id, { reason: 'x' }), RepoError, 'the wrong way round');
  assert.throws(() => repo.setOverride(s, other.id, exc.id, { reason: 'x' }), RepoError, 'siblings');
  assert.throws(() => repo.setOverride(s, exc.id, exc.id, { reason: 'x' }), RepoError, 'itself');
  const r = repo.setOverride(s, exc.id, rule.id, { reason: 'این شاخه جدا کار می‌کند' });
  assert.ok(r.relationships.some((x) => x.type === 'overrides' && x.sourceId === exc.id && x.targetId === rule.id));
  assert.equal(r.change?.reason, 'این شاخه جدا کار می‌کند');
  assert.deepEqual(r.change?.after, { overrides: [rule.id] });
  assert.equal(repo.setOverride(s, exc.id, rule.id, { reason: 'دوباره' }).relationships.filter((x) => x.type === 'overrides').length, 1, 'idempotent');
  repo.removeOverride(s, exc.id, rule.id, { reason: 'برگشت' });
  assert.ok(!repo.listRelationships(s).some((x) => x.type === 'overrides'));
  assert.deepEqual(repo.listChanges(s, { objectId: exc.id }).filter((c) => c.after && 'overrides' in c.after).map((c) => c.after!.overrides), [[rule.id], []]);
});

test('assumption / reviewBy / decision record: migration 12 leaves old rows alone; only a Fact can be an assumption, only a Decision has a record; edits are Changes', () => {
  const db = new Database(':memory:');
  migrate(db, 11);
  new Repo(db).saveWorkspace(U, ws('w1'));
  db.prepare("INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at,version) VALUES ('old',?,?,'Fact','Confirmed','User Input','قدیمی','x','business','2026-01-01','2026-01-01',1)").run(U, 'w1');
  assert.deepEqual(migrate(db).filter((v) => v === 12), [12]);
  const repo = new Repo(db);
  const s = { userId: U, workspaceId: 'w1' };
  const old = repo.getObject(s, 'old')!;
  assert.deepEqual([old.assumption, old.reviewBy, old.record], [undefined, undefined, undefined]);
  const a = repo.createObject(s, { type: 'Fact', status: 'Proposed', provenance: 'User Input', title: 'فرض', content: 'پیام‌رسان بهتر است', nodeId: 'business', assumption: true, reviewBy: '2026-09-01' });
  assert.deepEqual([a.assumption, a.reviewBy], [true, '2026-09-01']);
  const notFact = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'تصمیم', content: 'x', nodeId: 'business', assumption: true, reviewBy: '2026-09-01' } as never);
  assert.deepEqual([notFact.assumption, notFact.reviewBy], [undefined, undefined], 'a Decision is never an assumption');
  const d = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'قیمت', content: 'ماهانه', nodeId: 'business', record: { question: 'چه قیمتی؟', options: [{ title: 'سالانه', rejectedReason: 'نقدینگی' }, { title: '' }, { title: 'رایگان' }], expectation: 'فروش بیشتر', reviewOn: '2026-10-01' } });
  assert.deepEqual(d.record?.options, [{ title: 'سالانه', rejectedReason: 'نقدینگی' }, { title: 'رایگان' }]);
  assert.equal(repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'ف', content: 'x', nodeId: 'business', record: { question: 'x' } } as never).record, undefined, 'a Fact has no record');
  const e = repo.updateObject(s, a.id, { assumption: false }, { reason: 'ثابت شد' }).object;
  assert.deepEqual([e.assumption, e.reviewBy, e.version], [undefined, undefined, 2], 'no longer an assumption → knowledge; the review date goes with it');
  const ch = repo.listChanges(s, { objectId: a.id }).at(-1)!;
  assert.deepEqual([ch.kind, ch.before?.assumption, ch.after?.assumption], ['edited', true, null]);
  const e2 = repo.updateObject(s, d.id, { record: { question: 'چه قیمتی؟', reviewOn: '2026-11-01' } }).object;
  assert.deepEqual([e2.record?.options, e2.version], [undefined, 2]);
});

test('outcome_noted: a due decision\'s answer is a Change (decisions only, text required); a note\'s ## sections become child nodes with a Change each and the note stays', () => {
  const { repo, s } = fresh();
  const dec = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'تصمیم', content: 'x', nodeId: 'business' });
  const fact = repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'ف', content: 'x', nodeId: 'business' });
  assert.throws(() => repo.noteOutcome(s, fact.id, 'نتیجه'), RepoError);
  assert.throws(() => repo.noteOutcome(s, dec.id, '  '), RepoError);
  const c = repo.noteOutcome(s, dec.id, 'فروش ۲۰٪ بیشتر شد', { actor: 'user' });
  assert.deepEqual([c.kind, c.reason], ['outcome_noted', 'فروش ۲۰٪ بیشتر شد']);
  assert.equal(repo.getObject(s, dec.id)!.version, 1, 'a note about the outcome does not change the decision');
  const note = repo.createNote(s, 'business', 'مقدمه\n## قیمت\nمتن یک\n## ارسال\nمتن دو');
  assert.throws(() => repo.nodesFromNote(s, note.id, [{ title: 'فقط یکی', body: '' }]), RepoError);
  const nodes = repo.nodesFromNote(s, note.id, [{ title: 'قیمت', body: 'متن یک' }, { title: 'ارسال', body: 'متن دو' }]);
  assert.deepEqual(nodes.map((n) => [n.label, n.parentId]), [['قیمت', 'business'], ['ارسال', 'business']]);
  assert.equal(repo.getNote(s, note.id)!.content, 'مقدمه\n## قیمت\nمتن یک\n## ارسال\nمتن دو', 'the original text stays');
  assert.deepEqual(repo.listNotes(s).filter((n) => nodes.some((x) => x.id === n.nodeId)).map((n) => n.content).sort(), ['متن دو', 'متن یک']);
  assert.equal(repo.listChanges(s).filter((x) => x.kind === 'node_from_note').length, 0, 'node records are not in the object feed');
  assert.equal(repo.listChanges(s, { includeNodes: true }).filter((x) => x.kind === 'node_from_note').length, 2);
});

// ── metrics («شاخص‌ها»): recorded results, never Context objects ───────────────────────────────────────────────
test('migration 14: metrics and measurements exist, carry user_id / workspace_id, and old data is untouched', () => {
  const db = new Database(':memory:');
  migrate(db, 13);
  db.prepare('INSERT INTO workspaces (id,user_id,workspace_id,data,created_at) VALUES (?,?,?,?,?)').run('w1', U, 'w1', JSON.stringify(ws('w1')), 'x');
  assert.deepEqual(migrate(db, 14), [14]);
  for (const t of ['metrics', 'measurements']) {
    const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
    assert.ok(cols.includes('user_id') && cols.includes('workspace_id'), `${t} is tenant-scoped`);
  }
  assert.equal(new Repo(db).listMetrics({ userId: U, workspaceId: 'w1' }).length, 0);
});

test('a reason is kept only for an edit of CONFIRMED knowledge; a draft edit carries none; the history groups drafts and ends them with the approval', async () => {
  const { repo, s } = fresh();
  const { versionHistory } = await import('../../src/core/versionHistory.ts');
  const o = repo.createObject(s, { type: 'Fact', status: 'Proposed', provenance: 'AI Suggested', title: 'قیمت', content: 'سی', nodeId: 'business' }, { actor: 'mcp', label: 'Claude' });
  repo.updateObject(s, o.id, { content: 'چهل' }, { actor: 'user', reason: 'دلیل-پیش‌نویس' });
  repo.updateObject(s, o.id, { content: 'پنجاه' }, { actor: 'user', reason: 'دلیل-دوم' });
  repo.updateObject(s, o.id, { status: 'Confirmed' }, { actor: 'user', reason: 'تأیید با دلیل' });
  repo.updateObject(s, o.id, { content: 'شصت' }, { actor: 'user', reason: 'قیمت بالا رفت' });
  const list = repo.listChanges(s, { objectId: o.id });
  assert.ok(!list.some((c) => c.reason === 'دلیل-پیش‌نویس' || c.reason === 'دلیل-دوم'), 'draft edits record no reason');
  assert.ok(list.some((c) => c.kind === 'proposal_accepted' && c.reason === 'تأیید با دلیل'), 'approving may carry a reason');
  assert.ok(list.some((c) => c.kind === 'edited' && c.reason === 'قیمت بالا رفت'), 'a confirmed edit keeps its reason');
  const h = versionHistory(list);
  assert.deepEqual(h.entries.map((e) => e.type), ['drafts', 'milestone', 'milestone']);
  assert.equal((h.entries[0] as any).count, 3);
  assert.equal(h.lastApproval?.version, 4);
  assert.equal(repo.getObject(s, o.id)!.version, 4, 'the version counter is the same as before');
});

test('migration 15: a saved pack may be a saved «درخواست برای AI» (kind + template); old packs stay plain', () => {
  const db = new Database(':memory:');
  migrate(db, 14);
  db.prepare('INSERT INTO workspaces (id,user_id,workspace_id,data,created_at) VALUES (?,?,?,?,?)').run('w1', U, 'w1', JSON.stringify(ws('w1')), 'x');
  db.prepare("INSERT INTO saved_packs (id,user_id,workspace_id,name,selection,instruction,created_at,updated_at) VALUES ('pk_old',?,?,?,?,?,?,?)").run(U, 'w1', 'قدیمی', JSON.stringify({ nodeIds: [], facets: [], statuses: [], includeAssumptions: true }), '', 'x', 'x');
  assert.deepEqual(migrate(db, 15), [15]);
  const repo = new Repo(db);
  const s = { userId: U, workspaceId: 'w1' };
  assert.equal(repo.getSavedPack(s, 'pk_old')!.kind, undefined);
  const q = repo.saveSavedPack(s, { name: 'ممیزی', kind: 'audit', template: ' طرح را بسنج ', selection: {} });
  assert.deepEqual([q.kind, q.template], ['audit', 'طرح را بسنج']);
  assert.equal(repo.saveSavedPack(s, { id: q.id, name: 'ممیزی', kind: 'zzz', template: 'x', selection: {} }).kind, undefined, 'an unknown kind makes it a plain pack');
});

test('migration 16 + usage counters: a catalog key is counted, anything else is refused, and nothing but key / number / time is stored', () => {
  const db = new Database(':memory:');
  migrate(db, 15);
  assert.deepEqual(migrate(db, 16), [16]);
  const repo = new Repo(db);
  repo.bumpUsage(U, 'view.home'); repo.bumpUsage(U, 'view.home'); repo.bumpUsage(U, 'dialog.record');
  const rows = repo.listUsage(U);
  assert.deepEqual(rows.map((r) => [r.feature, r.count]), [['view.home', 2], ['dialog.record', 1]]);
  for (const bad of ['قیمت اشتراک', 'dm_price2', 'view.nope', '', undefined, { a: 1 }]) assert.throws(() => repo.bumpUsage(U, bad), RepoError, String(bad));
  const cols = (db.prepare('PRAGMA table_info(usage_events)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.deepEqual(cols.sort(), ['count', 'feature', 'last_at', 'user_id'], 'no column could hold user text');
  assert.deepEqual(repo.listUsage('someone-else'), []);
});

test('a metric and its numbers: every write leaves a Change; metric changes stay out of the Context change list', () => {
  const { repo, s } = fresh();
  const m = repo.createMetric(s, { name: ' سفارش   هفتگی ', unit: 'سفارش', direction: 'up', target: 120 });
  assert.deepEqual([m.name, m.unit, m.direction, m.target], ['سفارش هفتگی', 'سفارش', 'up', 120]);
  assert.throws(() => repo.createMetric(s, { name: 'سفارش هفتگی', direction: 'up' }), RepoError, 'duplicate name');
  assert.throws(() => repo.createMetric(s, { name: 'x', direction: 'sideways' }), RepoError);
  assert.throws(() => repo.createMetric(s, { name: '', direction: 'up' }), RepoError);
  const a = repo.addMeasurement(s, { metricId: m.id, value: 100, at: '2026-03-01', note: ' خوب ' });
  assert.deepEqual([a.status, a.source, a.note], ['Confirmed', 'manual', 'خوب']);
  assert.throws(() => repo.addMeasurement(s, { metricId: m.id, value: Number.NaN }), RepoError);
  assert.throws(() => repo.addMeasurement(s, { metricId: m.id, value: 1, at: '2026-02-30' }), RepoError);
  assert.throws(() => repo.addMeasurement(s, { metricId: 'nope', value: 1 }), RepoError);
  repo.updateMetric(s, m.id, { target: 130 });
  repo.removeMeasurement(s, a.id);
  repo.archiveMetric(s, m.id);
  assert.throws(() => repo.addMeasurement(s, { metricId: m.id, value: 1 }), RepoError, 'an archived metric takes no new numbers');
  const kinds = repo.listChanges(s, { objectId: `metric:${m.id}`, includeNodes: true }).map((c) => c.kind);
  assert.deepEqual(kinds, ['metric_created', 'measurement_added', 'metric_edited', 'measurement_removed', 'metric_archived']);
  assert.deepEqual(repo.listChanges(s), [], 'the Context change list (digest, weekly review) does not see metric changes');
  assert.equal(repo.listMetrics(s).length, 1, 'archived, not deleted');
});

test('a number from an MCP client is ALWAYS a proposal: invisible to the series until the user confirms it', () => {
  const { repo, s } = fresh();
  const m = repo.createMetric(s, { name: 'ماندگاری', unit: '٪', direction: 'up' });
  const p = repo.addMeasurement(s, { metricId: m.id, value: 70, at: '2026-03-02', source: 'mcp' }, { actor: 'mcp', label: 'Claude' });
  assert.equal(p.status, 'Proposed');
  assert.equal(repo.listMeasurements(s, { status: 'Confirmed' }).length, 0);
  const prop = repo.listChanges(s, { objectId: `metric:${m.id}`, includeNodes: true }).at(-1)!;
  assert.deepEqual([prop.kind, prop.actor, prop.actorLabel], ['measurement_proposed', 'mcp', 'Claude']);
  repo.confirmMeasurement(s, p.id);
  assert.equal(repo.getMeasurement(s, p.id)!.status, 'Confirmed');
  assert.equal(repo.listChanges(s, { objectId: `metric:${m.id}`, includeNodes: true }).at(-1)!.kind, 'measurement_added');
});

test('pasted CSV is all-or-nothing per line set: good lines are stored, bad lines are returned; reset clears metrics', () => {
  const { repo, s } = fresh();
  repo.createMetric(s, { name: 'سفارش', direction: 'up' });
  const r = repo.addMeasurementsCsv(s, 'سفارش, ۱۰, 2026-03-01\nسفارش, 12, 2026-03-08\nجز ناشناخته, 3\nسفارش, abc');
  assert.equal(r.added.length, 2);
  assert.deepEqual(r.errors.map((e) => e.reason), ['unknown_metric', 'bad_value']);
  assert.ok(r.added.every((x) => x.source === 'csv' && x.status === 'Confirmed'));
  repo.resetWorkspaceData(s);
  assert.deepEqual([repo.listMetrics(s).length, repo.listMeasurements(s).length], [0, 0]);
});

test('the verdict on an expectation is a Change with the metric and the last number it was read against; the text alone is enough without one', () => {
  const { repo, s } = fresh();
  const m = repo.createMetric(s, { name: 'سفارش', direction: 'up' });
  repo.addMeasurement(s, { metricId: m.id, value: 112, at: '2026-02-28' });
  repo.addMeasurement(s, { metricId: m.id, value: 130, at: '2026-04-01' }); // after the `by` date: not the one it is read against
  const d = repo.createObject(s, { type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'کانال', content: 'اینستاگرام', nodeId: 'business', record: { metricExpectation: { metricId: m.id, direction: 'up', targetValue: 110, by: '2026-03-01' } } });
  assert.equal(repo.getObject(s, d.id)!.record?.metricExpectation?.targetValue, 110, 'the expectation is stored with the decision');
  assert.equal(repo.getObject(s, d.id)!.version, 1);
  const c = repo.noteOutcome(s, d.id, '', undefined, 'met');
  assert.equal(c.kind, 'outcome_noted');
  assert.deepEqual([c.after?.verdict, c.after?.metricId, c.after?.value, c.after?.valueAt], ['met', m.id, 112, '2026-02-28']);
  assert.throws(() => repo.noteOutcome(s, d.id, '', undefined), RepoError, 'neither text nor verdict');
  assert.throws(() => repo.noteOutcome(s, d.id, 'x', undefined, 'great' as never), RepoError);
  const plain = repo.noteOutcome(s, d.id, 'یک یادداشت ساده');
  assert.equal(plain.after, undefined, 'a plain note carries no verdict');
  // an invalid expectation (bad date / direction) is dropped, not stored
  const bad = repo.createObject(s, { type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'بد', content: 'x', nodeId: 'business', record: { metricExpectation: { metricId: m.id, direction: 'left' as never, by: '2026-13-40' } } });
  assert.equal(repo.getObject(s, bad.id)!.record, undefined);
});

test('migration 18: nodes that were locked (is_system = 1) are ordinary now — and nothing else changes', () => {
  const db = new Database(':memory:');
  migrate(db, 17);
  db.prepare('INSERT INTO workspaces (id,user_id,workspace_id,data,created_at) VALUES (?,?,?,?,?)').run('w1', U, 'w1', JSON.stringify(ws('w1')), 'x');
  db.prepare('INSERT INTO tree_nodes (id,user_id,workspace_id,parent_id,label,description,is_system,ord) VALUES (?,?,?,?,?,?,?,?)').run('business', U, 'w1', null, 'کسب‌وکار', '', 1, 0);
  db.prepare('INSERT INTO tree_nodes (id,user_id,workspace_id,parent_id,label,description,is_system,ord) VALUES (?,?,?,?,?,?,?,?)').run('mine', U, 'w1', 'business', 'گرهٔ من', '', 0, 1);
  db.prepare('INSERT INTO context_objects (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('c1', U, 'w1', 'Fact', 'Confirmed', 'User Input', 'عنوان', 'متن', 'business', 't', 't');
  assert.deepEqual(migrate(db, 18), [18]);
  const repo = new Repo(db);
  const s = { userId: U, workspaceId: 'w1' };
  assert.deepEqual(repo.listNodes(s).map((n) => [n.id, n.label]), [['business', 'کسب‌وکار'], ['mine', 'گرهٔ من']], 'the nodes are intact');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM tree_nodes WHERE is_system = 1').get() as { n: number }).n, 0);
  assert.equal(repo.listObjects(s)[0].nodeId, 'business', 'the knowledge is untouched');
  // the node that used to be locked now deletes like any other once another root exists
  const root = repo.createNode(s, { label: 'خدمات' });
  repo.deleteNode(s, 'business', root.id);
  assert.equal(repo.listObjects(s)[0].nodeId, root.id);
  assert.ok(!repo.listNodes(s).some((n) => n.id === 'business'));
});

test('moving a node: to the top level, between levels and within its siblings — its knowledge, notes and relations go with it, and the move is on record', () => {
  const { repo, s } = fresh();
  const w = repo.createNode(s, { parentId: 'offer', label: 'کارگاه' });
  const k = repo.createNode(s, { parentId: w.id, label: 'جلسه‌ها' });
  const o = repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'قیمت کارگاه', content: 'نود', nodeId: k.id });
  const n = repo.createNote(s, w.id, 'یادداشت کارگاه');
  const f = repo.createObject(s, { type: 'Fact', provenance: 'User Input', title: 'دیگری', content: 'x', nodeId: 'product' });
  repo.setDependencies(s, o.id, [f.id]);
  // to the top level
  repo.moveNode(s, w.id, '', undefined, 'کارگاه مستقل شد');
  let nodes = repo.listNodes(s);
  assert.equal(nodes.find((x) => x.id === w.id)!.parentId, undefined, 'a main section now');
  assert.equal(nodes.find((x) => x.id === k.id)!.parentId, w.id, 'its own sub-nodes stay under it');
  assert.equal(repo.getObject(s, o.id)!.nodeId, k.id, 'the knowledge stays where it is — in its node');
  assert.equal(repo.listNotes(s).find((x) => x.id === n.id)!.nodeId, w.id);
  assert.ok(repo.listRelationships(s).some((r) => r.sourceId === o.id && r.targetId === f.id), 'relations are untouched');
  const rec = repo.listChanges(s, { includeNodes: true }).find((c) => c.kind === 'node_moved' && c.objectId === `node:${w.id}`);
  assert.equal(rec?.reason, 'کارگاه مستقل شد');
  // back under a node, then reordered among siblings
  repo.moveNode(s, w.id, 'brand');
  assert.equal(repo.listNodes(s).find((x) => x.id === w.id)!.parentId, 'brand');
  const second = repo.createNode(s, { parentId: 'brand', label: 'دوم' });
  repo.moveNode(s, second.id, 'brand', 0);
  const kids = repo.listNodes(s).filter((x) => x.parentId === 'brand').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x) => x.id);
  assert.equal(kids[0], second.id, 'reordered to the first place');
  // never into itself; moving to the same place records nothing new
  assert.throws(() => repo.moveNode(s, w.id, k.id), RepoError);
  const before = repo.listChanges(s, { includeNodes: true }).length;
  repo.moveNode(s, second.id, 'brand', 1);
  assert.equal(repo.listChanges(s, { includeNodes: true }).length, before, 'a pure reorder is not a «moved» record');
});
