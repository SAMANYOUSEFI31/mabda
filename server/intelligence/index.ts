import type Database from 'better-sqlite3';
import type { PlanId } from '../../src/types/index.ts';
import { consoleCallLog } from './callLog.ts';
import { loadIntelligenceConfig, type IntelligenceConfig } from './config.ts';
import { SqliteEmbeddingStore } from './embeddingStore.ts';
import { IntelligenceError } from './errors.ts';
import { createLiaraSpecialists, readLiaraEnv } from './providers/liara.ts';
import { findRelated, transcribe, whatIsThis, whereTo, type Env, type Item, type Scope, type Section } from './recipes.ts';
import { IntelligenceStore } from './store.ts';
import type { CallLog, EmbeddingStore, Specialists, TranscriptionInput } from './types.ts';

export * from './types.ts';
export { IntelligenceError } from './errors.ts';
export type { Item, Scope, Section } from './recipes.ts';
export { IntelligenceStore } from './store.ts';

/**
 * لایهٔ هوش: محور کناری. فقط می‌خواند؛ هیچ حقیقت، رابطه یا ساختاری نمی‌نویسد (فقط پیشنهاد و واکنش در جدول‌های خودش).
 * بدون `LIARA_BASE_URL` و `LIARA_API_KEY` خاموش است: `enabled === false` و هر فراخوانی `IntelligenceError('disabled')` می‌دهد؛
 * هیچ مسیر دیگری از محصول به آن وابسته نیست.
 */
export interface Intelligence {
  readonly enabled: boolean;
  readonly config: IntelligenceConfig;
  findRelated(input: { scope: Scope; query: string; items: Item[]; excludeIds?: string[]; plan?: PlanId }, recipe?: string): ReturnType<typeof findRelated>;
  whatIsThis(input: { text: string; plan?: PlanId }, recipe?: string): ReturnType<typeof whatIsThis>;
  whereTo(input: { scope: Scope; text: string; sections: Section[]; items: Item[]; itemSection: Record<string, string>; excludeIds?: string[]; plan?: PlanId }, recipe?: string): ReturnType<typeof whereTo>;
  transcribe(input: { audio: Omit<TranscriptionInput, 'language'>; plan?: PlanId }, recipe?: string): ReturnType<typeof transcribe>;
}

export interface CreateOptions {
  cfg?: IntelligenceConfig;
  /** برای آزمون و ارزیابی؛ پیش‌فرض ارائه‌دهندهٔ لیارا از env */
  specialists?: Specialists;
  store?: EmbeddingStore;
  db?: Database.Database;
  log?: CallLog;
  env?: Record<string, string | undefined>;
}

const off = (cfg: IntelligenceConfig): Intelligence => {
  const no = (): never => { throw new IntelligenceError('disabled'); };
  return { enabled: false, config: cfg, findRelated: no, whatIsThis: no, whereTo: no, transcribe: no };
};

export function createIntelligence(opts: CreateOptions = {}): Intelligence {
  const cfg = opts.cfg ?? loadIntelligenceConfig();
  let specialists = opts.specialists;
  if (!specialists) {
    const creds = readLiaraEnv(cfg, opts.env ?? process.env);
    if (!creds) return off(cfg);
    specialists = createLiaraSpecialists(cfg, creds);
  }
  const store = opts.store ?? (opts.db ? new SqliteEmbeddingStore(opts.db) : undefined);
  if (!store) throw new Error('createIntelligence: store یا db لازم است');
  const env: Env = { cfg, specialists, store, call: { log: opts.log ?? consoleCallLog } };
  return {
    enabled: true,
    config: cfg,
    findRelated: (i, recipe = 'findRelated') => findRelated(env, recipe, i),
    whatIsThis: (i, recipe = 'whatIsThis') => whatIsThis(env, recipe, i),
    whereTo: (i, recipe = 'whereTo') => whereTo(env, recipe, i),
    transcribe: (i, recipe = 'transcribe') => transcribe(env, recipe, i),
  };
}

/** ساخت ذخیرهٔ پیشنهاد/واکنش روی پایگاه‌داده */
export const createSuggestionStore = (db: Database.Database): IntelligenceStore => new IntelligenceStore(db);
