/**
 * سنجنده‌ها: هر تابع یک ترکیب را روی یک دستهٔ داده می‌سنجد و `EvalResult` می‌دهد.
 * خطای یک مورد کل اجرا را نمی‌اندازد: شمرده و به‌تفکیک نوع گزارش می‌شود (مثلاً متن بلند برای داور).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { MemoryCallLog } from '../../server/intelligence/callLog.ts';
import { charMeter } from '../../server/intelligence/chunker.ts';
import { withRecipe, type FindRelatedRecipe, type IntelligenceConfig, type WhatIsThisRecipe, type WhereToRecipe } from '../../server/intelligence/config.ts';
import { IntelligenceError } from '../../server/intelligence/errors.ts';
import { findRelated, whatIsThis, whereTo, type Env, type Item } from '../../server/intelligence/recipes.ts';
import type { CallRecord, JudgmentQuestion, Specialists } from '../../server/intelligence/types.ts';
import type { ContradictionCase, Dataset, DuplicateCase, KnowledgeTypeCase, PlacementCase, RelatedCase, ThoughtKindCase, CertaintyCase, HardTag } from './datasetTypes.ts';
import { calibration, cer, confusion, meanDefined, ndcgAtK, precisionAtK, recallAtK, selectiveAccuracy, summarizeLatency, suggestThreshold, thresholdSweep, twoFoldThreshold, wer, wrongLinkRateAtK } from './metrics.ts';

export type Task = 'related' | 'judge' | 'placement' | 'duplicates' | 'contradictions' | 'asr';
export interface EvalResult {
  task: Task;
  name: string;
  /** شمار موردهای اجراشده (بدون خطا) و شمار خطاها */
  n: number;
  errors: number;
  errorKinds: Record<string, number>;
  metrics: Record<string, number | null>;
  /** نتیجه به‌تفکیک برچسب متن سخت */
  byTag: Record<string, { n: number; metrics: Record<string, number | null> }>;
  extras: Record<string, unknown>;
  latency: ReturnType<typeof summarizeLatency>;
  /** هزینهٔ هر ۱۰۰۰ مورد (بدون هزینهٔ یک‌بارهٔ نمایه‌سازی)؛ null = قیمت نامعلوم */
  costPer1000Usd: number | null;
  /** هزینهٔ یک‌بارهٔ embedding ِ پیکره (نمایه‌سازی) */
  indexingCostUsd: number | null;
}

export interface Ctx {
  cfg: IntelligenceConfig;
  specialists: Specialists;
  log: MemoryCallLog;
  makeEnv(cfg: IntelligenceConfig): Env;
  dataset: Dataset;
  corpus: Item[];
  itemSection: Record<string, string>;
  limit?: number;
}

export const wilson = (k: number, n: number, z = 1.96): [number, number] | null => {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
};

const take = <T>(xs: T[], limit?: number): T[] => (limit ? xs.slice(0, limit) : xs);

/** اجرای یک مورد با اندازه‌گیری مدت و رکوردهای همان مورد */
async function timed<T>(ctx: Ctx, fn: () => Promise<T>): Promise<{ value?: T; error?: IntelligenceError; ms: number; records: CallRecord[] }> {
  const from = ctx.log.records.length;
  const t0 = Date.now();
  try { const value = await fn(); return { value, ms: Date.now() - t0, records: ctx.log.records.slice(from) }; }
  catch (e) { return { error: e instanceof IntelligenceError ? e : new IntelligenceError('provider', { detail: String(e) }), ms: Date.now() - t0, records: ctx.log.records.slice(from) }; }
}

class Acc {
  errors = 0; errorKinds: Record<string, number> = {}; ms: number[] = []; cost = 0; costKnown = true; indexCost = 0; indexKnown = true; anyIndex = false; n = 0;
  add(r: { error?: IntelligenceError; ms: number; records: CallRecord[] }): boolean {
    for (const c of r.records) {
      if (c.stage === 'embed-items') { this.anyIndex = true; if (c.costUsd === undefined && c.ok) this.indexKnown = false; this.indexCost += c.costUsd ?? 0; continue; }
      if (c.ok && c.costUsd === undefined) this.costKnown = false;
      this.cost += c.costUsd ?? 0;
    }
    if (r.error) { this.errors++; this.errorKinds[r.error.kind] = (this.errorKinds[r.error.kind] ?? 0) + 1; return false; }
    this.n++;
    this.ms.push(r.ms - 0);
    return true;
  }
  finish(task: Task, name: string, metrics: EvalResult['metrics'], byTag: EvalResult['byTag'], extras: EvalResult['extras'] = {}): EvalResult {
    return { task, name, n: this.n, errors: this.errors, errorKinds: this.errorKinds, metrics, byTag, extras, latency: summarizeLatency(this.ms),
      costPer1000Usd: this.n && this.costKnown ? (this.cost / this.n) * 1000 : null, indexingCostUsd: this.anyIndex ? (this.indexKnown ? this.indexCost : null) : 0 };
  }
}

