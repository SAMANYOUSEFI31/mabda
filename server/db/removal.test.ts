import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';
import { Repo, RepoError } from './repo.ts';
import { archiveDeliverable, archiveWorkspace, archivedObjects, deleteDeliverable, deleteWorkspace, listRemovals, purgeImpact, purgeObject, removeNode, restoreDeliverable, restoreObject, undoRemoval, wipeUser } from './removal.ts';
import type { GeneratedDeliverable, Workspace } from '../../src/types/index.ts';

const U = 'local';
const ws = (id: string): Workspace => ({ id, name: id, slug: id, description: '', planId: 'pro', creditsRemaining: 100, todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' } as Workspace);
const fresh = () => { const db = new Database(':memory:'); migrate(db); const repo = new Repo(db); repo.saveWorkspace(U, ws('w1')); return { db, repo, s: { userId: U, workspaceId: 'w1' } }; };
const del = (id: string, title: string, content: string, used: Array<[string, number]> = []): GeneratedDeliverable => ({
  id, workspaceId: 'w1', workstreamId: 'x', deliverableId: 'd', title, content, executionMode: 'auto', creditCost: 0, usedContext: used.map(([i, version]) => ({ id: i, version })), rebuildCount: 0, createdAt: '2026-02-01T00:00:00Z',
} as GeneratedDeliverable);
/** every row of every table, as text — what «no trace anywhere» is measured against */
const dump = (db: Database.Database) => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
  .map((t) => `## ${t.name}\n${(db.prepare(`SELECT * FROM ${t.name}`).all() as unknown[]).map((r) => JSON.stringify(r)).join('\n')}`).join('\n');

const SECRET = 'کارت-6037-9971-2345-6789-نشانهٔ-یکتا';
const SECRET_PERSIAN_DIGITS = 'شمارهٔ کارت من ۶۰۳۷-۹۹۷۱-۲۳۴۵-۶۷۸۹ است';

test('permanent delete: after it, NO table holds any trace of the text — versions, changes (before / after / reason), draft, relations, canvas place, judgments, packs, and the copies she chose are gone; one record without content stays', () => {
  const { db, repo, s } = fresh();
  const node = repo.listNodes(s)[0].id;
  const other = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'یک دانش دیگر', content: 'متن بی‌خطر', nodeId: node });
  const o = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'شماره', content: SECRET, nodeId: node });
  repo.updateObject(s, o.id, { content: `${SECRET} ویرایش دوم`, title: 'شمارهٔ ویرایش‌شده' }, { reason: `چون ${SECRET}` });
  repo.updateObject(s, o.id, { content: `${SECRET} پیش‌نویس`, asDraft: true } as never, { reason: 'پیش‌نویس' });
  repo.setDependencies(s, other.id, [o.id]);
  repo.saveCanvasItem(s, 'free', `obj:${o.id}`, { x: 10, y: 20 });
  db.prepare('INSERT INTO context_judgments (object_id, version, kind, user_id, workspace_id, ambiguous, reason, created_at) VALUES (?,?,?,?,?,?,?,?)').run(o.id, 2, 'ambiguity', U, 'w1', 1, `مبهم: ${SECRET}`, 't');
  db.prepare('INSERT INTO contradiction_judgments (user_id, workspace_id, pair_key, a_id, a_version, b_id, b_version, conflict, reason, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(U, 'w1', 'k', o.id, 2, other.id, 1, 1, `تناقض ${SECRET}`, 't');
  repo.savePack(s, { title: 'بستهٔ ثبت‌شده', refs: [{ id: o.id, version: 2 }, { id: other.id, version: 1 }], tokens: 10 });
  const used = del('d_used', 'خروجی ساخته‌شده', 'متن خودش، بدون آن کلمات', [[o.id, 2]]);
  const copy = del('d_copy', 'خروجی که نقل کرده', `نقل: ${SECRET}`);
  repo.saveDeliverable(s, used); repo.saveDeliverable(s, copy);
  const note = repo.createNote(s, node, `یادداشت\n${SECRET_PERSIAN_DIGITS}\nخط سوم`);
  repo.saveSession(s, { id: 'ses1', workspaceId: 'w1', title: 'گفتگو', createdAt: 't', updatedAt: 't', chatMode: 'discovery', selectedNodeIds: [], messages: [{ id: 'm', role: 'user', content: SECRET, timestamp: 't', executionMode: 'auto', creditCost: 0 }] } as never);
  const f = repo.createFile(s, { name: 'گزارش.txt', mime: 'text/plain', sizeBytes: 10, nodeId: node, rawText: SECRET, tokens: 5 });
  repo.saveChunks(s, f.id, [{ index: 0, text: SECRET, tokens: 5 }]);
  repo.setFileStatus(s, f.id, 'ready');
  assert.ok(dump(db).includes('6037-9971-2345-6789'), 'sanity: the text is in the database before');

  // only out-of-the-way knowledge can be erased
  assert.throws(() => purgeObject(repo, s, o.id), (e: unknown) => e instanceof RepoError && e.code === 'forbidden');
  repo.updateObject(s, o.id, { status: 'Archived' });
  const impact = purgeImpact(repo, s, o.id);
  assert.deepEqual(impact.usedIn.map((x) => x.id), ['d_used'], 'the output built from it is named');
  assert.ok(impact.versions >= 2 && impact.changes >= 3 && impact.relationships === 1);
  assert.deepEqual(impact.copies.notes.map((n) => n.id), [note.id], 'a note that says the same, found though its digits are in another script');
  assert.deepEqual(impact.copies.sessions.map((x) => x.id), ['ses1']);
  assert.deepEqual(impact.copies.deliverables.map((x) => x.id), ['d_copy']);
  assert.deepEqual(impact.copies.files.map((x) => x.id), [f.id], 'a file can not be edited: it is listed so she knows');
  assert.ok(!JSON.stringify(impact).includes('6037'), 'the impact never repeats the text it is about to erase');

  const r = purgeObject(repo, s, o.id, { notes: [note.id], sessions: ['ses1'], deliverables: ['d_copy'] });
  assert.deepEqual(r.scrubbed, { notes: 1, thoughts: 0, sessions: 1, deliverables: 1 });
  // the file is the one place she did not (and could not) clean: take it out of the measure, then NOTHING may be left
  repo.deleteFile(s, f.id);
  const after = dump(db);
  for (const needle of ['6037-9971-2345-6789', '6037', 'نشانهٔ-یکتا', 'شمارهٔ ویرایش‌شده', 'ویرایش دوم', 'پیش‌نویس']) assert.ok(!after.includes(needle), `no trace of «${needle}» in any table`);
  assert.equal(repo.getObjectAny(s, o.id), undefined);
  assert.equal(repo.listVersions(s, o.id).length, 0);
  assert.deepEqual(repo.listChanges(s, { objectId: o.id }).map((c) => [c.kind, c.reason]), [['purged', 'یک مورد حذف دائمی شد']], 'only a record that says nothing about the content');
  assert.equal(repo.listRelationships(s).length, 0);
  assert.equal(repo.listNotes(s).find((n) => n.id === note.id)?.content, 'یادداشت\nخط سوم', 'only the line that said it was removed from the note');
  assert.equal(repo.getDeliverable(s, 'd_used')?.content, 'متن خودش، بدون آن کلمات', 'an output built from it keeps its own text (its name is simply gone)');
  assert.ok(!JSON.stringify(repo.getDeliverable(s, 'd_used')).includes(o.id), 'not even its id is left in the output');
  assert.equal((repo.getDeliverable(s, 'd_used') as { removedSources?: number }).removedSources, 1, 'the card says «۱ منبع حذف‌شده»');
  assert.ok(repo.getObject(s, other.id), 'nothing else was touched');
});

