import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTELLIGENCE_CAPABILITIES } from '../../src/core/entitlements.config.ts';
import type { IntelligenceCapability } from '../../src/core/entitlements.config.ts';
import type { JudgmentQuestion, ModelEntry } from './types.ts';

/**
 * پیکربندی لایهٔ هوش. دو فایل داده:
 *  - `server/ai/config/models.json` (بخش `intelligence`): مدل‌ها با «کلید مستعار»؛ نام مدل فقط آنجاست (قانون ۴)
 *  - `server/intelligence/config/recipes.json`: دستورپخت‌ها؛ فقط کلید مستعار می‌آورند
 * عوض کردن مدل یا حذف یک مرحله فقط تغییر همین دو فایل است.
 */

/** «کدام پلن» فقط در src/core/entitlements.config.ts (قانون ۵)؛ دستورپخت فقط کلید قابلیت می‌آورد */
export type { IntelligenceCapability };

export interface FinderConfig {
  specialist: 'lexical' | 'embedding';
  /** کلید مستعار مدل (فقط برای embedding) */
  model?: string;
  /** وزن در ترکیب رتبه‌ها */
  weight: number;
  /** نقش متن پرس‌وجو برای مدل‌های دارای پیشوند: پرس‌وجو/سند. پیش‌فرض 'query'؛ ارزیابی هر دو را می‌سنجد. */
  queryRole?: 'query' | 'passage';
}

export interface FindRelatedRecipe {
  kind: 'findRelated';
  description: string;
  version: number;
  /** کلید قابلیت در entitlements.config (intelligence)؛ پلن‌ها آنجا مشخص می‌شوند */
  capability: IntelligenceCapability;
  finders: FinderConfig[];
  fusion: { method: 'rrf'; k: number };
  /** چند نامزد از یابنده به مرتب‌کننده می‌رسد (سقف هزینه/تأخیر مرتب‌کننده، نه سقف نمایش) */
  candidates: number;
  /** مرتب‌کننده؛ `enabled: false` یا حذف = بدون مرتب‌کننده */
  ranker?: { specialist: 'rerank'; model: string; enabled: boolean };
  /**
   * آستانه‌ها بر اساس امتیاز مرتب‌کننده (نه شمار ثابت). null = هنوز سنجیده نشده؛ همه‌چیز «بی‌درجه» برمی‌گردد.
   * بالاتر از strong «مرتبط»؛ بین weak و strong «کمتر مرتبط» (جدا علامت می‌خورد تا رابط بعداً به‌تدریج نشانش دهد)؛ زیر weak کنار می‌رود.
   */
  tiers: { strong: number | null; weak: number | null };
  /** سقف ایمنی شمار نتیجه؛ null = بی‌سقف */
  maxReturned: number | null;
}

export interface WhatIsThisRecipe {
  kind: 'whatIsThis';
  description: string;
  version: number;
  /** کلید قابلیت در entitlements.config (intelligence)؛ پلن‌ها آنجا مشخص می‌شوند */
  capability: IntelligenceCapability;
  judge: { model: string };
  questions: JudgmentQuestion[];
  /** زیر این اطمینان پاسخ «مطمئن نبود» علامت می‌خورد؛ null = هنوز سنجیده نشده */
  minConfidence: number | null;
}

export interface WhereToRecipe {
  kind: 'whereTo';
  description: string;
  version: number;
  /** کلید قابلیت در entitlements.config (intelligence)؛ پلن‌ها آنجا مشخص می‌شوند */
  capability: IntelligenceCapability;
  /** نام دستورپخت «مرتبط‌ها» که نامزدها را می‌سازد */
  related: string;
  /** null = بدون داور: بخشِ بهترین مورد مرتبط برگزیده می‌شود (خط پایهٔ ارزیابی) */
  judge: { model: string } | null;
  /**
   * نامزدها از کجا می‌آیند. `all_if_fits`: همهٔ بخش‌ها اگر در سقف توکن داور جا شوند (سنجیده با توکن)، وگرنه بخش‌های مرتبط‌ها و والدهایشان.
   * `related`: فقط بخش‌های مرتبط‌ها و والدهایشان. `all`: همهٔ بخش‌ها.
   */
  candidates: 'all_if_fits' | 'related' | 'all';
  instructions: string;
  /** «پرونده»: نمونه‌های مرتبط (با بخششان) به داور داده شوند، تا سقف توکن داور */
  dossier: boolean;
  /** گزینهٔ صریح «هیچ‌کدام» */
  noneOption: boolean;
  minConfidence: number | null;
}

export interface TranscribeRecipe {
  kind: 'transcribe';
  description: string;
  version: number;
  /** کلید قابلیت در entitlements.config (intelligence)؛ پلن‌ها آنجا مشخص می‌شوند */
  capability: IntelligenceCapability;
  model: string;
  language: string;
}

export type RecipeConfig = FindRelatedRecipe | WhatIsThisRecipe | WhereToRecipe | TranscribeRecipe;