const groupByTag = <T extends { tags?: HardTag[] }>(rows: Array<{ c: T; v: Record<string, number | null> }>, keys: string[]): EvalResult['byTag'] => {
  const out: EvalResult['byTag'] = {};
  for (const tag of new Set(rows.flatMap((r) => r.c.tags ?? []))) {
    const sub = rows.filter((r) => r.c.tags?.includes(tag));
    out[tag] = { n: sub.length, metrics: Object.fromEntries(keys.map((k) => [k, meanDefined(sub.map((s) => s.v[k]))])) };
  }
  return out;
};

// ───────────── مرتبط‌ها ─────────────

export interface RelatedCombo { name: string; finders: FindRelatedRecipe['finders']; ranker: string | null }

export function relatedConfig(cfg: IntelligenceConfig, combo: RelatedCombo, candidates: number): IntelligenceConfig {
  return withRecipe<FindRelatedRecipe>(cfg, 'findRelated', (r) => {
    r.finders = structuredClone(combo.finders);
    r.ranker = combo.ranker ? { specialist: 'rerank', model: combo.ranker, enabled: true } : undefined;
    r.candidates = candidates;
    r.tiers = { strong: null, weak: null };
    r.maxReturned = null;
  });
}

export async function evalRelated(ctx: Ctx, combo: RelatedCombo, thresholdPrecision: { strong: number; weak: number }): Promise<EvalResult> {
  const env = ctx.makeEnv(relatedConfig(ctx.cfg, combo, Math.max(60, ctx.corpus.length)));
  const acc = new Acc();
  const scope = { workspaceId: 'eval', userId: 'eval' };
  const rows: Array<{ c: RelatedCase; v: Record<string, number | null> }> = [];
  const scored: Array<{ score: number; relevant: boolean }> = [];
  let totalRelevant = 0;
  for (const c of take(ctx.dataset.tasks.related, ctx.limit)) {
    const r = await timed(ctx, () => findRelated(env, 'findRelated', { scope, query: c.query, items: ctx.corpus, excludeIds: c.queryCorpusId ? [c.queryCorpusId] : [] }));
    if (!acc.add(r)) continue;
    const ranked = r.value!.items.map((x) => x.id);
    const rel = new Map(c.relevant.map((x) => [x.id, x.grade] as const));
    const hn = new Set(c.hardNegativeIds ?? []);
    const wl = wrongLinkRateAtK(ranked, rel, hn, 5);
    rows.push({ c, v: { p3: precisionAtK(ranked, rel, 3), p5: precisionAtK(ranked, rel, 5), p10: precisionAtK(ranked, rel, 10), r3: recallAtK(ranked, rel, 3), r5: recallAtK(ranked, rel, 5), r10: recallAtK(ranked, rel, 10), ndcg5: ndcgAtK(ranked, rel, 5), wrong5: wl.wrong, hardNeg5: wl.hardNegative } });
    totalRelevant += rel.size;
    for (const x of r.value!.items) if (x.score !== null) scored.push({ score: x.score, relevant: rel.has(x.id) });
  }
  const keys = ['p3', 'p5', 'p10', 'r3', 'r5', 'r10', 'ndcg5', 'wrong5', 'hardNeg5'];
  const metrics = Object.fromEntries(keys.map((k) => [k, meanDefined(rows.map((r) => r.v[k]))]));
  const extras: Record<string, unknown> = {};
  if (scored.length) {
    const sweep = thresholdSweep(scored, totalRelevant);
    extras.suggestedStrong = suggestThreshold(sweep, thresholdPrecision.strong);
    extras.suggestedWeak = suggestThreshold(sweep, thresholdPrecision.weak);
    extras.sweepPoints = sweep.length;
  }
  return acc.finish('related', combo.name, metrics, groupByTag(rows, keys), extras);
}