test('restore: archived knowledge comes back with the status it had; permanent delete is refused for anything that is not out of the way', () => {
  const { repo, s } = fresh();
  const node = repo.listNodes(s)[0].id;
  const p = repo.createObject(s, { type: 'Decision', status: 'Proposed', provenance: 'AI Suggested', title: 'پیشنهاد', content: 'x', nodeId: node });
  repo.updateObject(s, p.id, { status: 'Archived' });
  assert.deepEqual(archivedObjects(repo, s).map((x) => x.id), [p.id]);
  const back = restoreObject(repo, s, p.id);
  assert.equal(back.object.status, 'Proposed', 'a suggestion comes back as a suggestion, not as truth');
  assert.throws(() => restoreObject(repo, s, p.id), /فقط مورد بایگانی‌شده برمی‌گردد/);
  assert.throws(() => purgeObject(repo, s, p.id), /فقط از بایگانی/);
});

test('node delete with undo (move): the sub-sections, the knowledge, the notes and the order come back exactly', () => {
  const { repo, s } = fresh();
  const a = repo.createNode(s, { parentId: repo.listNodes(s)[0].id, label: 'الف' });
  const b = repo.createNode(s, { parentId: a.id, label: 'ب' });
  const c = repo.createNode(s, { parentId: b.id, label: 'ج' });
  const k = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'دانش ب', content: 'x', nodeId: b.id });
  const kc = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'دانش ج', content: 'x', nodeId: c.id });
  const n = repo.createNote(s, b.id, 'یادداشت ب');
  const before = JSON.stringify(repo.listNodes(s));
  assert.throws(() => removeNode(repo, s, b.id, {}), /خالی نیست/, 'a section with content must be told where it goes');
  const r = removeNode(repo, s, b.id, { transferTo: a.id });
  assert.equal(r.plan.target, a.id);
  assert.ok(!repo.listNodes(s).some((x) => x.id === b.id));
  assert.equal(repo.getObject(s, k.id)!.nodeId, a.id, 'its knowledge moved to the parent');
  assert.equal(repo.listNodes(s).find((x) => x.id === c.id)!.parentId, a.id, 'its sub-section came up one level');
  assert.equal(repo.getObject(s, kc.id)!.nodeId, c.id, 'deeper knowledge did not move');
  assert.deepEqual(listRemovals(repo, s).map((x) => x.id), [r.removal.id]);
  undoRemoval(repo, s, r.removal.id);
  assert.equal(JSON.stringify(repo.listNodes(s)), before, 'the tree is exactly as it was (ids, parents, order)');
  assert.equal(repo.getObject(s, k.id)!.nodeId, b.id);
  assert.equal(repo.listNotes(s).find((x) => x.id === n.id)!.nodeId, b.id);
  assert.deepEqual(listRemovals(repo, s), [], 'an undone removal leaves the list');
  assert.throws(() => undoRemoval(repo, s, r.removal.id), /قبلاً برگردانده/);
});

