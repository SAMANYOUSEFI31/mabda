import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';
import { Repo } from './repo.ts';
import { createContextSource } from './aiContext.ts';
import { renderAiRequest } from './aiRequests.ts';
import type { FileService } from '../files/service.ts';
import type { Workspace } from '../../src/types/index.ts';

const U = 'local';
const ws: Workspace = { id: 'w1', name: 'w', slug: 'w', description: '', planId: 'max', creditsRemaining: 1, todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' };
const NOW = new Date('2026-06-01T10:00:00Z');

/** nodes: 1 · 2 (2.1 · 2.2 (2.2.1)) · 3  — all user nodes under «business» */
function setup() {
  const db = new Database(':memory:'); migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace(U, ws);
  const s = { userId: U, workspaceId: 'w1' };
  const mk = (parentId: string, label: string) => repo.createNode(s, { parentId, label }).id;
  const n1 = mk('business', 'n1'), n2 = mk('business', 'n2'), n3 = mk('business', 'n3');
  const n21 = mk(n2, 'n21'), n22 = mk(n2, 'n22'), n221 = mk(n22, 'n221');
  const files = { excerpts: () => [] } as unknown as FileService;
  const source = createContextSource(repo, files, U, () => NOW);
  const add = (nodeId: string, title: string, o: Record<string, unknown> = {}) => repo.createObject(s, { type: 'Constraint', provenance: 'User Input', title, content: `${title} متن`, nodeId, ...o } as never);
  const rulesAt = (nodeId: string) => (source.forGenerate('w1', { targetNodeId: nodeId, title: 't', criteria: [] }).contextList ?? []).filter((c) => c.type === 'Constraint').map((c) => c.title).sort();
  return { repo, s, source, add, rulesAt, n1, n2, n3, n21, n22, n221 };
}

test('generation guardrails come from what is IN FORCE at the target node: a position-only Constraint in 2.2 reaches 2.2 and below — not node 1, 3, the parent 2 or the sibling 2.1', () => {
  const t = setup();
  t.add(t.n22, 'فقط۲٫۲', { reach: 'position' });
  for (const n of [t.n1, t.n3, t.n2, t.n21]) assert.deepEqual(t.rulesAt(n), [], 'not in force there');
  assert.deepEqual(t.rulesAt(t.n22), ['فقط۲٫۲']);
  assert.deepEqual(t.rulesAt(t.n221), ['فقط۲٫۲']);
});

test('a global Constraint is a guardrail everywhere; an expired one nowhere; old data (no reach stored) behaves as before — global', () => {
  const t = setup();
  t.add(t.n22, 'سراسری', { reach: 'global' });
  t.add(t.n1, 'قدیمی'); // no reach: the Constraint default
  t.add(t.n3, 'منقضی', { validUntil: '2026-05-01' });
  for (const n of [t.n1, t.n2, t.n3, t.n21, t.n221]) assert.deepEqual(t.rulesAt(n), ['سراسری', 'قدیمی'], n);
  assert.equal(t.repo.listObjects(t.s).find((o) => o.title === 'قدیمی')!.reach, undefined);
});

test('an exception (overrides) removes an inherited rule for its sub-tree only; node chat and the whole-workspace view follow the same list', () => {
  const t = setup();
  const rule = t.add(t.n2, 'قاعدهٔ والد', { reach: 'position' });
  const exc = t.add(t.n22, 'استثنا', { type: 'Decision' });
  t.repo.setOverride(t.s, exc.id, rule.id, { reason: 'این بخش جدا کار می‌کند' });
  assert.deepEqual(t.rulesAt(t.n21), ['قاعدهٔ والد']);
  assert.deepEqual(t.rulesAt(t.n22), []);
  assert.deepEqual(t.rulesAt(t.n221), []);
  const chat = (n: string) => (t.source.forChat('w1', { scopeNodeId: n, message: 'سلام' }).contextList ?? []).map((c) => c.title).sort();
  assert.deepEqual(chat(t.n21), ['قاعدهٔ والد']);
  assert.ok(!chat(t.n22).includes('قاعدهٔ والد') && chat(t.n22).includes('استثنا'));
  // whole-workspace chat: a position-only rule is not a workspace-wide rule
  const all = (t.source.forChat('w1', { message: 'سلام' }).contextList ?? []).map((c) => c.title);
  assert.ok(!all.includes('قاعدهٔ والد') && all.includes('استثنا'));
});

test('notes and their derived thinking items never reach a model; a converted one arrives only as a PROPOSED assumption/decision, in its own section — never as established knowledge', async () => {
  const t = setup();
  const note = t.repo.createNote(t.s, t.n22, '[فرض] مشتری‌ها پیام‌رسان را بیشتر می‌خوانند\n[سؤال] قیمت گروهی چقدر باشد؟\nآیا بسته‌ی بدون-براکت لازم است؟\n[تصمیم باز] روز ارسال\n[ایده] جعبهٔ هدیه');
  const everything = () => JSON.stringify([t.source.forGenerate('w1', { targetNodeId: t.n22, title: 't', criteria: [] }), t.source.forGenerate('w1', { targetNodeId: '*', title: 't', criteria: [] }), t.source.forChat('w1', { scopeNodeId: t.n22, message: 'x' }), t.source.forChat('w1', { message: 'x' })]);
  for (const text of ['پیام‌رسان را بیشتر', 'قیمت گروهی', 'بدون-براکت', 'روز ارسال', 'جعبهٔ هدیه']) assert.ok(!everything().includes(text), `derived item «${text}» stays out of every context`);
  assert.equal(t.repo.listObjects(t.s).length, 0, 'deriving items stores nothing');
  // promote the persisted Thought → Proposed Fact with provenance; the Note stays raw and unchanged
  const assumption = t.repo.listThoughts(t.s).find((x) => x.kind === 'assumption')!;
  const o = t.repo.createObject(t.s, { type: 'Fact', status: 'Proposed', provenance: 'User Input', title: 'پیام‌رسان', content: assumption.text, nodeId: t.n22, source: { kind: 'note', thoughtId: assumption.id, at: '' } });
  assert.equal(t.repo.getNote(t.s, note.id)?.content.includes('[فرض]'), true, 'promotion does not edit Material');
  assert.equal(t.repo.getThought(t.s, assumption.id)?.status, 'resolved');
  assert.deepEqual([o.source?.thoughtId, o.source?.noteId, o.source?.quote], [assumption.id, note.id, assumption.text]);
  const ctx = t.source.forGenerate('w1', { targetNodeId: t.n22, title: 't', criteria: [] });
  const lite = ctx.contextList!.find((c) => c.id === o.id)!;
  assert.deepEqual([lite.status, lite.assumption], ['Proposed', true]);
  // even CONFIRMED it stays an assumption for the model
  t.repo.updateObject(t.s, o.id, { status: 'Confirmed' });
  const { buildPrompt } = await import('../ai/context.ts');
  const prompt = buildPrompt({ contexts: t.source.forGenerate('w1', { targetNodeId: t.n22, title: 't', criteria: [] }).contextList!, task: 'بنویس' });
  assert.ok(!(prompt.prefix ?? '').includes('پیام‌رسان را بیشتر'), 'not in the confirmed prefix');
  assert.ok(prompt.user.includes('فرض‌های فعال، تأییدنشده') && prompt.user.includes('پیام‌رسان را بیشتر'));
});

test('SAMPLES never enter an AI context (chat, scoped chat, generation, whole-workspace generation, the validator\'s guardrails); writing over an example makes it hers and only then it is seen', () => {
  const t = setup();
  const SECRET = 'نمونهٔ-ممنوع';
  const rule = t.repo.createSample(t.s, { type: 'Constraint', title: `خط قرمز ${SECRET}`, content: SECRET, nodeId: t.n22 })!;
  t.repo.createSample(t.s, { type: 'Fact', title: `واقعیت ${SECRET}`, content: SECRET, nodeId: t.n2 });
  const all = () => JSON.stringify([
    t.source.forGenerate('w1', { targetNodeId: t.n22, title: 't', criteria: [] }), t.source.forGenerate('w1', { targetNodeId: '*', title: 't', criteria: [] }),
    t.source.forChat('w1', { scopeNodeId: t.n22, message: 'x' }), t.source.forChat('w1', { scopeNodeId: t.n2, message: 'x', threadOnly: true }), t.source.forChat('w1', { message: 'x' }),
  ]);
  assert.ok(!all().includes(SECRET));
  assert.deepEqual(t.rulesAt(t.n22), [], 'the validator\'s guardrails come from this list: a sample rule is no guardrail');
  // editing the example = the user's own: it is a real object from then on
  const mine = t.repo.updateObject(t.s, rule.id, { content: 'خط قرمز واقعی من' }).object;
  assert.equal(mine.sample, undefined);
  assert.deepEqual(t.rulesAt(t.n22), [`خط قرمز ${SECRET}`]);
  // examples can be removed without a trace in the knowledge
  assert.equal(t.repo.deleteSamples(t.s), 1);
  assert.equal(t.repo.listSampleObjects(t.s).length, 0);
});

test('explicit Thought chat resolves only selected open Thoughts and keeps them outside confirmed Truth', () => {
  const t = setup();
  t.add(t.n22, 'حقیقت منتخب', { type: 'Fact', status: 'Confirmed' });
  t.add(t.n22, 'دانش پیشنهادی خارج از زمینه', { type: 'Fact', status: 'Proposed' });
  t.add(t.n22, 'نیازمند بازبینی خارج از زمینه', { type: 'Fact', status: 'Needs Review' });
  t.repo.createNote(t.s, t.n22, '[فرض] فکر انتخاب‌شدهٔ یکتا\n[ایده] فکر انتخاب‌نشدهٔ یکتا');
  const selected = t.repo.listThoughts(t.s).find((thought) => thought.text === 'فکر انتخاب‌شدهٔ یکتا');
  assert.ok(selected);
  const result = t.source.forChat('w1', { scopeNodeId: t.n22, message: 'درخواست یکتا', thoughtIds: [selected.id] });
  const serialized = JSON.stringify(result);
  assert.deepEqual(result.contextList?.map((o) => o.title), ['حقیقت منتخب']);
  assert.deepEqual(result.thoughts?.map((x) => x.id), [selected.id]);
  assert.ok(serialized.includes('فکر انتخاب‌شدهٔ یکتا'));
  assert.ok(!serialized.includes('فکر انتخاب‌نشدهٔ یکتا'));
  assert.ok(!serialized.includes('دانش پیشنهادی خارج از زمینه'));
  assert.ok(!serialized.includes('نیازمند بازبینی خارج از زمینه'));
  assert.deepEqual(result.excerpts, [], 'file excerpts are not silently included in explicit Thought work');
  assert.throws(() => t.source.forChat('w1', { message: 'درخواست یکتا', thoughtIds: ['missing_thought'] }), /فکرهای انتخاب‌شده/);
  const prompt = renderAiRequest(t.repo, t.s, { kind: 'audit', request: 'درخواست یکتا', scopeNodeId: t.n22, thoughtIds: [selected.id] }, NOW);
  assert.ok(prompt.markdown.includes('فکرهای انتخاب‌شده (تأییدنشده؛ حقیقت نیستند)'));
  assert.ok(!prompt.refs.some((x) => x.id === selected.id), 'Thoughts are not Truth/context refs');
  assert.equal(prompt.counts.thoughts, 1);
  assert.throws(() => renderAiRequest(t.repo, t.s, { kind: 'audit', request: 'درخواست یکتا', thoughtIds: ['missing_thought'] }, NOW), /فکرهای انتخاب‌شده/);
});

test('explicit Thought chat joins confirmed context from selected sections without widening to the workspace', () => {
  const t = setup();
  const addFact = (nodeId: string, title: string) => t.repo.createObject(t.s, {
    type: 'Fact', status: 'Confirmed', provenance: 'User Input', title, content: `${title} متن`, nodeId,
  });
  addFact(t.n21, 'حقیقت بخش اول');
  addFact(t.n22, 'حقیقت بخش دوم');
  addFact(t.n3, 'حقیقت بخش انتخاب‌نشده');
  t.repo.createNote(t.s, t.n21, '[سؤال] فکر اول');
  t.repo.createNote(t.s, t.n22, '[فرض] فکر دوم');
  const thoughts = t.repo.listThoughts(t.s).filter((thought) => ['فکر اول', 'فکر دوم'].includes(thought.text));
  assert.equal(thoughts.length, 2);

  const result = t.source.forChat('w1', {
    scopeNodeIds: [t.n21, t.n22], message: 'بررسی فکرها', thoughtIds: thoughts.map((thought) => thought.id),
  });
  assert.deepEqual(result.focusNodeIds, [t.n21, t.n22]);
  assert.deepEqual(result.contextList?.map((item) => item.title).sort(), ['حقیقت بخش اول', 'حقیقت بخش دوم']);
  assert.deepEqual(result.thoughts?.map((thought) => thought.text).sort(), ['فکر اول', 'فکر دوم']);
  assert.throws(() => t.source.forChat('w1', {
    scopeNodeIds: ['missing-section'], message: 'بررسی فکرها', thoughtIds: thoughts.map((thought) => thought.id),
  }), /یکی از بخش‌های فکرهای انتخاب‌شده/);
});
