import type { IntelligenceErrorInfo, IntelligenceErrorKind, SpecialistKind } from './types.ts';

const MESSAGES: Record<IntelligenceErrorKind, { message: string; retryable: boolean }> = {
  disabled: { message: 'کمک هوشمند فعلاً در دسترس نیست.', retryable: false },
  bad_request: { message: 'درخواست نامعتبر است.', retryable: false },
  input_too_long: { message: 'متن از سقف مدل بلندتر است.', retryable: false },
  auth: { message: 'دسترسی به سرویس هوشمند رد شد.', retryable: false },
  rate_limit: { message: 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کن.', retryable: true },
  timeout: { message: 'پاسخ سرویس به‌موقع نرسید. دوباره تلاش کن.', retryable: true },
  aborted: { message: 'درخواست لغو شد.', retryable: true },
  provider: { message: 'سرویس هوشمند در دسترس نیست. دوباره تلاش کن.', retryable: true },
  bad_output: { message: 'سرویس پاسخ معتبری برنگرداند. دوباره تلاش کن.', retryable: true },
};

/**
 * خطای ساختاریافتهٔ لایهٔ هوش. هیچ‌جا به‌جای آن متن یا نتیجهٔ ساختگی نمی‌آید: یا نتیجهٔ واقعی، یا این خطا.
 * `detail` برای لاگ است (بدنهٔ خطای سرویس، بریده‌شده) و هرگز به کاربر نشان داده نمی‌شود.
 */
export class IntelligenceError extends Error {
  readonly kind: IntelligenceErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly detail?: string;
  readonly specialist?: SpecialistKind;
  readonly modelKey?: string;

  constructor(kind: IntelligenceErrorKind, opts: { message?: string; retryable?: boolean; status?: number; detail?: string; specialist?: SpecialistKind; modelKey?: string } = {}) {
    super(opts.message ?? MESSAGES[kind].message);
    this.name = 'IntelligenceError';
    this.kind = kind;
    this.retryable = opts.retryable ?? MESSAGES[kind].retryable;
    this.status = opts.status;
    this.detail = opts.detail?.slice(0, 500);
    this.specialist = opts.specialist;
    this.modelKey = opts.modelKey;
  }

  toInfo(): IntelligenceErrorInfo {
    return { kind: this.kind, message: this.message, retryable: this.retryable, status: this.status, specialist: this.specialist, modelKey: this.modelKey };
  }

  /** همان خطا با نشانی متخصص (برای لاگ) */
  at(specialist: SpecialistKind, modelKey?: string): IntelligenceError {
    return new IntelligenceError(this.kind, { message: this.message, retryable: this.retryable, status: this.status, detail: this.detail, specialist, modelKey });
  }
}

/** وضعیت HTTP → نوع خطا */
export function kindOfStatus(status: number): IntelligenceErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 400 || status === 404 || status === 413 || status === 422) return 'bad_request';
  return 'provider';
}

export const asIntelligenceError = (e: unknown, fallback: IntelligenceErrorKind = 'provider'): IntelligenceError => {
  if (e instanceof IntelligenceError) return e;
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) return new IntelligenceError(e.name === 'TimeoutError' ? 'timeout' : 'aborted', { detail: e.message });
  return new IntelligenceError(fallback, { detail: e instanceof Error ? e.message : String(e) });
};
