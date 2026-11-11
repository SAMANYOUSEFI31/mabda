import { asIntelligenceError } from './errors.ts';
import type { CallLog, CallRecord, CallUsage, ModelEntry, Pricing, Reported, SpecialistKind } from './types.ts';

/** پیش‌فرض: یک خط JSON برای هر فراخوانی (مدت، توکن یا ثانیه، خطا). متن کاربر هرگز در لاگ نیست. */
export const consoleCallLog: CallLog = {
  record(r) { console.log(`[intelligence] ${JSON.stringify(r)}`); },
};

export const silentCallLog: CallLog = { record() {} };

/** جمع‌آوری در حافظه (آزمون و ارزیابی) */
export class MemoryCallLog implements CallLog {
  readonly records: CallRecord[] = [];
  record(r: CallRecord): void { this.records.push(r); }
}

/** هزینه بر اساس شمارش واقعی؛ نبود قیمت یا نبود شمارش واقعی = undefined (نه صفر و نه حدس) */
export function costOf(pricing: Pricing | undefined, usage: CallUsage): number | undefined {
  if (!pricing || pricing.currency !== 'USD') return undefined;
  switch (pricing.unit) {
    case 'perMillionTokens': return usage.inputTokens === undefined ? undefined : (usage.inputTokens * pricing.amount) / 1e6;
    case 'perAudioMinute': return usage.audioSeconds === undefined ? undefined : (usage.audioSeconds / 60) * pricing.amount;
    case 'perThousandSearches': return usage.units === undefined ? undefined : (usage.units * pricing.amount) / 1e3;
    case 'perMillionQuestions': return usage.units === undefined ? undefined : (usage.units * pricing.amount) / 1e6;
    case 'perRequest': return pricing.amount;
  }
}

export interface CallContext { log: CallLog; recipe?: string; stage?: string; now?: () => Date }

/** اجرای یک فراخوانی متخصص با ثبت مدت، مصرف و خطا. خطا همیشه به‌صورت `IntelligenceError` بالا می‌رود. */
export async function instrument<T>(ctx: CallContext, specialist: SpecialistKind, model: ModelEntry | undefined, run: () => Promise<Reported<T>>): Promise<Reported<T>> {
  const t0 = Date.now();
  const base = { at: (ctx.now?.() ?? new Date()).toISOString(), recipe: ctx.recipe, stage: ctx.stage, specialist, modelKey: model?.key, modelId: model?.id };
  try {
    const out = await run();
    ctx.log.record({ ...base, ok: true, durationMs: Date.now() - t0, usage: out.usage, costUsd: costOf(model?.pricing, out.usage) });
    return out;
  } catch (e) {
    const err = asIntelligenceError(e).at(specialist, model?.key);
    ctx.log.record({ ...base, ok: false, durationMs: Date.now() - t0, usage: {}, error: err.toInfo() });
    throw err;
  }
}
