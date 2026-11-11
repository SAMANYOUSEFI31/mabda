import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';
import { Repo, RepoError } from './repo.ts';
import { parseThinking, isQuestionLine, kindOfLine } from '../../src/core/thinkingMarkers.ts';
import { thoughtInScope, thoughtsAbout } from '../../src/core/thoughtAbout.ts';
import { effectiveObjects } from '../../src/core/effectiveContext.ts';
import { calculateReadinessAndGaps } from '../../src/core/contextEngine.ts';
import { WORKSTREAM_SPECS } from '../../src/core/specs.ts';
import type { Workspace } from '../../src/types/index.ts';

const U = 'test-user';
const ws = (id: string): Workspace => ({
  id,
  name: id,
  slug: id,
  description: '',
  planId: 'pro',
  creditsRemaining: 100,
  todayChatCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
});

const freshDb = () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace(U, ws('w1'));
  return { db, repo, s: { userId: U, workspaceId: 'w1' } };
};

test('P1-1 & P1-2: stable Thought ID after text edit and reclassification preserves ID', () => {
  const { db, repo, s } = freshDb();

  const created = repo.insertThought(s, {
    kind: 'idea',
    text: 'ایده اولیه برای ساختار قیمت',
    nodeId: 'business',
  });
  assert.ok(created.id, 'thought has stable ID');

  // Text revision preserves identity
  const { thought: revised, revisions } = repo.reviseThought(s, created.id, 'ایده اصلاح‌شده برای ساختار قیمت');
  assert.equal(revised.id, created.id, 'identity preserved after text edit');
  assert.equal(revised.text, 'ایده اصلاح‌شده برای ساختار قیمت');
  assert.equal(revisions.length, 1);

  // Reclassification preserves identity
  const reclassified = repo.reclassifyThought(s, created.id, 'open_decision');
  assert.equal(reclassified.id, created.id, 'identity preserved after reclassification');
  assert.equal(reclassified.kind, 'open_decision');

  db.close();
});