test('node delete (archive the branch): the branch\'s knowledge is archived with a reason, its notes go to the parent, and an undo restores the statuses', () => {
  const { repo, s } = fresh();
  const root = repo.listNodes(s)[0].id;
  const w = repo.createNode(s, { parentId: root, label: 'کارگاه' });
  const w1 = repo.createNode(s, { parentId: w.id, label: 'برنامه' });
  const w2 = repo.createNode(s, { parentId: w.id, label: 'قیمت' });
  const k1 = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'یک', content: 'x', nodeId: w1.id });
  const k2 = repo.createObject(s, { type: 'Decision', status: 'Proposed', provenance: 'User Input', title: 'دو', content: 'x', nodeId: w2.id });
  const note = repo.createNote(s, w2.id, 'یادداشت قیمت');
  const r = removeNode(repo, s, w.id, { mode: 'archive', transferTo: root });
  assert.equal(r.plan.counts.archived, 2);
  assert.equal(repo.listNodes(s).some((x) => x.label === 'کارگاه'), false);
  assert.equal(repo.getObjectAny(s, k1.id)!.status, 'Archived');
  assert.equal(repo.getObjectAny(s, k2.id)!.status, 'Archived');
  assert.ok(repo.listChanges(s, { objectId: k1.id }).some((c) => /با شاخه‌اش بایگانی شد/.test(c.reason ?? '')), 'a reason is on record');
  assert.equal(repo.listNotes(s).find((x) => x.id === note.id)!.nodeId, root, 'notes are not lost: they go to the parent');
  undoRemoval(repo, s, r.removal.id);
  assert.equal(repo.getObjectAny(s, k1.id)!.status, 'Confirmed');
  assert.equal(repo.getObjectAny(s, k2.id)!.status, 'Proposed', 'a suggestion comes back as a suggestion');
  assert.equal(repo.listNotes(s).find((x) => x.id === note.id)!.nodeId, w2.id);
  assert.deepEqual(repo.listNodes(s).filter((x) => [w.id, w1.id, w2.id].includes(x.id)).map((x) => x.parentId ?? null).sort(), [root, w.id, w.id].sort());
});

