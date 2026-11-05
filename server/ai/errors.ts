import type { AiErrorInfo, AiErrorKind, StageName } from '../../src/types/ai.ts';

const MESSAGES: Record<AiErrorKind, { message: string; retryable: boolean }> = {
  disabled: { message: 'هوش مصنوعی فعلاً در دسترس نیست. بعداً دوباره تلاش کن.', retryable: false },
  quota: { message: 'سهمیهٔ هوش مصنوعی فعلاً در دسترس نیست. بعداً دوباره تلاش کن.', retryable: true },
  rate_limit: { message: 'تعداد درخواست‌ها زیاد است. چند ثانیه صبر کن و دوباره تلاش کن.', retryable: true },
  timeout: { message: 'پاسخ مدل به‌موقع نرسید. دوباره تلاش کن.', retryable: true },
  aborted: { message: 'درخواست لغو شد.', retryable: true },
  bad_output: { message: 'مدل پاسخ معتبری برنگرداند. دوباره تلاش کن.', retryable: true },
  provider: { message: 'سرویس مدل در دسترس نیست. دوباره تلاش کن.', retryable: true },
  bad_request: { message: 'درخواست نامعتبر است.', retryable: false },
};

/** Structured, user-presentable failure. Nothing in the AI layer ever substitutes canned content for one of these. */
export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly retryable: boolean;
  readonly stage?: StageName;
  readonly status?: number;
  readonly detail?: string;

  constructor(kind: AiErrorKind, opts: { message?: string; retryable?: boolean; stage?: StageName; status?: number; detail?: string } = {}) {
    const base = MESSAGES[kind];
    super(opts.message ?? base.message);
    this.name = 'AiError';
    this.kind = kind;
    this.retryable = opts.retryable ?? base.retryable;
    this.stage = opts.stage;
    this.status = opts.status;
    this.detail = opts.detail;
  }

  toInfo(): AiErrorInfo {
    return { kind: this.kind, message: this.message, retryable: this.retryable, stage: this.stage };
  }

  withStage(stage: StageName): AiError {
    return new AiError(this.kind, { message: this.message, retryable: this.retryable, stage, status: this.status, detail: this.detail });
  }
}

/** Map anything a provider SDK throws to an AiError (HTTP status / abort / timeout). */
export function toAiError(err: unknown, stage?: StageName): AiError {
  if (err instanceof AiError) return stage && !err.stage ? err.withStage(stage) : err;
  const e = err as { name?: string; status?: number; code?: number | string; message?: string };
  const status = typeof e?.status === 'number' ? e.status : typeof e?.code === 'number' ? e.code : undefined;
  const msg = String(e?.message ?? '');
  if (e?.name === 'AbortError' || /aborted|abort/i.test(msg)) return new AiError('aborted', { stage, detail: msg });
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|permission denied/i.test(msg)) return new AiError('provider', { stage, status, detail: msg });
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    const quota = /quota|RESOURCE_EXHAUSTED/i.test(msg) && !/rate/i.test(msg);
    return new AiError(quota ? 'quota' : 'rate_limit', { stage, status, detail: msg });
  }
  if (status === 400) return new AiError('bad_request', { stage, status, detail: msg, message: 'درخواست به مدل نامعتبر بود.', retryable: false });
  if (status && status >= 500) return new AiError('provider', { stage, status, detail: msg });
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|network/i.test(msg)) return new AiError('provider', { stage, detail: msg });
  return new AiError('provider', { stage, status, detail: msg });
}
