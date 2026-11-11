import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../db/migrations.ts';
import { Repo } from '../db/repo.ts';
import { purgeObject } from '../db/removal.ts';
import { MemoryCallLog } from './callLog.ts';
import { charMeter, chunkByStructure } from './chunker.ts';
import { loadIntelligenceConfig, modelRefs, validateConfig, withRecipe, type FindRelatedRecipe, type IntelligenceConfig, type WhereToRecipe, type WhatIsThisRecipe } from './config.ts';
import { MemoryEmbeddingStore, SqliteEmbeddingStore } from './embeddingStore.ts';
import { IntelligenceError } from './errors.ts';
import { createIntelligence, createSuggestionStore } from './index.ts';
import { cosine, rrf } from './math.ts';
import { findRelated, whatIsThis, whereTo, NONE_OPTION_ID, type Env, type Item, type Section } from './recipes.ts';
import { mockSpecialists, type MockOptions } from './testing/mockSpecialists.ts';

const scope = { workspaceId: 'w1', userId: 'u1' };
const baseCfg = (): IntelligenceConfig => loadIntelligenceConfig();
const mk = (opts: MockOptions = {}, cfg = baseCfg()) => {
  const { specialists, calls } = mockSpecialists(opts);
  const log = new MemoryCallLog();
  const store = new MemoryEmbeddingStore();
  const env: Env = { cfg, specialists, store, call: { log } };
  return { env, calls, log, store, cfg };
};

const items: Item[] = [
  { id: 'a', kind: 'thought', text: 'قیمت اشتراک ماهانه را ۴۹۰ هزار تومان بگذاریم' },
  { id: 'b', kind: 'object', text: 'اشتراک ماهانه قهوه هر ماه ارسال می‌شود' },
  { id: 'c', kind: 'note', text: 'کارگاه برشته‌کاری حضوری هفتهٔ آینده برگزار می‌شود' },
  { id: 'd', kind: 'thought', text: 'ساعت پاسخ‌گویی پشتیبانی تا شش عصر است' },
];

// ───────────── پیکربندی ─────────────

test('config: the shipped models.json + recipes.json validate; every recipe model key exists with the right kind', () => {
  const cfg = baseCfg();
  assert.deepEqual(validateConfig(cfg), []);
  for (const r of Object.values(cfg.recipes)) for (const ref of modelRefs(r)) assert.equal(cfg.models[ref.key]?.kind, ref.kind);
});

test('config: a missing model key, wrong kind and half-set tiers are rejected', () => {
  const cfg = baseCfg();
  const a = structuredClone(cfg); (a.recipes.findRelated as FindRelatedRecipe).ranker = { specialist: 'rerank', model: 'nope', enabled: true };
  assert.match(validateConfig(a).join('\n'), /nope/);
  const b = structuredClone(cfg); (b.recipes.findRelated as FindRelatedRecipe).ranker = { specialist: 'rerank', model: 'e5-large', enabled: true };
  assert.match(validateConfig(b).join('\n'), /rerank/);
  const c = structuredClone(cfg); (c.recipes.findRelated as FindRelatedRecipe).tiers = { strong: 0.5, weak: null };
  assert.match(validateConfig(c).join('\n'), /null/);
});

test('config: removing a stage (no embedding, no ranker) is only a config change', () => {
  const cfg = withRecipe<FindRelatedRecipe>(baseCfg(), 'findRelated', (r) => { r.finders = [{ specialist: 'lexical', weight: 1 }]; r.ranker = undefined; });
  assert.deepEqual(modelRefs(cfg.recipes.findRelated), []);
});

// ───────────── تکه‌کردن ─────────────

test('chunker: a text within the budget is one chunk even when it is about several topics', () => {
  const m = charMeter(2);
  const c = chunkByStructure('قیمت اشتراک را بالا ببریم.\n\nکارگاه را در تهران بگذاریم.', 200, m);
  assert.equal(c.length, 1);
});

test('chunker: a long unordered text is cut within the budget and no word is lost', () => {
  const m = charMeter(2);
  const words = Array.from({ length: 900 }, (_, i) => `واژه${i}`);
  const text = words.join(' ') + '.';
  const chunks = chunkByStructure(text, 100, m);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.tokens <= 100, `chunk ${c.index}: ${c.tokens}`);
  const back = chunks.map((c) => c.text).join(' ').split(/\s+/).filter(Boolean).map((w) => w.replace(/\.$/, ''));
  assert.deepEqual(back, words);
});

