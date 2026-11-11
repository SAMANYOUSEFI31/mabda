/**
 * قرارداد «لایهٔ هوش» (محور کناری؛ docs/architecture.md §۸).
 *
 *  متخصص  = مدل یا قاعده‌ای که یک کار می‌کند، پشت یک رابط قابل تعویض (این فایل)
 *  نقش    = جایی که یک متخصص می‌نشیند: یابنده، مرتب‌کننده، داور
 *  دستورپخت = ترکیب پرتکرار نقش‌ها، تنظیم‌محور (config/recipes.json)
 *  قابلیت = آنچه کاربر می‌بیند؛ هنوز نیست
 *
 * این ماژول فقط می‌خواند و فقط در جدول‌های خودش می‌نویسد (پیشنهاد و واکنش). هیچ حقیقت، رابطه یا ساختاری نمی‌نویسد.
 * `src/core` از آن خبر ندارد.
 */

// ───────────── خطا ─────────────

export type IntelligenceErrorKind =
  | 'disabled'        // کلید یا نشانی تنظیم نشده
  | 'bad_request'     // ورودی نادرست (برنامه‌نویسی یا پیکربندی)
  | 'input_too_long'  // متن از سقف مدل بلندتر است؛ هرگز بی‌صدا بریده نمی‌شود
  | 'auth'            // کلید رد شد
  | 'rate_limit'
  | 'timeout'
  | 'aborted'
  | 'provider'        // سرویس خطا داد یا در دسترس نبود
  | 'bad_output';     // پاسخ با شکل مورد انتظار نخواند

export interface IntelligenceErrorInfo {
  kind: IntelligenceErrorKind;
  message: string;
  retryable: boolean;
  status?: number;
  /** متخصص یا مرحله‌ای که شکست خورد */
  specialist?: SpecialistKind;
  modelKey?: string;
}

// ───────────── اندازه‌گیری فراخوانی ─────────────

export type SpecialistKind = 'lexical' | 'chunker' | 'embedding' | 'rerank' | 'judgment' | 'transcription';

/** آنچه ارائه‌دهنده واقعاً گزارش داد؛ هرچه گزارش نداد خالی می‌ماند (حدس نمی‌زنیم) */
export interface CallUsage {
  /** توکن ورودی از metadata واقعی ارائه‌دهنده */
  inputTokens?: number;
  /** مدت صدا بر حسب ثانیه (گفتار به متن) */
  audioSeconds?: number;
  /** شمار واحدهای درخواست: متن‌ها، سندها یا سؤال‌ها */
  units?: number;
}

export interface CallRecord {
  at: string;
  recipe?: string;
  stage?: string;
  specialist: SpecialistKind;
  modelKey?: string;
  modelId?: string;
  ok: boolean;
  durationMs: number;
  usage: CallUsage;
  /** هزینهٔ تخمینی بر اساس شمارش واقعی و قیمت config؛ نبودن قیمت = undefined (نه صفر) */
  costUsd?: number;
  error?: IntelligenceErrorInfo;
}

/** مقصد لاگ هر فراخوانی. پیش‌فرض: یک خط JSON در console؛ آزمون و اسکریپت ارزیابی جمع می‌کنند. */
export interface CallLog { record(r: CallRecord): void }

/** نتیجهٔ هر ارائه‌دهنده: مقدار + آنچه گزارش شد (لاگ و هزینه را لایهٔ بالا می‌سازد) */
export interface Reported<T> { value: T; usage: CallUsage }

// ───────────── مدل‌ها (از config/models.json؛ نام مدل فقط آنجاست) ─────────────

export interface Pricing {
  unit: 'perMillionTokens' | 'perAudioMinute' | 'perThousandSearches' | 'perMillionQuestions' | 'perRequest';
  amount: number;
  currency: 'USD' | 'IRR' | 'IRT';
  pricedAt: string;
}

export interface ModelEntry {
  key: string;
  kind: 'embedding' | 'rerank' | 'judgment' | 'transcription';
  /** شناسه‌ای که به سرویس فرستاده می‌شود */
  id: string;
  /** سقف توکن ورودی یک متن (embedding) یا یک سند/درخواست */
  maxInputTokens?: number;
  /** سنجش محافظه‌کارانهٔ توکن پیش از فراخوانی؛ با ارزیابی کالیبره می‌شود */
  charsPerToken?: number;
  /** کسری از سقف که تکه‌ها مجازند پر کنند (حاشیهٔ خطای سنجش)؛ پیش‌فرض ۰٫۹ */
  inputSafety?: number;
  dimensions?: number;
  /** گفتار به متن: آیا فیلد `language` فرستاده شود (مستندات لیارا آن را نگفته‌اند؛ پیش‌فرض نه) */
  sendLanguage?: boolean;
  /** پیشوند ورودی برای مدل‌هایی که نقش پرس‌وجو/سند را از متن می‌فهمند */
  inputPrefix?: { query: string; passage: string };
  /** آیا امتیاز بین پرس‌وجوها قابل‌مقایسه است (برای آستانه‌ها)؛ تا اندازه‌گیری نشده false */
  calibratedScore?: boolean;
  /** سقف اندازهٔ هر درخواست */
  limits?: { maxTexts?: number; maxDocuments?: number; maxQuestions?: number; maxAudioSeconds?: number; maxAudioBytes?: number };
  pricing?: Pricing;
  /** یادداشت آزاد (از کجا آمد، تأییدشده یا نه) */
  note?: string;
}