// ───────────── داور: نوع فکر، نوع دانش، قطعی/با تردید ─────────────

type JudgeCase = (ThoughtKindCase | KnowledgeTypeCase | CertaintyCase) & { expected: string };
const JUDGE_TASKS: Array<{ key: 'thoughtKind' | 'knowledgeType' | 'certainty'; question: string }> = [
  { key: 'thoughtKind', question: 'thoughtKind' }, { key: 'knowledgeType', question: 'knowledgeType' }, { key: 'certainty', question: 'certainty' },
];

export async function evalJudge(ctx: Ctx, judgeKey: string): Promise<EvalResult> {
  const acc = new Acc();
  const metrics: Record<string, number | null> = {};
  const byTagRows: Array<{ c: { tags?: HardTag[] }; v: Record<string, number | null> }> = [];
  const extras: Record<string, unknown> = {};
  const allCal: Array<{ confidence: number | undefined; correct: boolean }> = [];
  const allSel: Array<{ answered: boolean; correct: boolean }> = [];
  for (const t of JUDGE_TASKS) {
    const cfg = withRecipe<WhatIsThisRecipe>(ctx.cfg, 'whatIsThis', (r) => { r.judge = { model: judgeKey }; r.questions = r.questions.filter((q) => q.id === t.question); r.minConfidence = null; });
    const env = ctx.makeEnv(cfg);
    const pairs: Array<{ expected: string; predicted: string | null }> = [];
    const cal: Array<{ confidence: number | undefined; correct: boolean }> = [];
    const sel: Array<{ answered: boolean; correct: boolean }> = [];
    for (const c of take(ctx.dataset.tasks[t.key] as JudgeCase[], ctx.limit)) {
      const r = await timed(ctx, () => whatIsThis(env, 'whatIsThis', { text: c.text }));
      if (!acc.add(r)) continue;
      const a = r.value!.answers[0];
      const correct = a.choice === c.expected;
      pairs.push({ expected: c.expected, predicted: a.choice });
      cal.push({ confidence: a.confidence, correct });
      sel.push({ answered: !a.uncertain, correct });
      byTagRows.push({ c, v: { accuracy: correct ? 1 : 0 } });
    }
    const cf = confusion(pairs);
    metrics[`${t.key}.accuracy`] = pairs.length ? cf.accuracy : null;
    const ci = wilson(pairs.filter((p) => p.expected === p.predicted).length, pairs.length);
    extras[`${t.key}.ci95`] = ci;
    extras[`${t.key}.confusion`] = cf;
    extras[`${t.key}.calibration`] = calibration(cal);
    metrics[`${t.key}.unsureRate`] = pairs.length ? 1 - (selectiveAccuracy(sel).coverage ?? 0) : null;
    allCal.push(...cal); allSel.push(...sel);
  }
  const accs = JUDGE_TASKS.map((t) => metrics[`${t.key}.accuracy`]).filter((x): x is number => x !== null);
  metrics.accuracy = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null;
  const sa = selectiveAccuracy(allSel);
  metrics.coverage = sa.coverage; metrics.accuracyWhenAnswered = sa.accuracyWhenAnswered;
  extras.calibrationAll = calibration(allCal);
  return acc.finish('judge', judgeKey, metrics, groupByTag(byTagRows, ['accuracy']), extras);
}

// ───────────── کجا برود؟ ─────────────

export interface PlacementCombo { name: string; related: string; judge: string | null; candidates: WhereToRecipe['candidates']; dossier: boolean }