test('chunker: explicit headings and bullets are the boundaries; a text without spaces is still cut by measured length', () => {
  const m = charMeter(2);
  const md = `# قیمت\n${'الف '.repeat(60)}\n\n# ارسال\n${'ب '.repeat(60)}`;
  const c = chunkByStructure(md, 90, m);
  assert.ok(c.length >= 2);
  assert.ok(c[0].text.startsWith('# قیمت') && !c[0].text.includes('ارسال'));
  const solid = 'ا'.repeat(1000);
  const s = chunkByStructure(solid, 100, m);
  assert.ok(s.every((x) => x.tokens <= 100));
  assert.equal(s.map((x) => x.text).join('').length, 1000);
  assert.deepEqual(chunkByStructure('   ', 100, m), []);
});

test('math: rrf prefers items ranked high in several lists; cosine of identical vectors is 1', () => {
  const r = rrf([{ ranked: [{ id: 'x', score: 9 }, { id: 'y', score: 1 }], weight: 1 }, { ranked: [{ id: 'y', score: 5 }, { id: 'x', score: 4 }], weight: 1 }], 60);
  assert.equal(r.length, 2);
  assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
});

// ───────────── مرتبط‌ها ─────────────

test('findRelated (default recipe): lexical + embedding → rerank; thresholds not measured yet → every item is «unscored»', async () => {
  const { env, log } = mk();
  const r = await findRelated(env, 'findRelated', { scope, query: 'قیمت اشتراک ماهانه', items });
  assert.ok(r.stages.includes('lexical') && r.stages.some((s) => s.startsWith('embedding:')) && r.stages.some((s) => s.startsWith('rerank:')));
  assert.ok(r.items.length > 0 && r.items.every((x) => x.tier === 'unscored'));
  assert.equal(r.items[0].id, 'a');
  assert.ok(log.records.every((x) => x.ok && x.durationMs >= 0));
  assert.ok(log.records.some((x) => x.specialist === 'rerank') && log.records.some((x) => x.specialist === 'embedding'));
});

test('findRelated: with calibrated scores and thresholds, strong / weak are marked and low scores are dropped (by score, not by count)', async () => {
  let cfg = withRecipe<FindRelatedRecipe>(baseCfg(), 'findRelated', (r) => { r.tiers = { strong: 0.6, weak: 0.3 }; });
  cfg = structuredClone(cfg); cfg.models['cohere-rerank-35'].calibratedScore = true;
  const scores: Record<string, number> = { a: 0.9, b: 0.4, c: 0.1, d: 0.05 };
  const { env } = mk({ rerankScore: (_q, doc) => scores[items.find((i) => i.text === doc)!.id] }, cfg);
  const r = await findRelated(env, 'findRelated', { scope, query: 'قیمت اشتراک', items });
  assert.deepEqual(r.items.map((x) => [x.id, x.tier]), [['a', 'strong'], ['b', 'weak']]);
});

test('findRelated: embeddings are kept by item + text version: a second call embeds nothing, an edit re-embeds only that item and drops the stale vector', async () => {
  const { env, calls, store } = mk();
  await findRelated(env, 'findRelated', { scope, query: 'قیمت', items });
  const first = calls.embed.flat().length;
  assert.equal(first, items.length + 1); // چهار چیز + یک پرس‌وجو
  await findRelated(env, 'findRelated', { scope, query: 'قیمت', items });
  assert.equal(calls.embed.flat().length, first + 1); // فقط پرس‌وجو
  const size = store.size;
  const edited = items.map((i) => (i.id === 'a' ? { ...i, text: 'قیمت اشتراک را ۵۰۰ هزار تومان بگذاریم' } : i));
  await findRelated(env, 'findRelated', { scope, query: 'قیمت', items: edited });
  assert.equal(calls.embed.flat().length, first + 1 + 1 + 1); // پرس‌وجو + فقط a
  assert.equal(store.size, size);
});

test('findRelated: without embedding / without ranker the specialists are never called', async () => {
  const cfg = withRecipe<FindRelatedRecipe>(baseCfg(), 'findRelated', (r) => { r.finders = [{ specialist: 'lexical', weight: 1 }]; r.ranker = undefined; });
  const { env, calls } = mk({}, cfg);
  const r = await findRelated(env, 'findRelated', { scope, query: 'کارگاه برشته‌کاری', items });
  assert.equal(calls.embed.length, 0);
  assert.equal(calls.rerank.length, 0);
  assert.equal(r.items[0].id, 'c');
});