test('node delete refuses what the plan refuses: the last main section, a target inside the branch', () => {
  const { repo, s } = fresh();
  const roots = repo.listNodes(s).filter((n) => !n.parentId);
  for (const r of roots.slice(1)) removeNode(repo, s, r.id, { transferTo: roots[0].id });
  assert.throws(() => removeNode(repo, s, roots[0].id, {}), /آخرین گرهٔ اصلی/);
  const a = repo.createNode(s, { parentId: roots[0].id, label: 'تازه' });
  const b = repo.createNode(s, { parentId: a.id, label: 'زیر' });
  repo.createNote(s, a.id, 'x');
  assert.throws(() => removeNode(repo, s, a.id, { transferTo: b.id }), /مقصد/);
});

test('outputs: archive hides it from the stale count; restore brings it back; delete removes the row; saving it again does not un-archive', () => {
  const { repo, s } = fresh();
  const node = repo.listNodes(s)[0].id;
  const o = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'قیمت', content: 'x', nodeId: node });
  repo.saveDeliverable(s, del('d1', 'خروجی', 'متن', [[o.id, o.version]]));
  repo.updateObject(s, o.id, { content: 'y' });
  assert.equal(repo.computeStale(s).length, 1, 'it is stale');
  archiveDeliverable(repo, s, 'd1');
  assert.equal(repo.computeStale(s).length, 0, 'an archived output is not counted');
  repo.saveDeliverable(s, { ...repo.getDeliverable(s, 'd1')!, title: 'ویرایش' });
  assert.ok(repo.getDeliverable(s, 'd1')!.archivedAt, 'a save does not un-archive');
  restoreDeliverable(repo, s, 'd1');
  assert.equal(repo.computeStale(s).length, 1);
  deleteDeliverable(repo, s, 'd1');
  assert.equal(repo.getDeliverable(s, 'd1'), undefined);
  assert.equal(repo.computeStale(s).length, 0);
});

test('a replay never breaks when what an output was built from is gone: no stale reason, no error', () => {
  const { repo, s } = fresh();
  const node = repo.listNodes(s)[0].id;
  const o = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'قیمت', content: 'x', nodeId: node });
  repo.saveDeliverable(s, del('d1', 'خروجی', 'متن', [[o.id, 1]]));
  repo.updateObject(s, o.id, { status: 'Archived' });
  purgeObject(repo, s, o.id);
  assert.deepEqual(repo.computeStale(s), [], 'a missing source is not a reason to call the output outdated');
  assert.equal(repo.state(s).deliverables.length, 1);
});

