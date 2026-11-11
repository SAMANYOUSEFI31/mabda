import { instrument, type CallContext } from './callLog.ts';
import { charMeter, chunkByStructure, CHUNKER_VERSION } from './chunker.ts';
import type { FindRelatedRecipe, IntelligenceConfig, RecipeConfig, TranscribeRecipe, WhatIsThisRecipe, WhereToRecipe } from './config.ts';
import { IntelligenceError } from './errors.ts';
import { lexicalRank } from './lexical.ts';
import { cosine, normalizeForHash, rrf, sha1, toFloat32, type Ranked } from './math.ts';
import type { EmbeddingKey, EmbeddingStore, JudgmentAnswer, JudgmentQuestion, ModelEntry, Specialists, TranscriptionInput } from './types.ts';
import { embeddingKeyId } from './types.ts';
import type { PlanId } from '../../src/types/index.ts';
import { hasIntelligenceCapability } from '../../src/core/entitlements.ts';

/**
 * اجرای دستورپخت‌ها. هیچ مدل یا آستانه‌ای در این فایل نیست: هرچه هست از `config/recipes.json` و `models.json` می‌آید.
 * کد فقط روی چیزهای قابل‌اندازه‌گیری تصمیم می‌گیرد (طول به توکن در برابر سقف مدل، تیتر و بولت صریح، امتیاز در برابر آستانهٔ config).
 */

export interface Env {
  cfg: IntelligenceConfig;
  specialists: Specialists;
  store: EmbeddingStore;
  call: CallContext;
}

export interface Scope { workspaceId: string; userId: string }

export interface Item { id: string; kind: 'object' | 'thought' | 'note' | 'file'; text: string }

export type RelatedTier = 'strong' | 'weak' | 'unscored';
export interface RelatedItem {
  id: string;
  kind: Item['kind'];
  /** امتیاز مرتب‌کننده (اگر بود)؛ وگرنه null */
  score: number | null;
  tier: RelatedTier;
  rank: number;
  signals: { lexicalRank?: number; embeddingRank?: Record<string, number>; embeddingCosine?: Record<string, number>; fusedScore: number };
}
export interface FindRelatedResult {
  recipe: string;
  version: number;
  items: RelatedItem[];
  /** کدام مرحله‌ها واقعاً اجرا شدند */
  stages: string[];
}

const recipeOf = <K extends RecipeConfig['kind']>(cfg: IntelligenceConfig, name: string, kind: K): Extract<RecipeConfig, { kind: K }> => {
  const r = cfg.recipes[name];
  if (!r || r.kind !== kind) throw new IntelligenceError('bad_request', { detail: `دستورپخت «${name}» از نوع ${kind} نیست` });
  return r as Extract<RecipeConfig, { kind: K }>;
};

function gate(r: RecipeConfig, plan: PlanId | undefined): void {
  if (plan && !hasIntelligenceCapability(plan, r.capability)) throw new IntelligenceError('disabled');
}

const modelOf = (cfg: IntelligenceConfig, key: string): ModelEntry => {
  const m = cfg.models[key];
  if (!m) throw new IntelligenceError('bad_request', { detail: `مدل «${key}» در config نیست` });
  return m;
};

/** بودجهٔ توکن یک تکه برای مدل (پس از حاشیهٔ ایمنی و پیشوند)، از config */
function chunkBudget(m: ModelEntry, extraChars = 0): { budget: number; meter: ReturnType<typeof charMeter> } {
  if (!m.maxInputTokens) throw new IntelligenceError('bad_request', { detail: `مدل «${m.key}» maxInputTokens ندارد` });
  const meter = charMeter(m.charsPerToken ?? 2);
  const budget = Math.floor(m.maxInputTokens * (m.inputSafety ?? 0.9)) - meter.count('x'.repeat(extraChars));
  if (budget < 8) throw new IntelligenceError('bad_request', { detail: `بودجهٔ توکن مدل «${m.key}» بسیار کوچک است` });
  return { budget, meter };
}

// ───────────── مرتبط‌ها را پیدا کن ─────────────

interface EmbeddedChunk { itemId: string; vector: Float32Array }