export async function evalPlacement(ctx: Ctx, combo: PlacementCombo, relatedCombos: RelatedCombo[]): Promise<EvalResult> {
  const rc = relatedCombos.find((x) => x.name === combo.related);
  if (!rc) throw new Error(`ترکیب مرتبط «${combo.related}» در combos.json نیست`);
  let cfg = relatedConfig(ctx.cfg, rc, 40);
  cfg = withRecipe<WhereToRecipe>(cfg, 'whereTo', (r) => { r.judge = combo.judge ? { model: combo.judge } : null; r.candidates = combo.candidates; r.dossier = combo.dossier; r.minConfidence = null; });
  const env = ctx.makeEnv(cfg);
  const acc = new Acc();
  const scope = { workspaceId: 'eval', userId: 'eval' };
  const rows: Array<{ c: PlacementCase; v: Record<string, number | null> }> = [];
  const sel: Array<{ answered: boolean; correct: boolean }> = [];
  const cal: Array<{ confidence: number | undefined; correct: boolean }> = [];
  for (const c of take(ctx.dataset.tasks.placement, ctx.limit)) {
    const r = await timed(ctx, () => whereTo(env, 'whereTo', { scope, text: c.text, sections: ctx.dataset.sections.map((s) => ({ id: s.id, label: s.label, description: s.description, parentId: s.parentId })), items: ctx.corpus, itemSection: ctx.itemSection }));
    if (!acc.add(r)) continue;
    const got = r.value!.sectionId;
    const ok = c.expectNone ? got === null : got !== null && (c.expectedNodeIds.includes(got) || (c.acceptableNodeIds ?? []).includes(got));
    const wrongAssign = got !== null && !ok ? 1 : 0;
    rows.push({ c, v: { accuracy: ok ? 1 : 0, wrongAssignment: wrongAssign, unsure: r.value!.uncertain ? 1 : 0, none: c.expectNone ? (got === null ? 1 : 0) : null } });
    sel.push({ answered: !r.value!.uncertain, correct: ok });
    cal.push({ confidence: r.value!.confidence, correct: ok });
  }
  const keys = ['accuracy', 'wrongAssignment', 'unsure', 'none'];
  const metrics = Object.fromEntries(keys.map((k) => [k, meanDefined(rows.map((r) => r.v[k]))]));
  const sa = selectiveAccuracy(sel);
  metrics.accuracyWhenAnswered = sa.accuracyWhenAnswered;
  const hits = rows.filter((r) => r.v.accuracy === 1).length;
  return acc.finish('placement', combo.name, metrics, groupByTag(rows, ['accuracy', 'wrongAssignment']), { ci95: wilson(hits, rows.length), calibration: calibration(cal) });
}

// ───────────── تکراری ─────────────

const jaccard = (a: string, b: string): number => {
  const norm = (s: string) => new Set(s.replace(/[‌]/g, ' ').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1));
  const A = norm(a), B = norm(b);
  let i = 0; for (const t of A) if (B.has(t)) i++;
  const u = A.size + B.size - i;
  return u ? i / u : 0;
};

export interface ScoreMethod { name: string; kind: 'lexical' | 'embedding' | 'rerank'; model?: string }
const cosineOf = (a: number[], b: number[]): number => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; } return x && y ? d / Math.sqrt(x * y) : 0; };

export async function evalDuplicatesScore(ctx: Ctx, m: ScoreMethod): Promise<EvalResult> {
  const acc = new Acc();
  const scored: Array<{ c: DuplicateCase; score: number }> = [];
  for (const c of take(ctx.dataset.tasks.duplicates, ctx.limit)) {
    const r = await timed(ctx, async () => {
      if (m.kind === 'lexical') return jaccard(c.a, c.b);
      if (m.kind === 'embedding') {
        const model = ctx.cfg.models[m.model!]; const p = ctx.specialists.embedding(m.model!);
        const { instrument } = await import('../../server/intelligence/callLog.ts');
        const out = await instrument({ log: ctx.log, recipe: 'eval', stage: 'duplicates' }, 'embedding', model, () => p.embed([c.a, c.b], 'query'));
        return cosineOf(out.value[0], out.value[1]);
      }
      const model = ctx.cfg.models[m.model!]; const p = ctx.specialists.rerank(m.model!);
      const { instrument } = await import('../../server/intelligence/callLog.ts');
      const out = await instrument({ log: ctx.log, recipe: 'eval', stage: 'duplicates' }, 'rerank', model, () => p.rerank(c.a, [c.b], 1));
      return out.value[0]?.score ?? 0;
    });
    if (acc.add(r)) scored.push({ c, score: r.value as number });
  }
  const dup = twoFoldThreshold(scored.map((s) => ({ score: s.score, positive: s.c.label === 'duplicate' })));
  const dupNear = twoFoldThreshold(scored.map((s) => ({ score: s.score, positive: s.c.label === 'duplicate' || s.c.label === 'near_duplicate' })));
  // مهم‌ترین تشخیص: تکراری در برابر «هم‌موضوع ولی متفاوت»
  const hard = scored.filter((s) => s.c.label === 'duplicate' || s.c.label === 'same_topic_different');
  const dupVsSame = twoFoldThreshold(hard.map((s) => ({ score: s.score, positive: s.c.label === 'duplicate' })));
  const metrics = { f1Duplicate: scored.length ? dup.f1 : null, precisionDuplicate: scored.length ? dup.precision : null, recallDuplicate: scored.length ? dup.recall : null, f1DupOrNear: scored.length ? dupNear.f1 : null, f1DupVsSameTopic: hard.length ? dupVsSame.f1 : null };
  return acc.finish('duplicates', m.name, metrics, {}, { thresholdDuplicate: dup.bestThresholdAll, note: 'آستانه با دو-بخشی (انتخاب روی نیمه، سنجش روی نیمهٔ دیگر) سنجیده شد' });
}