test('workspace: archive keeps everything; delete removes EVERY row of it from EVERY table (found in the schema), and nothing of another workspace', () => {
  const { db, repo, s } = fresh();
  repo.saveWorkspace(U, ws('w2'));
  const s2 = { userId: U, workspaceId: 'w2' };
  for (const sc of [s, s2]) {
    const node = repo.listNodes(sc)[0].id;
    const o = repo.createObject(sc, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: `دانش ${sc.workspaceId}`, content: `متن-${sc.workspaceId}-یکتا`, nodeId: node });
    repo.createNote(sc, node, `یادداشت-${sc.workspaceId}-یکتا`);
    repo.saveDeliverable(sc, { ...del(`d_${sc.workspaceId}`, 'x', `متن-${sc.workspaceId}-یکتا`, [[o.id, 1]]), workspaceId: sc.workspaceId });
    repo.createFile(sc, { name: 'a.txt', mime: 'text/plain', sizeBytes: 1, nodeId: node, rawText: `متن-${sc.workspaceId}-یکتا`, tokens: 1 });
  }
  archiveWorkspace(repo, U, 'w1', true);
  assert.ok(repo.getWorkspace(U, 'w1')!.archivedAt);
  repo.saveWorkspace(U, { ...repo.getWorkspace(U, 'w1')!, name: 'w1' });
  assert.ok(repo.getWorkspace(U, 'w1')!.archivedAt, 'a client save does not un-archive');
  archiveWorkspace(repo, U, 'w1', false);
  assert.equal(repo.getWorkspace(U, 'w1')!.archivedAt, undefined);
  deleteWorkspace(repo, U, 'w1');
  const text = dump(db);
  assert.ok(!text.includes('w1-یکتا'), 'no word of the deleted workspace is anywhere');
  assert.ok(text.includes('w2-یکتا'), 'the other workspace is untouched');
  assert.equal(repo.getWorkspace(U, 'w1'), undefined);
  for (const t of (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((x) => x.name)) {
    const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
    if (cols.includes('workspace_id')) assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE workspace_id = 'w1'`).get() as { n: number }).n, 0, `${t} has no row of w1`);
  }
});

test('the whole account: every row of the user in every table is gone, the install is empty, and no seed workspace comes back by itself', () => {
  const { db, repo, s } = fresh();
  const node = repo.listNodes(s)[0].id;
  repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'سری', content: 'کلمه-بسیار-سری', nodeId: node });
  repo.createNote(s, node, 'یادداشت-بسیار-سری');
  repo.saveSavedPack(s, { name: 'بسته-بسیار-سری', selection: {}, instruction: '' });
  repo.bumpUsage(U, 'view.home');
  const r = wipeUser(repo, U);
  assert.ok(r.removed > 5);
  assert.equal(repo.listWorkspaces(U).length, 0);
  const text = dump(db);
  assert.ok(!text.includes('بسیار-سری'));
  assert.equal(repo.isImported(U), true, 'marked as done: the next start does not seed a sample workspace behind her back');
  assert.deepEqual(repo.listUsage(U), [], 'even the usage counters of this user are gone');
});

test('on disk too: after an erase for good the words are not in the database file nor in its log (secure_delete + checkpoint)', async () => {
  const { mkdtempSync, readFileSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { openDatabase } = await import('./database.ts');
  const dir = mkdtempSync(join(tmpdir(), 'mabda-erase-'));
  const file = join(dir, 'm.sqlite');
  try {
    const db = openDatabase(file);
    const repo = new Repo(db);
    repo.saveWorkspace(U, ws('w1'));
    const s = { userId: U, workspaceId: 'w1' };
    const o = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'شماره', content: `${SECRET} ${'متن-بلند '.repeat(40)}`, nodeId: repo.listNodes(s)[0].id });
    repo.updateObject(s, o.id, { content: `${SECRET} نسخهٔ دوم` });
    const bytes = () => Buffer.concat([readFileSync(file), existsSync(`${file}-wal`) ? readFileSync(`${file}-wal`) : Buffer.alloc(0)]);
    assert.ok(bytes().includes(Buffer.from('6037-9971-2345-6789')), 'sanity: it is in the file before');
    repo.updateObject(s, o.id, { status: 'Archived' });
    purgeObject(repo, s, o.id);
    assert.ok(!bytes().includes(Buffer.from('6037-9971-2345-6789')), 'not in the database file or its log');
    assert.ok(!bytes().includes(Buffer.from('نشانهٔ-یکتا')), 'not the Persian words either');
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('permanent delete reaches the THOUGHT tables: the thoughts she picks (text, revisions, events, about, derivations) are erased; thoughts that were only about it or became it lose the pointer and say «منبع حذف‌شده»', () => {
  const { db, repo, s } = fresh();
  const node = repo.listNodes(s)[0].id;
  const note2 = repo.createNote(s, node, '[فرض] چیزی کاملاً متفاوت');
  const became = repo.listThoughts(s).find((t) => t.sourceNoteId === note2.id)!;
  // the knowledge that will be erased was made FROM a thought (different words), and holds the secret
  const o = repo.createObject(s, { type: 'Fact', status: 'Proposed', provenance: 'User Input', title: 'شمارهٔ محرمانه', content: SECRET, nodeId: node, source: { kind: 'note', thoughtId: became.id, at: '2026-03-01T00:00:00Z' } });
  // a thought that SAYS it (typed, revised, derived from) — she will erase it
  const note = repo.createNote(s, node, `[ایده] ${SECRET}`);
  const said = repo.listThoughts(s).find((t) => t.sourceNoteId === note.id)!;
  repo.reviseThought(s, said.id, `${SECRET} نسخهٔ ویرایش‌شده`);
  repo.setThoughtAbout(s, said.id, [{ kind: 'object', id: o.id }]);
  const child = repo.deriveThought(s, { parentIds: [said.id], nodeId: node, kind: 'idea', text: 'فکر مشتق، بدون آن کلمات' }).thought;
  // a thought that is only ABOUT it
  const about = repo.insertThought(s, { nodeId: node, kind: 'question', text: 'این چه بود؟', about: [{ kind: 'object', id: o.id }] });
  assert.ok(dump(db).includes('6037-9971-2345-6789'), 'sanity: the text is in the thought tables too');

  repo.updateObject(s, o.id, { status: 'Archived' });
  const impact = purgeImpact(repo, s, o.id);
  assert.deepEqual(impact.copies.thoughts.map((t) => t.id), [said.id], 'only the thought that says the words is a «copy» — found by its text, and by its earlier wording');
  assert.deepEqual(impact.pointers, { thoughtsAbout: 2, thoughtsConverted: 1 });
  assert.ok(!JSON.stringify(impact).includes('6037'), 'the impact never repeats the text');

  const r = purgeObject(repo, s, o.id, { notes: [note.id], thoughts: [said.id] });
  assert.equal(r.scrubbed.thoughts, 1);
  const after = dump(db);
  for (const needle of ['6037-9971-2345-6789', '6037', 'نسخهٔ ویرایش‌شده']) assert.ok(!after.includes(needle), `no trace of «${needle}» in ANY table, thought tables included`);
  assert.equal(repo.getThought(s, said.id), undefined);
  for (const tbl of ['thought_revisions', 'thought_events', 'thought_about']) assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE thought_id = ?`).get(said.id) as { n: number }).n, 0, tbl);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM thought_derivations WHERE parent_id = ? OR child_id = ?').get(said.id, said.id) as { n: number }).n, 0, 'derivation links of the erased thought are gone');
  assert.ok(repo.getThought(s, child.id), 'the derived thought is hers and stays');
  const thoughtTables = ['thoughts', 'thought_revisions', 'thought_events', 'thought_about', 'thought_derivations'].map((t) => JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all())).join('');
  assert.ok(!thoughtTables.includes(o.id), 'not even the id of the erased knowledge is left in a thought table (the knowledge records only an empty «purged» change)');
  // the two that were not chosen: alive, pointer gone
  assert.deepEqual(repo.getThought(s, about.id)!.aboutObjectIds ?? [], []);
  const b = repo.getThought(s, became.id)!;
  assert.equal(b.resolvedObjectId, undefined);
  assert.equal(b.resolvedRemoved, true);
  assert.equal(b.status, 'resolved');
});
