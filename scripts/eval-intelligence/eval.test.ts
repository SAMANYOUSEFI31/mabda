import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryCallLog } from '../../server/intelligence/callLog.ts';
import { loadIntelligenceConfig } from '../../server/intelligence/config.ts';
import { MemoryEmbeddingStore } from '../../server/intelligence/embeddingStore.ts';
import type { Env, Item } from '../../server/intelligence/recipes.ts';
import type { JudgmentQuestion } from '../../server/intelligence/types.ts';
import { mockSpecialists } from '../../server/intelligence/testing/mockSpecialists.ts';
import type { Dataset } from './datasetTypes.ts';
import { evalAsr, evalContradictions, evalDuplicatesJudge, evalDuplicatesScore, evalJudge, evalPlacement, evalRelated, wilson, type Ctx, type EvalResult } from './evaluators.ts';
import { renderReport } from './report.ts';
import { validateDataset } from './validate-dataset.ts';

const read = <T>(f: string): T => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8')) as T;
const dataset = read<Dataset>('./dataset.json');
const combos = read<any>('./combos.json');
const questions = read<{ duplicates: JudgmentQuestion; contradictions: JudgmentQuestion }>('./questions.json');

test('the shipped dataset is valid and has at least 150 cases', () => {
  assert.deepEqual(validateDataset(dataset), []);
  assert.ok(Object.values(dataset.tasks).reduce((n, a) => n + a.length, 0) >= 150);
});

test('every model key in combos.json exists in models.json with the right kind (no model name lives in the eval files)', () => {
  const cfg = loadIntelligenceConfig();
  const kind = (k: string) => cfg.models[k]?.kind;
  for (const c of combos.related) { for (const f of c.finders) if (f.model) assert.equal(kind(f.model), 'embedding', f.model); if (c.ranker) assert.equal(kind(c.ranker), 'rerank', c.ranker); }
  for (const j of [...combos.judge, ...combos.duplicates.judges, ...combos.contradictions.judges]) assert.equal(kind(j), 'judgment', j);
  for (const p of combos.placement) { assert.ok(combos.related.some((r: { name: string }) => r.name === p.related), p.related); if (p.judge) assert.equal(kind(p.judge), 'judgment'); }
  for (const m of combos.duplicates.scoreMethods) if (m.model) assert.ok(cfg.models[m.model], m.model);
  assert.ok(!/(intfloat|cohere|voyageai|typesafe|whisper|openai|nvidia|qwen|microsoft|google)\//i.test(JSON.stringify(combos) + JSON.stringify(questions)));
});

test('the evaluators and the report run end-to-end on mock specialists (no network): every task renders a table', async () => {
  const cfg = loadIntelligenceConfig();
  const { specialists } = mockSpecialists({ judge: (_s, qs) => qs.map((q) => ({ id: q.id, choice: (q.criteria as Array<{ id: string }>)[0].id, confidence: 0.9 })), transcript: 'سلام به همه' });
  const log = new MemoryCallLog();
  const store = new MemoryEmbeddingStore();
  const makeEnv = (c: typeof cfg): Env => ({ cfg: c, specialists, store, call: { log } });
  const corpus: Item[] = dataset.corpus.map((c) => ({ id: c.id, kind: c.kind === 'knowledge' ? 'object' : c.kind, text: c.text }));
  const ctx: Ctx = { cfg, specialists, log, makeEnv, dataset, corpus, itemSection: Object.fromEntries(dataset.corpus.map((c) => [c.id, c.nodeId])), limit: 4 };
  const results: EvalResult[] = [];
  results.push(await evalRelated(ctx, combos.related[7], combos.thresholdPrecision));
  results.push(await evalRelated(ctx, combos.related[0], combos.thresholdPrecision));
  results.push(await evalJudge(ctx, 'jev-114'));
  results.push(await evalPlacement(ctx, combos.placement[4], combos.related));
  results.push(await evalPlacement(ctx, combos.placement[1], combos.related));
  results.push(await evalDuplicatesScore(ctx, combos.duplicates.scoreMethods[1]));
  results.push(await evalDuplicatesScore(ctx, combos.duplicates.scoreMethods[0]));
  results.push(await evalDuplicatesJudge(ctx, 'jev-113', questions.duplicates));
  results.push(await evalContradictions(ctx, 'jev-113', questions.contradictions));
  results.push(await evalAsr(ctx, 'whisper-large-v3', [{ file: 'a.wav', reference: 'سلام به همه', bytes: new Uint8Array([1]), mime: 'audio/wav', seconds: 2 }]));
  assert.ok(results.every((r) => r.n > 0 && r.errors === 0), JSON.stringify(results.map((r) => [r.name, r.n, r.errors, r.errorKinds])));
  assert.equal(results.at(-1)!.metrics.wer, 0);
  const md = renderReport(results, { date: '2026-01-01', datasetCases: 186, corpusItems: corpus.length, userCases: 0, models: {}, tokenCalibration: {}, asrFiles: 1, skipped: [], bars: combos.bars, thresholdPrecision: combos.thresholdPrecision });
  for (const h of ['## ۱.', '## ۲.', '## ۳.', '## ۴.', '## ۵.', '## ۶.', 'جاهایی که هیچ ترکیبی']) assert.ok(md.includes(h), h);
  assert.match(md, /\| lex\+e5\+cohere \|/);
});

test('wilson interval brackets the observed rate', () => {
  const [lo, hi] = wilson(8, 10)!;
  assert.ok(lo < 0.8 && hi > 0.8 && lo > 0.4 && hi < 0.97);
  assert.equal(wilson(0, 0), null);
});