export interface IntelligenceConfig {
  liara: { baseUrlEnv: string; apiKeyEnv: string; timeoutsMs: Record<ModelEntry['kind'], number> };
  models: Record<string, ModelEntry>;
  recipes: Record<string, RecipeConfig>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const MODELS_FILE = path.join(here, '..', 'ai', 'config', 'models.json');
export const RECIPES_FILE = path.join(here, 'config', 'recipes.json');

const KINDS: ModelEntry['kind'][] = ['embedding', 'rerank', 'judgment', 'transcription'];

/** همهٔ کلیدهای مدلی که یک دستورپخت به آن‌ها اشاره می‌کند، با نوع لازم */
export function modelRefs(r: RecipeConfig): Array<{ key: string; kind: ModelEntry['kind'] }> {
  switch (r.kind) {
    case 'findRelated': return [
      ...r.finders.filter((f) => f.specialist === 'embedding').map((f) => ({ key: f.model ?? '', kind: 'embedding' as const })),
      ...(r.ranker?.enabled ? [{ key: r.ranker.model, kind: 'rerank' as const }] : []),
    ];
    case 'whatIsThis': return [{ key: r.judge.model, kind: 'judgment' }];
    case 'whereTo': return r.judge ? [{ key: r.judge.model, kind: 'judgment' }] : [];
    case 'transcribe': return [{ key: r.model, kind: 'transcription' }];
  }
}

/** بررسی ساختاری؛ فهرست مشکل‌ها (خالی = سالم) */
export function validateConfig(cfg: IntelligenceConfig): string[] {
  const bad: string[] = [];
  for (const [key, m] of Object.entries(cfg.models)) {
    if (!KINDS.includes(m.kind)) bad.push(`مدل ${key}: نوع نامعتبر`);
    if (!m.id) bad.push(`مدل ${key}: id خالی`);
    if (m.kind === 'embedding' && !m.maxInputTokens) bad.push(`مدل ${key}: maxInputTokens لازم است`);
  }
  for (const [name, r] of Object.entries(cfg.recipes)) {
    if (!INTELLIGENCE_CAPABILITIES.includes(r.capability)) bad.push(`دستورپخت ${name}: capability نامعتبر یا ناموجود در entitlements.config`);
    for (const ref of modelRefs(r)) {
      const m = cfg.models[ref.key];
      if (!m) bad.push(`دستورپخت ${name}: مدل «${ref.key}» در models.json نیست`);
      else if (m.kind !== ref.kind) bad.push(`دستورپخت ${name}: مدل «${ref.key}» از نوع ${m.kind} است، ${ref.kind} لازم بود`);
    }
    if (r.kind === 'findRelated') {
      if (!r.finders.length) bad.push(`دستورپخت ${name}: دست‌کم یک یابنده لازم است`);
      for (const f of r.finders) if (f.specialist === 'embedding' && !f.model) bad.push(`دستورپخت ${name}: یابندهٔ embedding بی‌مدل`);
      if ((r.tiers.strong === null) !== (r.tiers.weak === null)) bad.push(`دستورپخت ${name}: آستانه‌ها باید هر دو null یا هر دو عدد باشند`);
      if (r.tiers.strong !== null && r.tiers.weak !== null && r.tiers.weak > r.tiers.strong) bad.push(`دستورپخت ${name}: آستانهٔ weak از strong بیشتر است`);
    }
    if (r.kind === 'whereTo') {
      if (cfg.recipes[r.related]?.kind !== 'findRelated') bad.push(`دستورپخت ${name}: related باید یک دستورپخت findRelated باشد`);
      if (r.judge && r.candidates === 'all_if_fits' && !cfg.models[r.judge.model]?.maxInputTokens) bad.push(`دستورپخت ${name}: all_if_fits به maxInputTokens مدل داور نیاز دارد (بدون سقف معلوم، «جا شد؟» قابل‌اندازه‌گیری نیست)`);
    }
    if (r.kind === 'whatIsThis') {
      const jm = cfg.models[r.judge.model];
      if (jm?.kind === 'judgment' && r.kind === 'whatIsThis' && jm.limits?.maxQuestions && r.questions.length > jm.limits.maxQuestions) bad.push(`دستورپخت ${name}: شمار سؤال‌ها از سقف مدل بیشتر است`);
    }
  }
  return bad;
}

export function loadIntelligenceConfig(files: { models?: string; recipes?: string } = {}): IntelligenceConfig {
  const rawModels = JSON.parse(readFileSync(files.models ?? MODELS_FILE, 'utf8')) as { intelligence?: { liara: IntelligenceConfig['liara']; models: Record<string, Omit<ModelEntry, 'key'>> } };
  const section = rawModels.intelligence;
  if (!section) throw new Error('models.json: بخش intelligence نیست');
  const rawRecipes = JSON.parse(readFileSync(files.recipes ?? RECIPES_FILE, 'utf8')) as { recipes: Record<string, RecipeConfig> };
  const cfg: IntelligenceConfig = {
    liara: section.liara,
    models: Object.fromEntries(Object.entries(section.models).map(([key, m]) => [key, { ...m, key } as ModelEntry])),
    recipes: rawRecipes.recipes,
  };
  const problems = validateConfig(cfg);
  if (problems.length) throw new Error(`پیکربندی لایهٔ هوش نامعتبر است:\n- ${problems.join('\n- ')}`);
  return cfg;
}

/** کپی عمیق + وصله (برای ارزیابی: ترکیب‌های گوناگون فقط تغییر پیکربندی‌اند) */
export function withRecipe<T extends RecipeConfig>(cfg: IntelligenceConfig, name: string, patch: (r: T) => void): IntelligenceConfig {
  const copy = structuredClone(cfg);
  patch(copy.recipes[name] as T);
  const problems = validateConfig(copy);
  if (problems.length) throw new Error(`ترکیب نامعتبر:\n- ${problems.join('\n- ')}`);
  return copy;
}
