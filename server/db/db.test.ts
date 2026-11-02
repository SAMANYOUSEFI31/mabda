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