test('findRelated: a long text (beyond the model cap) is chunked: no text sent to the embedder exceeds the cap', async () => {
  const { env, calls, cfg } = mk();
  const long = Array.from({ length: 600 }, (_, i) => `موضوع${i} درباره قهوه`).join(' ');
  await findRelated(env, 'findRelated', { scope, query: 'قهوه', items: [{ id: 'L', kind: 'note', text: long }] });
  const cap = cfg.models['e5-large'].maxInputTokens!;
  const meter = charMeter(cfg.models['e5-large'].charsPerToken ?? 2);
  const sent = calls.embed.flat();
  assert.ok(sent.length > 2);
  for (const t of sent) assert.ok(meter.count(t) <= cap, `sent ${meter.count(t)} > ${cap}`);
});

test('findRelated: excluded ids and empty input; a provider failure is a structured error (no fake result)', async () => {
  const { env } = mk();
  const r = await findRelated(env, 'findRelated', { scope, query: 'قیمت اشتراک ماهانه', items, excludeIds: ['a'] });
  assert.ok(!r.items.some((x) => x.id === 'a'));
  assert.deepEqual((await findRelated(env, 'findRelated', { scope, query: '  ', items })).items, []);
  const bad = mk({ failEmbedding: new IntelligenceError('provider', { status: 500 }) });
  await assert.rejects(() => findRelated(bad.env, 'findRelated', { scope, query: 'قیمت', items }), (e: unknown) => e instanceof IntelligenceError && e.kind === 'provider' && e.specialist === 'embedding');
  assert.ok(bad.log.records.some((x) => !x.ok && x.error?.kind === 'provider'));
});

// ───────────── این چیست؟ ─────────────

test('whatIsThis: answers per question; «none» and low confidence are marked as unsure; a wrong answer count is a bad_output', async () => {
  const cfg = withRecipe<WhatIsThisRecipe>(baseCfg(), 'whatIsThis', (r) => { r.minConfidence = 0.7; });
  const { env, calls } = mk({ judge: (_s, qs) => [{ id: qs[0].id, choice: 'idea', confidence: 0.95 }, { id: qs[1].id, choice: null }, { id: qs[2].id, choice: 'uncertain', confidence: 0.5 }] }, cfg);
  const r = await whatIsThis(env, 'whatIsThis', { text: 'شاید قیمت را کم کنیم' });
  assert.deepEqual(r.answers.map((a) => [a.questionId, a.uncertain]), [['thoughtKind', false], ['knowledgeType', true], ['certainty', true]]);
  assert.equal(calls.decide.length, 1); // چند سؤال در یک درخواست
  const bad = mk({ judge: () => [] });
  await assert.rejects(() => whatIsThis(bad.env, 'whatIsThis', { text: 'x' }), (e: unknown) => e instanceof IntelligenceError && e.kind === 'bad_output');
});

// ───────────── کجا برود؟ ─────────────

const sections: Section[] = [
  { id: 'product', label: 'محصول', parentId: null },
  { id: 'sub', label: 'اشتراک ماهانه', description: 'قیمت و ارسال', parentId: 'product' },
  { id: 'ws', label: 'کارگاه', parentId: null },
];
const itemSection = { a: 'sub', b: 'sub', c: 'ws', d: 'product' };
const whereInput = { scope, text: 'قیمت اشتراک ماهانه چقدر باشد', sections, items, itemSection };

test('whereTo: the judge chooses among candidate sections; the dossier carries related items with their sections; «هیچ‌کدام» gives null + unsure', async () => {
  const { env, calls } = mk({ judge: (_s, qs) => [{ id: qs[0].id, choice: 'sub', confidence: 0.9 }] });
  const r = await whereTo(env, 'whereTo', whereInput);
  assert.equal(r.sectionId, 'sub');
  assert.equal(r.uncertain, false);
  assert.match(calls.decide[0].state, /در بخش «اشتراک ماهانه»/);
  const q = calls.decide[0].questions[0];
  const ids = (q.criteria as Array<{ id: string; description: string }>).map((c) => c.id);
  assert.ok(ids.includes(NONE_OPTION_ID) && ids.includes('sub') && ids.includes('ws'));
  assert.ok((q.criteria as Array<{ id: string; description: string }>).find((c) => c.id === 'sub')!.description.startsWith('محصول › اشتراک ماهانه'));
  const none = mk({ judge: (_s, qs) => [{ id: qs[0].id, choice: NONE_OPTION_ID, confidence: 0.8 }] });
  const n = await whereTo(none.env, 'whereTo', whereInput);
  assert.deepEqual([n.sectionId, n.uncertain], [null, true]);
});