async function judgeOnce(ctx: Ctx, judgeKey: string, state: string, q: JudgmentQuestion): Promise<{ choice: string | null; confidence?: number }> {
  const { instrument } = await import('../../server/intelligence/callLog.ts');
  const out = await instrument({ log: ctx.log, recipe: 'eval', stage: 'judge' }, 'judgment', ctx.cfg.models[judgeKey], () => ctx.specialists.judgment(judgeKey).decide(state, [q]));
  const a = out.value[0];
  if (!a) throw new IntelligenceError('bad_output', { detail: 'داور پاسخی نداد' });
  return { choice: a.choice, confidence: a.confidence };
}

export async function evalDuplicatesJudge(ctx: Ctx, judgeKey: string, q: JudgmentQuestion): Promise<EvalResult> {
  const acc = new Acc();
  const pairs: Array<{ expected: string; predicted: string | null }> = [];
  const cal: Array<{ confidence: number | undefined; correct: boolean }> = [];
  for (const c of take(ctx.dataset.tasks.duplicates, ctx.limit)) {
    const r = await timed(ctx, () => judgeOnce(ctx, judgeKey, `متن A:\n${c.a}\n\nمتن B:\n${c.b}`, q));
    if (!acc.add(r)) continue;
    pairs.push({ expected: c.label, predicted: r.value!.choice });
    cal.push({ confidence: r.value!.confidence, correct: r.value!.choice === c.label });
  }
  const cf = confusion(pairs);
  const metrics = { f1Duplicate: cf.perLabel.duplicate?.f1 ?? null, accuracy: pairs.length ? cf.accuracy : null, f1DupOrNear: null, f1DupVsSameTopic: null, unsureRate: pairs.length ? cf.unanswered / pairs.length : null };
  return acc.finish('duplicates', `داور ${judgeKey}`, metrics, {}, { confusion: cf, calibration: calibration(cal) });
}

// ───────────── تناقض ─────────────

export async function evalContradictions(ctx: Ctx, judgeKey: string, q: JudgmentQuestion): Promise<EvalResult> {
  const acc = new Acc();
  const rows: Array<{ c: ContradictionCase; v: Record<string, number | null> }> = [];
  const pairs: Array<{ expected: string; predicted: string | null }> = [];
  const cal: Array<{ confidence: number | undefined; correct: boolean }> = [];
  for (const c of take(ctx.dataset.tasks.contradictions, ctx.limit)) {
    const r = await timed(ctx, () => judgeOnce(ctx, judgeKey, `خط قرمز:\n${c.redline.text}\n\nگفته:\n${c.statement}`, q));
    if (!acc.add(r)) continue;
    const exp = c.label;
    pairs.push({ expected: exp, predicted: r.value!.choice });
    cal.push({ confidence: r.value!.confidence, correct: r.value!.choice === exp });
    rows.push({ c, v: { accuracy: r.value!.choice === exp ? 1 : 0 } });
  }
  const cf = confusion(pairs);
  const falseAlarms = pairs.filter((p) => p.expected === 'consistent' && p.predicted === 'contradicts').length;
  const consistent = pairs.filter((p) => p.expected === 'consistent').length;
  const metrics = { accuracy: pairs.length ? cf.accuracy : null, recallContradicts: cf.perLabel.contradicts?.recall ?? null, precisionContradicts: cf.perLabel.contradicts?.precision ?? null, falseAlarm: consistent ? falseAlarms / consistent : null, unsureRate: pairs.length ? cf.unanswered / pairs.length : null };
  return acc.finish('contradictions', `داور ${judgeKey}`, metrics, groupByTag(rows, ['accuracy']), { confusion: cf, calibration: calibration(cal), ci95: wilson(pairs.filter((p) => p.expected === p.predicted).length, pairs.length) });
}