/** بردارِ تکه‌های هر چیز: از ذخیره می‌خواند، فقط نبوده‌ها را محاسبه می‌کند و بردار کهنه را پاک می‌کند */
export async function embedItems(env: Env, scope: Scope, modelKey: string, items: Item[], recipe: string): Promise<EmbeddedChunk[]> {
  const model = modelOf(env.cfg, modelKey);
  const provider = env.specialists.embedding(modelKey);
  const { budget, meter } = chunkBudget(model, model.inputPrefix?.passage.length ?? 0);
  const entries: Array<{ item: Item; key: EmbeddingKey; text: string }> = [];
  for (const item of items) {
    for (const c of chunkByStructure(item.text, budget, meter)) {
      const textHash = sha1(`${CHUNKER_VERSION}|${model.id}|${normalizeForHash(c.text)}`);
      entries.push({ item, text: c.text, key: { workspaceId: scope.workspaceId, userId: scope.userId, itemKind: item.kind, itemId: item.id, chunkIndex: c.index, textHash, modelKey } });
    }
  }
  const have = await env.store.getMany(entries.map((e) => e.key));
  const missing = entries.filter((e) => !have.has(embeddingKeyId(e.key)));
  const batch = model.limits?.maxTexts ?? 32;
  for (let i = 0; i < missing.length; i += batch) {
    const part = missing.slice(i, i + batch);
    const out = await instrument({ ...env.call, recipe, stage: 'embed-items' }, 'embedding', model, () => provider.embed(part.map((p) => p.text), 'passage'));
    if (out.value.length !== part.length) throw new IntelligenceError('bad_output', { detail: `embedding ${out.value.length} بردار برای ${part.length} متن`, specialist: 'embedding', modelKey });
    const rows = part.map((p, j) => ({ key: p.key, vector: toFloat32(out.value[j]) }));
    await env.store.putMany(rows);
    for (const r of rows) have.set(embeddingKeyId(r.key), r.vector);
  }
  const byItem = new Map<string, string[]>();
  for (const e of entries) byItem.set(e.item.id, [...(byItem.get(e.item.id) ?? []), e.key.textHash]);
  for (const item of items) await env.store.dropStale(scope.workspaceId, scope.userId, item.kind, item.id, modelKey, byItem.get(item.id) ?? []);
  return entries.map((e) => ({ itemId: e.item.id, vector: have.get(embeddingKeyId(e.key))! }));
}

async function embeddingRank(env: Env, scope: Scope, modelKey: string, query: string, queryRole: 'query' | 'passage', items: Item[], recipe: string): Promise<{ ranked: Ranked[]; cosines: Map<string, number> }> {
  const model = modelOf(env.cfg, modelKey);
  const provider = env.specialists.embedding(modelKey);
  const corpus = await embedItems(env, scope, modelKey, items, recipe);
  const { budget, meter } = chunkBudget(model, model.inputPrefix?.[queryRole].length ?? 0);
  const qChunks = chunkByStructure(query, budget, meter).map((c) => c.text);
  if (!qChunks.length) return { ranked: [], cosines: new Map() };
  const q = await instrument({ ...env.call, recipe, stage: 'embed-query' }, 'embedding', model, () => provider.embed(qChunks, queryRole));
  const qv = q.value.map(toFloat32);
  const best = new Map<string, number>();
  for (const c of corpus) {
    let s = -Infinity;
    for (const v of qv) s = Math.max(s, cosine(v, c.vector));
    if (s > (best.get(c.itemId) ?? -Infinity)) best.set(c.itemId, s);
  }
  const ranked = [...best].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return { ranked, cosines: best };
}