// ───────────── رابط متخصص‌ها ─────────────

export interface CallOptions { signal?: AbortSignal }

export interface EmbeddingProvider {
  readonly model: ModelEntry;
  /** `role`: پرس‌وجو یا سند؛ پیشوند مدل را config تعیین می‌کند. خروجی هم‌ترتیب ورودی. */
  embed(texts: string[], role: 'query' | 'passage', opts?: CallOptions): Promise<Reported<number[][]>>;
}

export interface RerankResult { index: number; score: number }
export interface RerankProvider {
  readonly model: ModelEntry;
  /** بهترین‌ها اول؛ شاخص نسبت به `documents` */
  rerank(query: string, documents: string[], topN?: number, opts?: CallOptions): Promise<Reported<RerankResult[]>>;
}

/**
 * قضاوت نوع‌دار (Jev). حساب نمی‌کند و متن تولید نمی‌کند: از میان گزینه‌های بستهٔ تو یکی را برمی‌گزیند.
 * شکل دقیق درخواست/پاسخ سرویس در docs/intelligence-providers.md است.
 *  choice: یکی از گزینه‌ها. noul: «هیچ‌کدام/نامعلوم» به‌طور صریح. score: عدد در یک بازه.
 */
export type JudgmentQuestion =
  | { id: string; type: 'choice'; instructions: string; criteria: string[] | Array<{ id: string; description: string }> }
  | { id: string; type: 'noul'; instructions: string; criteria: string[] | Array<{ id: string; description: string }> }
  | { id: string; type: 'score'; instructions: string; criteria: string[] | Array<{ id: string; description: string }> };

export interface JudgmentAnswer {
  id: string;
  /** برای choice/noul: شناسهٔ گزینهٔ برگزیده؛ برای مبهم/هیچ‌کدام: null */
  choice: string | null;
  /** احتمال هر گزینه (اگر سرویس بدهد) */
  probabilities?: Record<string, number>;
  /** اطمینان در [0,1]: احتمال گزینهٔ برگزیده (اگر سرویس بدهد) */
  confidence?: number;
  /** برای score */
  score?: number;
  /** پاسخ خام سرویس برای ارزیابی (هرگز به کاربر نشان داده نمی‌شود) */
  raw?: unknown;
}

export interface JudgmentProvider {
  readonly model: ModelEntry;
  /** `state`: وضعیت (متن/پرونده‌ای که داور دربارهٔ آن قضاوت می‌کند)؛ چند سؤال در یک درخواست مجاز است */
  decide(state: string, questions: JudgmentQuestion[], opts?: CallOptions): Promise<Reported<JudgmentAnswer[]>>;
}

export interface TranscriptionInput {
  data: Uint8Array;
  fileName: string;
  mimeType: string;
  /** مثلاً 'fa' */
  language?: string;
}
export interface TranscriptionProvider {
  readonly model: ModelEntry;
  transcribe(input: TranscriptionInput, opts?: CallOptions): Promise<Reported<{ text: string }>>;
}

/** همهٔ متخصص‌های مدل‌دار؛ هر کدام با کلید مستعار config برگزیده می‌شود */
export interface Specialists {
  embedding(modelKey: string): EmbeddingProvider;
  rerank(modelKey: string): RerankProvider;
  judgment(modelKey: string): JudgmentProvider;
  transcription(modelKey: string): TranscriptionProvider;
}

// ───────────── نگه‌داری embedding ─────────────

export interface EmbeddingKey {
  workspaceId: string;
  userId: string;
  /** نوع و شناسهٔ چیزی که متنش embed شده (thought | object | note | file …) */
  itemKind: string;
  itemId: string;
  chunkIndex: number;
  /** هش متن پس از نرمال‌سازی + نسخهٔ تکه‌کننده؛ با تغییر متن، بردار قدیمی دیگر خوانده نمی‌شود */
  textHash: string;
  modelKey: string;
}

export interface EmbeddingStore {
  getMany(keys: EmbeddingKey[]): Promise<Map<string, Float32Array>>;
  putMany(rows: Array<{ key: EmbeddingKey; vector: Float32Array }>): Promise<void>;
  /** برای همهٔ بردارهای یک چیز که هش دیگری دارند؛ پاک‌سازی بردار کهنه */
  dropStale(workspaceId: string, userId: string, itemKind: string, itemId: string, modelKey: string, keepHashes: string[]): Promise<number>;
}

export const embeddingKeyId = (k: EmbeddingKey): string =>
  `${k.workspaceId}\u0000${k.userId}\u0000${k.itemKind}\u0000${k.itemId}\u0000${k.chunkIndex}\u0000${k.textHash}\u0000${k.modelKey}`;