test('whereTo: a section the judge returns that was not a candidate is rejected; candidate modes come from config', async () => {
  const wrong = mk({ judge: (_s, qs) => [{ id: qs[0].id, choice: 'ghost' }] });
  await assert.rejects(() => whereTo(wrong.env, 'whereTo', whereInput), (e: unknown) => e instanceof IntelligenceError && e.kind === 'bad_output');
  const cfg = withRecipe<WhereToRecipe>(baseCfg(), 'whereTo', (r) => { r.candidates = 'related'; r.dossier = false; });
  const { env, calls } = mk({ judge: (_s, qs) => [{ id: qs[0].id, choice: 'sub' }] }, cfg);
  const r = await whereTo(env, 'whereTo', { ...whereInput, items: [items[0], items[1]] });
  assert.deepEqual([...r.candidateIds].sort(), ['product', 'sub']); // بخش مورد مرتبط + والدش، نه «کارگاه»
  assert.doesNotMatch(calls.decide[0].state, /پرونده/);
});

test('whereTo: without a judge (baseline) the section of the best related item is taken and no judge is called', async () => {
  const cfg = withRecipe<WhereToRecipe>(baseCfg(), 'whereTo', (r) => { r.judge = null; });
  const { env, calls } = mk({}, cfg);
  const r = await whereTo(env, 'whereTo', whereInput);
  assert.equal(r.sectionId, 'sub');
  assert.equal(calls.decide.length, 0);
});

// ───────────── خاموش بودن و ورودی/خروجی ─────────────

test('without LIARA_BASE_URL / LIARA_API_KEY the layer is off: enabled=false and every call is a structured «disabled» error', async () => {
  const off = createIntelligence({ env: {}, db: new Database(':memory:') });
  assert.equal(off.enabled, false);
  assert.throws(() => off.whatIsThis({ text: 'x' }), (e: unknown) => e instanceof IntelligenceError && e.kind === 'disabled');
  const half = createIntelligence({ env: { LIARA_API_KEY: 'k' }, db: new Database(':memory:') });
  assert.equal(half.enabled, false);
});

test('createIntelligence with injected specialists runs a recipe end-to-end and transcribe respects the plan gate', async () => {
  const { specialists } = mockSpecialists({ transcript: 'سلام دنیا' });
  const ai = createIntelligence({ specialists, store: new MemoryEmbeddingStore(), log: new MemoryCallLog() });
  const t = await ai.transcribe({ audio: { data: new Uint8Array([1, 2, 3]), fileName: 'a.wav', mimeType: 'audio/wav' } });
  assert.equal(t.text, 'سلام دنیا');
  const cfg = withRecipe(baseCfg(), 'transcribe', (r: { plans: unknown }) => { r.plans = ['max']; });
  const gated = createIntelligence({ cfg, specialists, store: new MemoryEmbeddingStore(), log: new MemoryCallLog() });
  await assert.rejects(() => gated.transcribe({ plan: 'starter', audio: { data: new Uint8Array([1]), fileName: 'a.wav', mimeType: 'audio/wav' } }), (e: unknown) => e instanceof IntelligenceError && e.kind === 'disabled');
});

// ───────────── مدل داده ─────────────

const fresh = () => {
  const db = new Database(':memory:');
  migrate(db);
  const repo = new Repo(db);
  repo.saveWorkspace('u1', { id: 'w1', name: 'w1', slug: 'w1', description: '', planId: 'pro', creditsRemaining: 100, todayChatCount: 0, createdAt: '2026-01-01T00:00:00Z' } as never);
  return { db, repo };
};