export async function findRelated(env: Env, name: string, input: { scope: Scope; query: string; items: Item[]; excludeIds?: string[]; plan?: PlanId }): Promise<FindRelatedResult> {
  const r = recipeOf(env.cfg, name, 'findRelated');
  gate(r, input.plan);
  const exclude = new Set(input.excludeIds ?? []);
  const items = input.items.filter((i) => !exclude.has(i.id) && i.text.trim());
  const stages: string[] = [];
  if (!items.length || !input.query.trim()) return { recipe: name, version: r.version, items: [], stages };

  // ۱) یابنده‌ها
  const lists: Array<{ ranked: Ranked[]; weight: number }> = [];
  const lexRanks = new Map<string, number>();
  const embRanks = new Map<string, Record<string, number>>();
  const embCos = new Map<string, Record<string, number>>();
  for (const f of r.finders) {
    if (f.specialist === 'lexical') {
      const ranked = lexicalRank(input.query, items);
      stages.push('lexical');
      ranked.forEach((x, i) => lexRanks.set(x.id, i + 1));
      lists.push({ ranked, weight: f.weight });
    } else {
      const { ranked, cosines } = await embeddingRank(env, input.scope, f.model!, input.query, f.queryRole ?? 'query', items, name);
      stages.push(`embedding:${f.model}`);
      ranked.forEach((x, i) => { embRanks.set(x.id, { ...(embRanks.get(x.id) ?? {}), [f.model!]: i + 1 }); embCos.set(x.id, { ...(embCos.get(x.id) ?? {}), [f.model!]: cosines.get(x.id) ?? 0 }); });
      lists.push({ ranked, weight: f.weight });
    }
  }
  const fused = rrf(lists, r.fusion.k).slice(0, r.candidates);
  stages.push('fusion');
  const byId = new Map(items.map((i) => [i.id, i]));

  // ۲) مرتب‌کننده
  let rerankScores: Map<string, number> | null = null;
  let order = fused;
  let calibrated = false;
  if (r.ranker?.enabled && fused.length) {
    const model = modelOf(env.cfg, r.ranker.model);
    const provider = env.specialists.rerank(r.ranker.model);
    const docs: Array<{ id: string; text: string }> = [];
    for (const f of fused) {
      const it = byId.get(f.id)!;
      if (model.maxInputTokens) { const { budget, meter } = chunkBudget(model); for (const c of chunkByStructure(it.text, budget, meter)) docs.push({ id: it.id, text: c.text }); }
      else docs.push({ id: it.id, text: it.text });
    }
    const out = await instrument({ ...env.call, recipe: name, stage: 'rerank' }, 'rerank', model, () => provider.rerank(input.query, docs.map((d) => d.text), docs.length));
    rerankScores = new Map();
    for (const x of out.value) {
      const d = docs[x.index];
      if (!d) throw new IntelligenceError('bad_output', { detail: `شاخص rerank نامعتبر: ${x.index}`, specialist: 'rerank', modelKey: model.key });
      rerankScores.set(d.id, Math.max(rerankScores.get(d.id) ?? -Infinity, x.score));
    }
    order = fused.filter((f) => rerankScores!.has(f.id)).sort((a, b) => rerankScores!.get(b.id)! - rerankScores!.get(a.id)! || b.score - a.score);
    calibrated = !!model.calibratedScore;
    stages.push(`rerank:${r.ranker.model}`);
  }

  // ۳) درجه بر اساس امتیاز (نه شمار ثابت)
  const out: RelatedItem[] = [];
  for (const f of order) {
    const score = rerankScores?.get(f.id) ?? null;
    let tier: RelatedTier = 'unscored';
    if (score !== null && calibrated && r.tiers.strong !== null && r.tiers.weak !== null) {
      if (score >= r.tiers.strong) tier = 'strong';
      else if (score >= r.tiers.weak) tier = 'weak';
      else continue;
    }
    const it = byId.get(f.id)!;
    out.push({ id: f.id, kind: it.kind, score, tier, rank: out.length + 1, signals: { lexicalRank: lexRanks.get(f.id), embeddingRank: embRanks.get(f.id), embeddingCosine: embCos.get(f.id), fusedScore: f.score } });
    if (r.maxReturned !== null && out.length >= r.maxReturned) break;
  }
  return { recipe: name, version: r.version, items: out, stages };
}

// ───────────── این چیست؟ ─────────────

export interface Judged {
  questionId: string;
  /** گزینهٔ برگزیده؛ null = «هیچ‌کدام/نامعلوم» */
  choice: string | null;
  confidence?: number;
  probabilities?: Record<string, number>;
  /** داور مطمئن نبود: نامعلوم گفت، یا اطمینانش زیر آستانهٔ config بود. کاربر داور نهایی است. */
  uncertain: boolean;
}

