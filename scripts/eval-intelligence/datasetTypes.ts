/**
 * شکل فایل داده‌ی آزمون کیفیت فارسی (`dataset.json`). قرارداد مشترک بین سازندهٔ داده و اسکریپت آزمون.
 * فقط نوع است؛ هیچ منطقی ندارد. هر دسته‌ی داده یک «سنجه» دارد (در `run.ts`).
 *
 * قاعده‌ها:
 *  - همهٔ متن‌ها فارسی طبیعی‌اند، مگر برچسب `mixed_lang` (فارسی + انگلیسی). هیچ متنی نباید خروجی یک مدل باشد.
 *  - شناسه‌ها یکتا و پایدارند (با پیشوند دسته)؛ شناسهٔ بخش‌ها همان شناسه‌های درخت نمونهٔ قهوه‌اند (`src/core/specs.ts`، `demoData.ts`).
 *  - هر مورد می‌تواند `tags` داشته باشد تا نتیجه به‌تفکیک «متن سخت» گزارش شود.
 */

/** نوع فکر در کد: `ThoughtKind` در `src/core/thinkingMarkers.ts` */
export type ThoughtKindId = 'idea' | 'question' | 'assumption' | 'open_decision';
/** نوع دانش در کد: `ContextType` در `src/types/index.ts` */
export type KnowledgeTypeId = 'Fact' | 'Decision' | 'Constraint';

/** برچسب‌های متن سخت. `long` یعنی بیش از ۵۱۲ توکن E5 (تخمین محافظه‌کارانه: بیش از ~۱۲۰۰ نویسهٔ فارسی). */
export type HardTag = 'long' | 'unordered' | 'no_headings' | 'multi_topic' | 'mixed_lang' | 'names_numbers';

export interface TaggedItem { id: string; tags?: HardTag[] }

/** بخش‌های درخت (نمونهٔ قهوه) */
export interface DatasetSection { id: string; label: string; description: string; parentId: string | null }

/** چیزی که می‌شود پیدایش کرد (فکر، دانش یا یادداشت). یابنده روی این مجموعه جست‌وجو می‌کند. */
export interface CorpusItem {
  id: string;
  kind: 'thought' | 'knowledge' | 'note';
  nodeId: string;
  text: string;
  /** عنوان کوتاه برای دانش */
  title?: string;
  thoughtKind?: ThoughtKindId;
  knowledgeType?: KnowledgeTypeId;
}

/** نوع فکر درست برای یک متن */
export interface ThoughtKindCase extends TaggedItem { text: string; expected: ThoughtKindId }
/** نوع دانش درست برای یک متن */
export interface KnowledgeTypeCase extends TaggedItem { text: string; expected: KnowledgeTypeId }
/** قطعی یا با تردید: «فکر (با تردید)» یا «ادعای قطعی (دانش)» */
export interface CertaintyCase extends TaggedItem { text: string; expected: 'certain' | 'uncertain' }
/**
 * بخش درست.
 * `expectedNodeIds`: همهٔ بخش‌هایی که متن درست به آن‌ها مربوط است (برای کارت چندموضوعی بیش از یکی).
 * `expectNone`: متن به هیچ بخش موجود مربوط نیست → پاسخ درست «هیچ‌کدام» است.
 * `acceptableNodeIds`: جاهای قابل‌قبول ولی نه بهترین (مثلاً والد بخش درست).
 */
export interface PlacementCase extends TaggedItem {
  text: string;
  expectedNodeIds: string[];
  acceptableNodeIds?: string[];
  expectNone?: boolean;
}
/** «مرتبط‌ها را پیدا کن»: پرس‌وجو یک متن است؛ مرتبط‌ها شناسهٔ موردهای corpus با درجه (۲ = قوی، ۱ = ضعیف) */
export interface RelatedCase extends TaggedItem {
  query: string;
  /** اگر پرس‌وجو خودش یک مورد corpus است، آن مورد از نتیجه کنار گذاشته می‌شود */
  queryCorpusId?: string;
  relevant: Array<{ id: string; grade: 1 | 2 }>;
  /** هم‌موضوع ولی نامرتبط‌به‌معنای پیوند؛ اتصال به این‌ها «اتصال غلط» حساب می‌شود */
  hardNegativeIds?: string[];
}
export type DuplicateLabel = 'duplicate' | 'near_duplicate' | 'same_topic_different' | 'unrelated';
export interface DuplicateCase extends TaggedItem { a: string; b: string; label: DuplicateLabel }
/** تناقض با خط قرمز: `statement` با `redline` در تناقض است یا سازگار */
export interface ContradictionCase extends TaggedItem {
  redline: { id: string; text: string };
  statement: string;
  label: 'contradicts' | 'consistent';
}

export interface Dataset {
  version: number;
  description: string;
  sections: DatasetSection[];
  corpus: CorpusItem[];
  tasks: {
    thoughtKind: ThoughtKindCase[];
    knowledgeType: KnowledgeTypeCase[];
    certainty: CertaintyCase[];
    placement: PlacementCase[];
    related: RelatedCase[];
    duplicates: DuplicateCase[];
    contradictions: ContradictionCase[];
  };
  /** بخش خالی برای نمونه‌های واقعی کسب‌وکار خودِ کاربر؛ همین شکل `tasks` و `corpus` را می‌گیرد */
  userSection: {
    _help: string;
    sections: DatasetSection[];
    corpus: CorpusItem[];
    tasks: Partial<Dataset['tasks']>;
  };
}