test('suggestions and reactions: stored without user text; the latest reaction wins; another user cannot react; stats per kind', () => {
  const { db } = fresh();
  const st = createSuggestionStore(db);
  const id = st.recordSuggestion(scope, { recipe: 'whatIsThis', recipeVersion: 1, kind: 'thought_kind', subjectKind: 'thought', subjectId: 't1', subjectHash: 'h', suggestion: { value: 'idea' }, specialists: { judge: 'jev-114' }, confidence: 0.8 });
  const id2 = st.recordSuggestion(scope, { recipe: 'findRelated', recipeVersion: 1, kind: 'related', subjectKind: 'thought', subjectId: 't1', suggestion: { ids: ['a'] }, specialists: {}, tier: 'strong' });
  st.recordReaction(scope, id, 'rejected');
  st.recordReaction(scope, id, 'changed', { value: 'question' });
  st.recordReaction(scope, id2, 'accepted');
  const rows = st.list(scope, { kind: 'thought_kind' });
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].reaction, rows[0].finalValue], ['changed', { value: 'question' }]);
  assert.throws(() => st.recordReaction({ userId: 'other', workspaceId: 'w1' }, id, 'accepted'));
  const stats = Object.fromEntries(st.reactionStats(scope).map((s) => [s.kind, s]));
  assert.deepEqual([stats.thought_kind.changed, stats.related.accepted], [1, 1]);
});

test('the SQLite embedding store round-trips vectors, keeps them by text hash and drops stale ones', async () => {
  const { db } = fresh();
  const s = new SqliteEmbeddingStore(db);
  const key = { workspaceId: 'w1', userId: 'u1', itemKind: 'thought', itemId: 't1', chunkIndex: 0, textHash: 'h1', modelKey: 'e5-large' };
  await s.putMany([{ key, vector: Float32Array.from([0.25, -1.5, 3]) }]);
  const got = [...(await s.getMany([key])).values()][0];
  assert.deepEqual([...got], [0.25, -1.5, 3]);
  assert.equal((await s.getMany([{ ...key, textHash: 'h2' }])).size, 0);
  assert.equal(await s.dropStale('w1', 'u1', 'thought', 't1', 'e5-large', ['h2']), 1);
  assert.equal((await s.getMany([key])).size, 0);
  // مدل دیگرِ همان چیز دست‌نخورده می‌ماند
  const other = { ...key, modelKey: 'gemini-embedding-2', textHash: 'g1' };
  await s.putMany([{ key: other, vector: Float32Array.from([1]) }]);
  assert.equal(await s.dropStale('w1', 'u1', 'thought', 't1', 'e5-large', []), 0);
  assert.equal((await s.getMany([other])).size, 1);
});

test('permanent delete of a knowledge removes its embeddings and suggestions too (a trigger, on every delete path)', async () => {
  const { db, repo } = fresh();
  const s = { userId: 'u1', workspaceId: 'w1' };
  const node = repo.listNodes(s)[0].id;
  const o = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'متن', content: 'محتوا', nodeId: node });
  const store = new SqliteEmbeddingStore(db);
  await store.putMany([{ key: { workspaceId: 'w1', userId: 'u1', itemKind: 'object', itemId: o.id, chunkIndex: 0, textHash: 'h', modelKey: 'e5-large' }, vector: Float32Array.from([1, 2]) }]);
  const sug = createSuggestionStore(db);
  const sid = sug.recordSuggestion(s, { recipe: 'findRelated', recipeVersion: 1, kind: 'related', subjectKind: 'object', subjectId: o.id, suggestion: {}, specialists: {} });
  sug.recordReaction(s, sid, 'accepted');
  repo.updateObject(s, o.id, { status: 'Archived' } as never);
  purgeObject(repo, s, o.id);
  const n = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  assert.deepEqual([n('intelligence_embeddings'), n('intelligence_suggestions'), n('intelligence_reactions')], [0, 0, 0]);
});

test('workspace delete clears the intelligence tables too (they carry user_id and workspace_id)', async () => {
  const { db, repo } = fresh();
  const { deleteWorkspace } = await import('../db/removal.ts');
  createSuggestionStore(db).recordSuggestion(scope, { recipe: 'r', recipeVersion: 1, kind: 'related', subjectKind: 'text', suggestion: {}, specialists: {} });
  await new SqliteEmbeddingStore(db).putMany([{ key: { workspaceId: 'w1', userId: 'u1', itemKind: 'note', itemId: 'n', chunkIndex: 0, textHash: 'h', modelKey: 'm' }, vector: Float32Array.from([1]) }]);
  deleteWorkspace(repo, 'u1', 'w1');
  const n = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  assert.deepEqual([n('intelligence_embeddings'), n('intelligence_suggestions')], [0, 0]);
});