const mapAnswer = (a: JudgmentAnswer, minConfidence: number | null): Judged => ({
  questionId: a.id,
  choice: a.choice,
  confidence: a.confidence,
  probabilities: a.probabilities,
  uncertain: a.choice === null || (minConfidence !== null && a.confidence !== undefined && a.confidence < minConfidence),
});

function ensureFits(model: ModelEntry, state: string, extra: string): void {
  if (!model.maxInputTokens) return;
  const meter = charMeter(model.charsPerToken ?? 2);
  if (meter.count(state) + meter.count(extra) > Math.floor(model.maxInputTokens * (model.inputSafety ?? 0.9))) {
    throw new IntelligenceError('input_too_long', { specialist: 'judgment', modelKey: model.key });
  }
}

export async function whatIsThis(env: Env, name: string, input: { text: string; plan?: PlanId }): Promise<{ recipe: string; version: number; answers: Judged[] }> {
  const r: WhatIsThisRecipe = recipeOf(env.cfg, name, 'whatIsThis');
  gate(r, input.plan);
  const model = modelOf(env.cfg, r.judge.model);
  ensureFits(model, input.text, JSON.stringify(r.questions));
  const out = await instrument({ ...env.call, recipe: name, stage: 'judge' }, 'judgment', model, () => env.specialists.judgment(r.judge.model).decide(input.text, r.questions));
  if (out.value.length !== r.questions.length) throw new IntelligenceError('bad_output', { detail: `${out.value.length} پاسخ برای ${r.questions.length} سؤال`, specialist: 'judgment', modelKey: model.key });
  return { recipe: name, version: r.version, answers: out.value.map((a) => mapAnswer(a, r.minConfidence)) };
}

// ───────────── کجا برود؟ ─────────────

export interface Section { id: string; label: string; description?: string; parentId: string | null }
export const NONE_OPTION_ID = '__none__';

const pathOf = (sections: Map<string, Section>, id: string): string => {
  const parts: string[] = [];
  for (let cur = sections.get(id), guard = 0; cur && guard < 32; cur = cur.parentId ? sections.get(cur.parentId) : undefined, guard++) parts.unshift(cur.label);
  return parts.join(' › ');
};

export interface WhereToResult {
  recipe: string;
  version: number;
  /** بخش برگزیده؛ null = هیچ‌کدام یا داور مطمئن نبود */
  sectionId: string | null;
  uncertain: boolean;
  confidence?: number;
  probabilities?: Record<string, number>;
  /** نامزدهایی که به داور داده شد */
  candidateIds: string[];
  related: FindRelatedResult;
}