test('P1-3 & P1-4: legacy migration idempotency and repeated similar lines distinctness', () => {
  const db = new Database(':memory:');
  migrate(db, 20);

  const insertNote = db.prepare('INSERT INTO notes (id,user_id,workspace_id,node_id,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  insertNote.run('note-dup', U, 'w1', 'business', '[ایده] قیمت ماهانه\n[ایده] قیمت ماهانه\n[سؤال] تخفیف سالانه؟', '2026-01-01', '2026-01-02');

  migrate(db);
  const repo = new Repo(db);
  const s = { userId: U, workspaceId: 'w1' };

  const thoughts1 = repo.listThoughts(s);
  assert.equal(thoughts1.length, 3);
  const duplicates = thoughts1.filter((t) => t.text === 'قیمت ماهانه');
  assert.equal(duplicates.length, 2, 'repeated similar Note lines produce distinct stable thoughts');
  assert.notEqual(duplicates[0].id, duplicates[1].id, 'distinct IDs for repeated lines');

  // Idempotency: re-running migration yields no duplicate thoughts
  assert.deepEqual(migrate(db), []);
  const thoughts2 = repo.listThoughts(s);
  assert.equal(thoughts2.length, 3, 'migration is strictly idempotent');

  db.close();
});

test('P1-5, P1-6, P1-7: Persian/English markers detection and question-mark inference', () => {
  const content = [
    '[ایده] بررسی بازار',
    '[سؤال] آیا هزینه سرور زیاد است',
    '[فرض] مشتریان سازمانی پرداخت سالانه را ترجیح می‌دهند',
    '[تصمیم باز] انتخاب دیتابیس رابطه‌ای یا سندگرا',
    '[idea] global expansion',
    '[question] is offline mode required',
    '[assumption] users want fast onboarding',
    '[open decision] cloud provider selection',
    'آیا رابط کاربری بهینه است؟',
    'Can we support real-time sync?',
  ].join('\n');

  const items = parseThinking(content);
  assert.equal(items.length, 10);
  assert.equal(items[0].kind, 'idea');
  assert.equal(items[1].kind, 'question');
  assert.equal(items[2].kind, 'assumption');
  assert.equal(items[3].kind, 'open_decision');
  assert.equal(items[4].kind, 'idea');
  assert.equal(items[5].kind, 'question');
  assert.equal(items[6].kind, 'assumption');
  assert.equal(items[7].kind, 'open_decision');
  assert.equal(items[8].kind, 'question');
  assert.equal(items[8].inferred, true);
  assert.equal(items[9].kind, 'question');
  assert.equal(items[9].inferred, true);

  assert.equal(isQuestionLine('این یک سؤال است؟'), true);
  assert.equal(kindOfLine('چرا این بخش مهم است؟'), 'question');
});

test('P1-8 & P1-9: resolved legacy line preservation and converted legacy Thought linking', () => {
  const db = new Database(':memory:');
  migrate(db, 20);

  const notes = [
    { id: 'section-conv', content: 'پشتیبانی از درگاه بانکی ✓ (بخش «پرداخت» از همین ساخته شد)' },
    { id: 'object-conv', content: '[ایده] قیمت اشتراک ۴۹۰ باشد' },
  ];
  const insertNote = db.prepare('INSERT INTO notes (id,user_id,workspace_id,node_id,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  for (const n of notes) insertNote.run(n.id, U, 'w1', 'business', n.content, '2026-01-01', '2026-01-02');

  const insertObject = db.prepare(`INSERT INTO context_objects
    (id,user_id,workspace_id,type,status,provenance,title,content,node_id,created_at,updated_at,source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const source = (noteId: string, lineKey: string, quote: string) => JSON.stringify({ kind: 'note', noteId, lineKey, quote });
  insertObject.run('converted-obj', U, 'w1', 'Fact', 'Proposed', 'User Input', 'قیمت اشتراک', 'قیمت اشتراک ۴۰۰ باشد', 'business', 't', 't',
    source('object-conv', 'legacy-key', 'قیمت اشتراک ۴۰۰ باشد'));

  migrate(db);
  const repo = new Repo(db);
  const s = { userId: U, workspaceId: 'w1' };

  // Original note content preserved completely
  assert.equal(repo.getNote(s, 'section-conv')?.content, notes[0].content);
  assert.equal(repo.getNote(s, 'object-conv')?.content, notes[1].content);

  // Converted section receipt becomes resolved thought
  const allThoughts = repo.listThoughts(s, { includeResolved: true });
  const sectionThought = allThoughts.find((t) => t.sourceNoteId === 'section-conv');
  assert.ok(sectionThought);
  assert.equal(sectionThought.status, 'resolved');
  assert.equal(sectionThought.text, 'پشتیبانی از درگاه بانکی');

  // Converted legacy object thought links to proposed object
  const objThought = allThoughts.find((t) => t.sourceNoteId === 'object-conv')!;
  assert.equal(objThought.status, 'resolved');
  assert.equal(objThought.resolvedObjectId, 'converted-obj');

  db.close();
});

test('Part 8: Migration 21/23 overlap ensures exactly one resolved Thought per receipt line across all paths', () => {
  // Path A: Fresh database migrating from version 20 to latest (23)
  const dbA = new Database(':memory:');
  migrate(dbA, 20);
  const insertNoteA = dbA.prepare('INSERT INTO notes (id,user_id,workspace_id,node_id,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  insertNoteA.run('note-mixed', U, 'w1', 'business', '[ایده] ایدهٔ قبل از تبدیل\nپشتیبانی آنلاین ✓ (بخش «پشتیبانی» از همین ساخته شد)', '2026-01-01', '2026-01-02');
  migrate(dbA); // migrate 20 -> 23
  const repoA = new Repo(dbA);
  const sA = { userId: U, workspaceId: 'w1' };
  const thoughtsA = repoA.listThoughts(sA, { includeResolved: true });

  // Exactly one receipt thought, exactly one marked thought = 2 total
  assert.equal(thoughtsA.length, 2, 'ordinary marked thought + receipt thought = exactly 2 thoughts');
  const receiptsA = thoughtsA.filter((t) => t.text === 'پشتیبانی آنلاین');
  assert.equal(receiptsA.length, 1, 'fresh 20->23 migration produces exactly one resolved Thought for receipt line');
  assert.equal(receiptsA[0].status, 'resolved');
  assert.equal(receiptsA[0].id, 'legacy_thought_note-mixed_receipt_1');

  // Repeated migration run is idempotent
  assert.deepEqual(migrate(dbA), []);
  assert.equal(repoA.listThoughts(sA, { includeResolved: true }).length, 2, 'repeated migration run leaves count unchanged');

  // Original note content remains 100% untouched
  assert.equal(repoA.getNote(sA, 'note-mixed')?.content, '[ایده] ایدهٔ قبل از تبدیل\nپشتیبانی آنلاین ✓ (بخش «پشتیبانی» از همین ساخته شد)');
  dbA.close();

  // Path B: Database already at version 22, then migrating to 23
  const dbB = new Database(':memory:');
  migrate(dbB, 20);
  const insertNoteB = dbB.prepare('INSERT INTO notes (id,user_id,workspace_id,node_id,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  insertNoteB.run('note-mig22', U, 'w1', 'business', '[ایده] فکر معمولی\nسامانهٔ پیامک ✓ (بخش «پیامک» از همین ساخته شد)', '2026-01-01', '2026-01-02');
  migrate(dbB, 22); // simulates DB at version 22

  // Now migrate 22 -> 23
  const applied = migrate(dbB, 23);
  assert.deepEqual(applied, [23]);
  const repoB = new Repo(dbB);
  const sB = { userId: U, workspaceId: 'w1' };
  const thoughtsB = repoB.listThoughts(sB, { includeResolved: true });

  assert.equal(thoughtsB.length, 2, 'note with 1 idea and 1 receipt produces exactly 2 thoughts');
  const receiptsB = thoughtsB.filter((t) => t.text === 'سامانهٔ پیامک');
  assert.equal(receiptsB.length, 1, '22->23 migration path ends with exactly one Thought per receipt');
  assert.equal(receiptsB[0].status, 'resolved');

  // The later migration still applies on top; after that a repeated startup does nothing
  assert.deepEqual(migrate(dbB), [24, 25]);
  assert.deepEqual(migrate(dbB), []);
  assert.equal(repoB.listThoughts(sB, { includeResolved: true }).length, 2);
  dbB.close();
});

test('P1-10: Truth safety: Thought never appears in confirmed facts, never fills slot, never satisfies readiness', () => {
  const { db, repo, s } = freshDb();

  repo.insertThought(s, {
    kind: 'idea',
    text: 'حداکثر زمان پاسخ‌دهی ۲۰۰ میلی‌ثانیه',
    nodeId: 'business',
  });

  // Check effectiveObjects: only confirmed knowledge appears
  const objs = repo.listObjects(s);
  const nodes = repo.listNodes(s);
  const eff = effectiveObjects('business', objs, nodes, [], new Date());
  assert.equal(eff.length, 0, 'thought never appears in effective context');

  // Check readiness: thought does not satisfy any slot
  const readiness = calculateReadinessAndGaps(WORKSTREAM_SPECS[0], objs);
  assert.equal(readiness.score, 0, 'thought never satisfies slot readiness');
  assert.equal(readiness.status, 'blocked');
  assert.equal(readiness.gaps.filter((g) => g.importance === 'required' && g.status === 'missing').length, WORKSTREAM_SPECS[0].requiredContext.length);

  db.close();
});

test('P1-11, P1-12 & P1-13: Thinking Space counts, node filtering, and workspace isolation', () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace(U, ws('w1'));
  repo.saveWorkspace('other-user', ws('w2'));

  const s1 = { userId: U, workspaceId: 'w1' };
  const s2 = { userId: 'other-user', workspaceId: 'w2' };

  const t1 = repo.insertThought(s1, { kind: 'idea', text: 'فکر محیط ۱ در بخش بنیان', nodeId: 'business' });
  const t2 = repo.insertThought(s1, { kind: 'question', text: 'سؤال محیط ۱ در برند؟', nodeId: 'brand' });
  repo.insertThought(s2, { kind: 'assumption', text: 'فکر محیط ۲', nodeId: 'business' });

  // Workspace isolation
  const ws1Thoughts = repo.listThoughts(s1);
  const ws2Thoughts = repo.listThoughts(s2);
  assert.equal(ws1Thoughts.length, 2);
  assert.equal(ws2Thoughts.length, 1);
  assert.equal(ws2Thoughts[0].text, 'فکر محیط ۲');

  // Node filtering via thoughtInScope
  const nodes = repo.listNodes(s1);
  const objs = repo.listObjects(s1);
  assert.equal(thoughtInScope(t1, new Set(['brand']), objs, nodes), false);
  assert.equal(thoughtInScope(t2, new Set(['brand']), objs, nodes), true);
  // Root node scope includes sub-node thoughts
  assert.equal(thoughtInScope(t1, new Set(['business', 'brand']), objs, nodes), true);
  assert.equal(thoughtInScope(t2, new Set(['business', 'brand']), objs, nodes), true);

  db.close();
});

test('P2-1, P2-2, P2-3: Edit without duplicate identity, semantic revision recovery, and classification-only history', () => {
  const { db, repo, s } = freshDb();

  const original = repo.insertThought(s, {
    kind: 'idea',
    text: 'متن اولیه',
    nodeId: 'business',
  });

  // Reclassification without text change -> no text revision row
  repo.reclassifyThought(s, original.id, 'assumption');
  assert.equal(repo.listThoughtRevisions(s, original.id).length, 0, 'reclassification does not create text history');

  // Semantic text edit -> creates text revision row
  const { revisions } = repo.reviseThought(s, original.id, 'متن ویرایش‌شده با تغییر معنادار');
  assert.equal(revisions.length, 1, 'semantic text edit creates a new revision');
  assert.equal(repo.listThoughtRevisions(s, original.id).length, 1);
  assert.equal(repo.listThoughtRevisions(s, original.id)[0].beforeText, 'متن اولیه');

  // History report includes creation, reclassification, and revision entries
  const history = repo.getThoughtHistory(s, original.id);
  assert.ok(history);
  assert.equal(history.entries.some((e) => e.kind === 'created'), true);
  assert.equal(history.entries.some((e) => e.kind === 'reclassification'), true);
  assert.equal(history.entries.some((e) => e.kind === 'revision'), true);

  db.close();
});

test('P2-4, P2-5, P2-6, P2-7, P2-8, P2-9: Derivation, branching, synthesis, split, and multi-source lineage', () => {
  const { db, repo, s } = freshDb();

  const root = repo.insertThought(s, { kind: 'idea', text: 'فکر ریشه', nodeId: 'business' });

  // Branching: root -> branch1, branch2, branch3
  const b1 = repo.deriveThought(s, { parentIds: [root.id], nodeId: 'business', kind: 'idea', text: 'شاخه ۱' });
  const b2 = repo.deriveThought(s, { parentIds: [root.id], nodeId: 'business', kind: 'question', text: 'شاخه ۲؟' });
  const b3 = repo.deriveThought(s, { parentIds: [root.id], nodeId: 'business', kind: 'assumption', text: 'شاخه ۳' });

  const rootChildren = repo.listDerivedThoughts(s, root.id);
  assert.equal(rootChildren.length, 3, 'branching produces 3 children');

  // Source thought survives derivation
  const rootReloaded = repo.getThought(s, root.id)!;
  assert.equal(rootReloaded.status, 'open', 'source thought survives branching/derivation');

  // Synthesis: {b1, b2} -> synth
  const synth = repo.deriveThought(s, {
    parentIds: [b1.thought.id, b2.thought.id],
    nodeId: 'business',
    kind: 'open_decision',
    text: 'ترکیب شاخه‌ها',
  });
  const synthParents = repo.listThoughtParents(s, synth.thought.id);
  assert.deepEqual(synthParents.sort(), [b1.thought.id, b2.thought.id].sort(), 'synthesis preserves parent lineage');

  // Split: root -> split thoughts
  const { children: splitItems } = repo.splitThought(s, root.id, [
    { text: 'بخش اول شکسته شده', kind: 'idea' },
    { text: 'بخش دوم شکسته شده', kind: 'idea' },
  ]);
  assert.equal(splitItems.length, 2);
  const splitSources = repo.listThoughtParents(s, splitItems[0].id);
  assert.equal(splitSources[0], root.id, 'split child carries source thought lineage');

  // Multi-source lineage report
  const lineage = repo.getSynthesisLineage(s, synth.thought.id);
  assert.equal(lineage.parentThoughts.length, 2);

  db.close();
});

test('P2-10: Thought -> Proposed Knowledge lineage (source.thoughtId, never Confirmed truth)', () => {
  const { db, repo, s } = freshDb();

  const th = repo.insertThought(s, { kind: 'idea', text: 'ایده‌ای که به دانش تبدیل می‌شود', nodeId: 'business' });

  // Direct promotion to Confirmed is refused
  assert.throws(() => repo.createObject(s, {
    type: 'Fact',
    status: 'Confirmed',
    provenance: 'User Input',
    title: 'دانش پیشنهادی',
    content: th.text,
    nodeId: th.nodeId,
    source: { kind: 'user', thoughtId: th.id, at: '2026-03-01T00:00:00Z' },
  }), RepoError, 'cannot promote directly to Confirmed');

  // Promotion creates Proposed knowledge only
  const proposed = repo.createObject(s, {
    type: 'Fact',
    status: 'Proposed',
    provenance: 'User Input',
    title: 'دانش پیشنهادی',
    content: th.text,
    nodeId: th.nodeId,
    source: { kind: 'user', thoughtId: th.id, at: '2026-03-01T00:00:00Z' },
  });

  assert.equal(proposed.status, 'Proposed', 'promoted object is strictly Proposed, never Confirmed');
  assert.equal(proposed.source?.kind, 'user');
  assert.equal(proposed.source?.thoughtId, th.id);

  // Verification that thought is resolved and links to proposed object
  const thUpdated = repo.getThought(s, th.id)!;
  assert.equal(thUpdated.status, 'resolved');
  assert.equal(thUpdated.resolvedObjectId, proposed.id);

  // Truth check: Confirmed objects must remain 0
  const confirmedObjs = repo.listObjects(s).filter((o) => o.status === 'Confirmed');
  assert.equal(confirmedObjs.length, 0, 'No Confirmed truth exists from thought promotion');

  db.close();
});

test('P2-11, P2-12, P2-13: Stable about relations, ambiguous title safety, and stripping @ text preserves relations', () => {
  const { db, repo, s } = freshDb();

  // Create an object
  const obj1 = repo.createObject(s, {
    title: 'ساختار پایگاه داده',
    content: 'استفاده از SQLite',
    type: 'Decision',
    provenance: 'User Input',
    nodeId: 'business',
    status: 'Confirmed',
  });

  // Create thought with mention
  const th = repo.insertThought(s, {
    kind: 'idea',
    text: 'بررسی مجدد @«ساختار پایگاه داده» برای مقیاس‌پذیری',
    nodeId: 'business',
  });

  const about1 = repo.getThoughtAbout(s, th.id);
  assert.equal(about1.objectIds.length, 1);
  assert.equal(about1.objectIds[0], obj1.id);

  // Ambiguous title safety: create duplicate title object
  repo.createObject(s, {
    title: 'ساختار پایگاه داده',
    content: 'نسخه دیگر',
    type: 'Decision',
    provenance: 'User Input',
    nodeId: 'business',
    status: 'Confirmed',
  });

  // Inserting mention with ambiguous title does not guess!
  const thAmbiguous = repo.insertThought(s, {
    kind: 'idea',
    text: 'اشاره مبهم به @«ساختار پایگاه داده»',
    nodeId: 'business',
  });
  const aboutAmbiguous = repo.getThoughtAbout(s, thAmbiguous.id);
  assert.equal(aboutAmbiguous.objectIds.length, 0, 'ambiguous @ titles are never guessed');

  // Stripping @ text from thought does not destroy durable about relation
  repo.reviseThought(s, th.id, 'بررسی مجدد برای مقیاس‌پذیری');
  const aboutAfterEdit = repo.getThoughtAbout(s, th.id);
  assert.equal(aboutAfterEdit.objectIds.length, 1, 'durable about relation survived removal of @ text');
  assert.equal(aboutAfterEdit.objectIds[0], obj1.id);

  // Querying thoughts about via thoughtsAbout
  const objs = repo.listObjects(s);
  const nodes = repo.listNodes(s);
  const aboutMatches = thoughtsAbout([repo.getThought(s, th.id)!], obj1.id, objs, nodes);
  assert.equal(aboutMatches.length, 1, 'thought is found by durable relation');

  db.close();
});

test('P2-14, P2-15, P2-16: Truth/AI safety, workspace isolation, and node removal handling', () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace(U, ws('w1'));
  repo.saveWorkspace('other-user', ws('w2'));

  const s1 = { userId: U, workspaceId: 'w1' };
  const s2 = { userId: 'other-user', workspaceId: 'w2' };

  const th1 = repo.insertThought(s1, { kind: 'open_decision', text: 'تصمیم محیط ۱', nodeId: 'business' });
  const th2 = repo.insertThought(s2, { kind: 'open_decision', text: 'تصمیم محیط ۲', nodeId: 'business' });

  // Workspace isolation
  assert.equal(repo.getThought(s1, th2.id), undefined);
  assert.equal(repo.getThought(s2, th1.id), undefined);

  // Node deletion with transfer thoughts to parent
  const childNode = repo.createNode(s1, { parentId: 'business', label: 'بخش فرعی سفارشی' });
  const thInChild = repo.insertThought(s1, { kind: 'idea', text: 'فکر در بخش فرعی', nodeId: childNode.id });

  repo.deleteNode(s1, childNode.id, 'business');
  const thAfterNodeDel = repo.getThought(s1, thInChild.id)!;
  assert.ok(thAfterNodeDel, 'thought survives node deletion');
  assert.equal(thAfterNodeDel.nodeId, 'business', 'thought transferred to target parent node');

  db.close();
});