// ───────────── گفتار به متن ─────────────

export interface AudioCase { file: string; reference: string; bytes: Uint8Array; mime: string; seconds: number | null }
const MIME: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm', '.aac': 'audio/aac' };

function wavSeconds(b: Uint8Array): number | null {
  if (b.length < 44 || String.fromCharCode(...b.slice(0, 4)) !== 'RIFF') return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const byteRate = dv.getUint32(28, true);
  return byteRate ? (b.length - 44) / byteRate : null;
}

export function loadAudio(dir: string): AudioCase[] {
  if (!existsSync(dir)) return [];
  const out: AudioCase[] = [];
  for (const f of readdirSync(dir).sort()) {
    const ext = path.extname(f).toLowerCase();
    if (!MIME[ext]) continue;
    const txt = path.join(dir, f.slice(0, -ext.length) + '.txt');
    if (!existsSync(txt)) continue;
    const bytes = new Uint8Array(readFileSync(path.join(dir, f)));
    out.push({ file: f, reference: readFileSync(txt, 'utf8').trim(), bytes, mime: MIME[ext], seconds: ext === '.wav' ? wavSeconds(bytes) : null });
  }
  return out;
}

export async function evalAsr(ctx: Ctx, modelKey: string, audio: AudioCase[]): Promise<EvalResult> {
  const acc = new Acc();
  const cers: number[] = [], wers: number[] = [];
  const perFile: Array<{ file: string; cer: number; wer: number; hyp: string }> = [];
  let secs = 0, secsKnown = true;
  const { instrument } = await import('../../server/intelligence/callLog.ts');
  for (const a of take(audio, ctx.limit)) {
    const r = await timed(ctx, async () => (await instrument({ log: ctx.log, recipe: 'eval', stage: 'transcribe' }, 'transcription', ctx.cfg.models[modelKey], () => ctx.specialists.transcription(modelKey).transcribe({ data: a.bytes, fileName: a.file, mimeType: a.mime, language: 'fa' }))).value.text);
    if (!acc.add(r)) continue;
    const c = cer(a.reference, r.value!), w = wer(a.reference, r.value!);
    cers.push(c); wers.push(w); perFile.push({ file: a.file, cer: c, wer: w, hyp: r.value! });
    if (a.seconds === null) secsKnown = false; else secs += a.seconds;
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const pricing = ctx.cfg.models[modelKey].pricing;
  const costPerMinute = pricing?.unit === 'perAudioMinute' && pricing.currency === 'USD' ? pricing.amount : null;
  const res = acc.finish('asr', modelKey, { cer: mean(cers), wer: mean(wers) }, {}, { perFile, audioSeconds: secsKnown ? secs : null, costPerAudioMinuteUsd: costPerMinute });
  res.costPer1000Usd = null; // هزینه به ثانیه است نه به مورد؛ در گزارش «هزینهٔ هر دقیقه» می‌آید
  return res;
}

/** نسبت توکن واقعی (گزارش ارائه‌دهنده) به تخمین محافظه‌کارانهٔ ما؛ بالاتر از ۱ یعنی تخمین کم‌شماری می‌کند و charsPerToken باید کمتر شود */
export async function calibrateTokens(ctx: Ctx, modelKey: string, texts: string[]): Promise<{ ratio: number | null; samples: number; worst: number | null }> {
  const m = ctx.cfg.models[modelKey];
  const meter = charMeter(m.charsPerToken ?? 2);
  const p = ctx.specialists.embedding(modelKey);
  const ratios: number[] = [];
  let est = 0, real = 0;
  for (const t of texts) {
    const e = meter.count((m.inputPrefix?.passage ?? '') + t);
    if (m.maxInputTokens && e > m.maxInputTokens) continue;
    try {
      const out = await p.embed([t], 'passage');
      if (out.usage.inputTokens === undefined) continue;
      ratios.push(out.usage.inputTokens / e); est += e; real += out.usage.inputTokens;
    } catch { /* نمونهٔ ناموفق کنار می‌رود؛ شمار نمونه‌ها گزارش می‌شود */ }
  }
  return { ratio: est ? real / est : null, samples: ratios.length, worst: ratios.length ? Math.max(...ratios) : null };
}