export async function whereTo(env: Env, name: string, input: { scope: Scope; text: string; sections: Section[]; items: Item[]; itemSection: Record<string, string>; excludeIds?: string[]; plan?: PlanId }): Promise<WhereToResult> {
  const r: WhereToRecipe = recipeOf(env.cfg, name, 'whereTo');
  gate(r, input.plan);
  const sections = new Map(input.sections.map((s) => [s.id, s]));
  const related = await findRelated(env, r.related, { scope: input.scope, query: input.text, items: input.items, excludeIds: input.excludeIds, plan: input.plan });
  if (!r.judge) {
    // بدون داور (خط پایهٔ ارزیابی): بخشِ بهترین مورد مرتبط؛ «مطمئن نیست» یعنی آن مورد «قوی» نبود
    const top = related.items.find((x) => input.itemSection[x.id]);
    return { recipe: name, version: r.version, sectionId: top ? input.itemSection[top.id] : null, uncertain: !top || top.tier !== 'strong', candidateIds: [], related };
  }
  const judgeModel = modelOf(env.cfg, r.judge.model);

  const describe = (s: Section): { id: string; description: string } => ({ id: s.id, description: `${pathOf(sections, s.id)}${s.description ? ` — ${s.description}` : ''}` });
  const fromRelated = (): Section[] => {
    const ids = new Set<string>();
    for (const it of related.items) {
      for (let cur = input.itemSection[it.id] ? sections.get(input.itemSection[it.id]) : undefined, g = 0; cur && g < 32; cur = cur.parentId ? sections.get(cur.parentId) : undefined, g++) ids.add(cur.id);
    }
    return input.sections.filter((s) => ids.has(s.id));
  };
  let candidates: Section[];
  if (r.candidates === 'all') candidates = input.sections;
  else if (r.candidates === 'related') candidates = fromRelated();
  else {
    const meter = charMeter(judgeModel.charsPerToken ?? 2);
    const all = input.sections.map(describe);
    const fits = judgeModel.maxInputTokens !== undefined && meter.count(input.text) + meter.count(JSON.stringify(all)) + meter.count(r.instructions) <= Math.floor(judgeModel.maxInputTokens * (judgeModel.inputSafety ?? 0.9)) * 0.7;
    candidates = fits ? input.sections : fromRelated();
  }
  if (!candidates.length) candidates = input.sections;

  const criteria = [...candidates.map(describe), ...(r.noneOption ? [{ id: NONE_OPTION_ID, description: 'هیچ‌کدام از این بخش‌ها (متن به بخش دیگری یا بخش تازه‌ای مربوط است)' }] : [])];
  const dossier = r.dossier ? related.items.filter((x) => input.itemSection[x.id]).map((x) => `- «${(input.items.find((i) => i.id === x.id)?.text ?? '').replace(/\s+/g, ' ').slice(0, 160)}» ← در بخش «${sections.get(input.itemSection[x.id])?.label ?? ''}»`) : [];
  let state = input.text;
  if (dossier.length) {
    // پرونده تا جایی که در بودجهٔ توکن داور جا شود (سنجیده با توکن)، به ترتیب رتبه
    const meter = charMeter(judgeModel.charsPerToken ?? 2);
    const cap = judgeModel.maxInputTokens ? Math.floor(judgeModel.maxInputTokens * (judgeModel.inputSafety ?? 0.9)) - meter.count(input.text) - meter.count(JSON.stringify(criteria)) - meter.count(r.instructions) : Infinity; // سقف نامعلوم = بدون برش (هر مورد پرونده کوتاه‌شده است)
    const kept: string[] = [];
    let used = 0;
    for (const line of dossier) { const t = meter.count(line); if (used + t > cap) break; kept.push(line); used += t; }
    if (kept.length) state = `${input.text}\n\nمورد مشابه در پرونده:\n${kept.join('\n')}`;
  }
  const question: JudgmentQuestion = { id: 'section', type: 'choice', instructions: r.instructions, criteria };
  ensureFits(judgeModel, state, JSON.stringify(question));
  const out = await instrument({ ...env.call, recipe: name, stage: 'judge' }, 'judgment', judgeModel, () => env.specialists.judgment(judgeModel.key).decide(state, [question]));
  const a = out.value[0];
  if (!a) throw new IntelligenceError('bad_output', { detail: 'داور پاسخی نداد', specialist: 'judgment', modelKey: judgeModel.key });
  const j = mapAnswer(a, r.minConfidence);
  const chosen = j.choice === NONE_OPTION_ID ? null : j.choice;
  if (chosen !== null && !candidates.some((c) => c.id === chosen)) throw new IntelligenceError('bad_output', { detail: `بخش برگزیده «${chosen}» در نامزدها نبود`, specialist: 'judgment', modelKey: judgeModel.key });
  return { recipe: name, version: r.version, sectionId: chosen, uncertain: j.uncertain || chosen === null, confidence: j.confidence, probabilities: j.probabilities, candidateIds: candidates.map((c) => c.id), related };
}

// ───────────── صدا را به متن تبدیل کن ─────────────

export async function transcribe(env: Env, name: string, input: { audio: Omit<TranscriptionInput, 'language'>; plan?: PlanId }): Promise<{ recipe: string; version: number; text: string }> {
  const r: TranscribeRecipe = recipeOf(env.cfg, name, 'transcribe');
  gate(r, input.plan);
  const model = modelOf(env.cfg, r.model);
  const lim = model.limits;
  if (lim?.maxAudioBytes && input.audio.data.byteLength > lim.maxAudioBytes) throw new IntelligenceError('input_too_long', { specialist: 'transcription', modelKey: model.key, detail: 'اندازهٔ فایل صدا از سقف مدل بیشتر است' });
  const out = await instrument({ ...env.call, recipe: name, stage: 'transcribe' }, 'transcription', model, () => env.specialists.transcription(r.model).transcribe({ ...input.audio, language: r.language }));
  return { recipe: name, version: r.version, text: out.value.text };
}
