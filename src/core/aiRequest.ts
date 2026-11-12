/**
 * «درخواست برای AI»: the user picks a KIND of work and writes one line; Mabda assembles the prompt.
 *
 * Order follows Anthropic's guidance for long inputs: the data first (labelled, with id@version and origin), then the
 * rules of this kind of work, then the user's request at the very end, then the answer template (the same headings
 * the import dialog reads, so the answer can come back in). Pure and deterministic: same input → same text.
 *
 * What goes into the data (docs/spine.md):
 *  • always: Constraints in force and Decisions that reach everywhere (`reach: global`)
 *  • the rest: ranked with BM25 (retrieval.ts) over the request, the scope node and the facets, until the budget is full
 *  • never: samples, Proposed / Needs Review as fact, expired or overridden objects, objects outside the scope
 *  • assumptions travel apart, in their own section with the rule; rejected options are listed so they are not proposed again
 * Every object that was left out comes back with its reason, and the user can add it by hand.
 */

import type { ContextChange, ContextObject, ContextRelationship, GapItem, Measurement, Metric, ThoughtKind, TreeNode, UsedContextRef, WorkstreamSpec } from '../types';
import { isActiveContext } from './contextStatus';
import { ASSUMPTION_RULE, REJECTED_RULE, isAssumption, rejectedOptions } from './assumptions';
import { exampleLines } from './redlineExamples';
import { calculateReadinessAndGaps } from './contextEngine';
import type { AmbiguityMap } from './contextEngine';
import { IN_FORCE, reachOf } from './effectiveContext';
import { fromText, leftWhy, scopeSeeds, standingOver } from './packScope';
import { metricsPackSection } from './metrics';
import { ancestorIds, subtreeIds } from './nodeTree';
import type { Explain, ExplainItem, ExplainSkipped } from './scopeExplain';
import { bm25Rank } from './retrieval';
import { estimateTokens } from './tokens';

export type RequestKind = 'question' | 'audit' | 'draft' | 'decision' | 'change_review' | 'free';

export const REQUEST_KINDS: ReadonlyArray<{ kind: RequestKind; label: string; hint: string; example: string }> = [
  { kind: 'question', label: 'سؤال', hint: 'فقط از دانش تأییدشده جواب می‌گیری؛ نبود پاسخ هم گفته می‌شود.', example: 'مخاطب اصلی ما کیست؟' },
  { kind: 'audit', label: 'ممیزی', hint: 'ایدهٔ تو را با خط قرمزها، فرض‌ها و جاهای خالی می‌سنجد.', example: 'این طرح قیمت‌گذاری با خط قرمزهای ما جور است؟' },
  { kind: 'draft', label: 'پیش‌نویس', hint: 'متنی می‌نویسد که به اصول و لحن ثبت‌شده وفادار است.', example: 'متن کوتاه معرفی محصول برای صفحهٔ فرود' },
  { kind: 'decision', label: 'تصمیم', hint: 'گزینه‌ها را می‌سنجد و گزینه‌های ردشده را دوباره پیشنهاد نمی‌دهد.', example: 'کانال اصلی جذب مشتری را کدام بگیریم؟' },
  { kind: 'change_review', label: 'بازبینی تغییر', hint: 'تغییرهای اخیر را (قبل و بعد) با بقیهٔ دانش می‌سنجد.', example: 'تغییرهای این ماه با تصمیم‌های قبلی تناقض دارند؟' },
  { kind: 'free', label: 'آزاد', hint: 'درخواست هر چه هست؛ فقط قواعد کلی درستی داده‌ها رعایت می‌شود.', example: 'یک جمع‌بندی یک‌صفحه‌ای از وضع فعلی بنویس' },
];
export const KIND_LABEL: Record<RequestKind, string> = Object.fromEntries(REQUEST_KINDS.map((k) => [k.kind, k.label])) as Record<RequestKind, string>;
export const isRequestKind = (v: unknown): v is RequestKind => REQUEST_KINDS.some((k) => k.kind === v);

/** rules every kind shares */
export const COMMON_RULES: readonly string[] = [
  'فقط از اسناد بالا کار کن. چیزی را از خودت اختراع نکن و واقعیتی را فرض نگیر که در اسناد نیست.',
  'هر ادعا را با شناسهٔ سند (مثل `fct_1@v2`) منبع بده.',
  'هر چه برای ادامه لازم داری و در اسناد نیست را زیر `## Question:` بپرس.',
];

/** the rules of each kind of work (also in docs/ai-architecture.md → «درخواست برای AI») */
export const KIND_RULES: Record<RequestKind, readonly string[]> = {
  question: [
    'فقط از «واقعیت‌های تأییدشده» جواب بده. فرض‌ها و پیشنهادها پایهٔ پاسخ نیستند.',
    'اگر پاسخ در اسناد نیست، دقیقاً بنویس «نمی‌دانم» و زیرش بگو چه چیزی کم است؛ حدس نزن.',
    'پاسخ کوتاه و مستقیم باشد و فقط به همان سؤال بپردازد.',
  ],
  audit: [
    'طرح یا ایدهٔ درخواست را یکی‌یکی با «خط قرمزها» بسنج و هر خط قرمز را «رعایت شده / نقض شده / نامشخص» اعلام کن.',
    'فرض‌هایی را که طرح به آن‌ها تکیه دارد جدا فهرست کن و بگو بر پایهٔ فرض است، نه واقعیت.',
    'جاهای خالیِ فهرست‌شده را با طرح بسنج: کدام نبودِ اطلاعات خطر دارد؟ آن‌ها را به پرسش تبدیل کن.',
    'تناقض با تصمیم‌های ثبت‌شده را اگر هست نام ببر. جمع‌بندی: آمادهٔ اجرا، نیازمند اصلاح یا ناکافی.',
  ],
  draft: [
    'متن را بر پایهٔ اصول و لحنی بنویس که در اسناد ثبت شده؛ خط قرمزها را نقض نکن.',
    'هر جایی که اطلاعات لازم در اسناد نیست، به‌جای حدس زدن علامت `[نیاز به اطلاعات: …]` بگذار.',
    'گزینه‌های ردشده را دوباره به متن نیاور. هرجا به فرض تکیه کردی، صریح بنویس «بر پایهٔ فرض …».',
    'متن کامل را زیر `## Asset:` بده.',
  ],
  decision: [
    'گزینه‌ها را با معیارهایی بسنج که از خط قرمزها و تصمیم‌های ثبت‌شده می‌آیند؛ معیار تازه اگر آوردی بگو از کجاست.',
    'گزینه‌های ردشده را دوباره پیشنهاد نده، مگر دلیل رد آن‌ها دیگر برقرار نباشد؛ آن‌وقت دلیل را صریح بگو.',
    'هر فرض را که توصیه به آن تکیه دارد جدا نام ببر و بگو چه چیزی آن را تأیید یا رد می‌کند.',
    'در پایان یک توصیه، خطرهای آن و آنچه باید پیش از اجرا بررسی شود را بنویس؛ توصیه را زیر `## Decision:` بگذار (فقط پیشنهاد است، کاربر تأیید می‌کند).',
  ],
  change_review: [
    'برای هر تغییر فهرست‌شده بگو چه عوض شد (قبل ← بعد) و چه چیزی در اسناد با آن درگیر است.',
    'تناقض تازه، تصمیم یا خط قرمزی که دیگر نمی‌خواند و چیزهایی که باید دوباره بازبینی شوند را نام ببر.',
    'دربارهٔ اثر تغییر فقط از اسناد استناد کن؛ از ترتیب زمانی علت و معلول نتیجه نگیر.',
  ],
  free: [
    'اگر کار نیازمند دانشی است که در اسناد نیست، به‌جای حدس آن را بپرس.',
  ],
};

export const QUOTES_RULE = 'پیش از پاسخ، جمله‌های مرتبط با درخواست را از اسناد بالا کلمه‌به‌کلمه نقل کن (هر کدام با شناسهٔ سندش)، بعد فقط بر پایهٔ همان‌ها جواب بده. این نقل‌قول‌ها را زیر عنوان «نقل‌قول‌ها» و پیش از اولین سرتیتر `##` بنویس.';

/** above this many tokens of data the text counts as long and the quotes rule is added */
export const LONG_TEXT_TOKENS = 1500;
export const DEFAULT_TOKEN_BUDGET = 4000;
export const MIN_TOKEN_BUDGET = 500;
export const MAX_TOKEN_BUDGET = 60000;
export const REQUEST_MAX_CHARS = 2000;
const CHANGE_LIMIT = 10;
const CHANGE_WINDOW_DAYS = 30;
const GAP_LIMIT = 12;

/** the answer template: the same headings ImportAnswerDialog reads (answerParser.ts) */
export const AI_RESPONSE_FORMAT = [
  '## قالب پاسخ (الزامی)',
  'پاسخ را با این سرتیترهای سطح دو بده (هر کدام را فقط اگر چیزی برایش داری)؛ بیرون از آن‌ها فقط بخش «نقل‌قول‌ها» مجاز است اگر خواسته شده:',
  '',
  'اگر یک مورد به‌روزرسانی یکی از دانش‌های بالاست، اولین خطِ متنش را «Ref: شناسه@نسخه» بنویس؛ شناسه را عیناً از اسناد بردار و هرگز نساز. اگر می‌دانی کجای ساختار می‌نشیند، خط بعدی را «Section: مسیر بخش» بنویس. اگر مطمئن نیستی، هیچ‌کدام را ننویس.',
  '```',
  '## Asset: عنوان پاسخ یا خروجی',
  'متن کامل پاسخ به Markdown',
  '',
  '## Decision: عنوان کوتاه',
  'تصمیمی که کاربر گرفته یا پیشنهاد می‌کنی (یک تا سه جمله)',
  '',
  '## Fact: عنوان کوتاه',
  'واقعیتی که از کاربر شنیدی و در اسناد نبود',
  '',
  '## Constraint: عنوان کوتاه',
  'مرز یا خط قرمزی که کشف کردی',
  '',
  '## Question: سؤال',
  'هر چیزی که برای ادامه لازم داری و در اسناد نیست',
  '```',
].join('\n');

export type IncludeReason = 'constraint' | 'global_decision' | 'rank' | 'small' | 'manual' | 'changed';
export type ExcludeReason = 'scope' | 'child' | 'expired' | 'overridden' | 'unconfirmed' | 'sample' | 'kind' | 'budget' | 'unranked';

export const INCLUDE_REASON_FA: Record<IncludeReason, string> = {
  constraint: 'خط قرمز مؤثر؛ همیشه می‌آید',
  global_decision: 'تصمیم با دامنهٔ کل؛ همیشه می‌آید',
  rank: 'رتبهٔ مرتبط با درخواست',
  small: 'فضا کوچک است؛ همه جا شد',
  manual: 'افزودهٔ دستی',
  changed: 'در تغییر اخیر بوده',
};
export const EXCLUDE_REASON_FA: Record<ExcludeReason, string> = {
  scope: 'خارج از دامنه',
  child: 'زیربخش انتخاب‌نشده',
  expired: 'قدیمی شده',
  overridden: 'در این بخش اعمال نمی‌شود',
  unconfirmed: 'تأییدنشده (واقعیت نیست)',
  sample: 'نمونه است',
  kind: 'برای این نوع کار نمی‌آید',
  budget: 'بودجه پر شد',
  unranked: 'به درخواست ربطی پیدا نشد',
};
/** a skipped object the user may still add by hand */
const ADDABLE: ReadonlySet<ExcludeReason> = new Set<ExcludeReason>(['scope', 'child', 'budget', 'unranked']);

export interface IncludedItem { id: string; version: number; type: ContextObject['type']; title: string; nodeLabel: string; reason: IncludeReason; tokens: number; assumption: boolean; /** «از "برند"، همه‌جا» — where it was written and why it reaches this scope */ from: string }
export interface ExcludedItem { id: string; type: ContextObject['type']; title: string; nodeLabel: string; reason: ExcludeReason; tokens: number; canAdd: boolean; /** the reason as a sentence that names the node / the exception */ why: string }

export interface AiRequestInput {
  kind: RequestKind;
  /** the user's one line */
  request: string;
  /** the node the work is about (default: the whole tree) */
  scopeNodeId?: string;
  /** several sections (src/core/packScope.ts); `scopeNodeId` is the same thing for one */
  scopeNodeIds?: string[];
  /** the sub-sections of the picked sections are read too (default: no) */
  withChildren?: boolean;
  /** tokens for the data blocks (always-included items may exceed it; `overBudget` says so) */
  tokenBudget?: number;
  workspaceName: string;
  nodes: TreeNode[];
  /** the workspace's objects as the repo gives them (samples are not there; if one slips in it is left out) */
  objects: ContextObject[];
  relationships?: ContextRelationship[];
  changes?: Array<Pick<ContextChange, 'objectId' | 'fromVersion' | 'toVersion' | 'kind' | 'actor' | 'at' | 'before' | 'after'>>;
  metrics?: { metrics: Metric[]; measurements: Measurement[]; changes: Pick<ContextChange, 'objectId' | 'kind' | 'at' | 'after'>[] };
  /** audit: the gaps to weigh the work against (see `gapsInScope`) */
  gaps?: Array<Pick<GapItem, 'label' | 'status' | 'question' | 'importance'>>;
  /** objects the user added by hand from the «left out» list */
  extraIds?: string[];
  /** explicitly selected, open Thoughts; separate from Truth documents */
  thoughts?: Array<{ id: string; kind: ThoughtKind | null; text: string; nodeId: string }>;
  /** change_review: only this object's changes */
  focusObjectId?: string;
  /** the id for the import link; absent = no marker line */
  packId?: string;
  now?: Date;
}

export interface AiRequestResult {
  kind: RequestKind;
  markdown: string;
  tokens: number;
  chars: number;
  /** tokens of the data blocks only */
  dataTokens: number;
  tokenBudget: number;
  overBudget: boolean;
  /** the data is long enough that the «quotes first» rule was added */
  longText: boolean;
  included: IncludedItem[];
  excluded: ExcludedItem[];
  /** the scope that was read (the sections picked, with or without their sub-sections) */
  scope: Explain['scope'];
  refs: UsedContextRef[];
  counts: { facts: number; assumptions: number; constraints: number; decisions: number; rejected: number; changes: number; gaps: number; metrics: number; thoughts: number };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** a user's text must not be able to close our tags */
const safe = (s: string) => s.replace(/<(\/?)(document|documents|data)\b/gi, '‹$1$2');
const SOURCE_FA: Record<ContextObject['provenance'], string> = { Onboarding: 'راه‌اندازی اولیه', 'User Input': 'ورودی کاربر', 'AI Suggested': 'پیشنهاد AI (تأییدشده)', 'Asset Derived': 'برگرفته از دارایی', Imported: 'واردشده' };

/** `fct_1@v2` */
export const refOf = (o: Pick<ContextObject, 'id' | 'version'>) => `${o.id}@v${o.version}`;

export function clampBudget(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_TOKEN_BUDGET;
  return Math.min(MAX_TOKEN_BUDGET, Math.max(MIN_TOKEN_BUDGET, Math.round(n)));
}

/** the gaps of the enabled workstreams that fall inside a node's sub-tree (or anywhere when no node) — for the audit */
export function gapsInScope(specs: WorkstreamSpec[], objects: ContextObject[], nodes: TreeNode[], scopeNodeId: string | string[] | undefined, judgments: AmbiguityMap = {}): Array<Pick<GapItem, 'label' | 'status' | 'question' | 'importance'>> {
  const picked = Array.isArray(scopeNodeId) ? scopeNodeId : scopeNodeId ? [scopeNodeId] : [];
  const inside = picked.length ? new Set(picked.flatMap((id) => subtreeIds(nodes, id))) : null;
  const seen = new Set<string>();
  const out: Array<Pick<GapItem, 'label' | 'status' | 'question' | 'importance'>> = [];
  for (const spec of specs) {
    for (const g of calculateReadinessAndGaps(spec, objects, [], judgments).gaps) {
      if (g.status === 'confirmed' || g.importance === 'optional') continue;
      if (inside && !inside.has(g.nodeId)) continue;
      const key = `${g.nodeId}|${g.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label: g.label, status: g.status, question: g.question, importance: g.importance });
    }
  }
  return out
    .sort((a, b) => Number(b.importance === 'required') - Number(a.importance === 'required') || a.label.localeCompare(b.label))
    .slice(0, GAP_LIMIT);
}

export function buildAiRequest(input: AiRequestInput): AiRequestResult {
  const { kind, nodes } = input;
  const now = input.now ?? new Date();
  const request = input.request.trim().slice(0, REQUEST_MAX_CHARS);
  const budget = clampBudget(input.tokenBudget);
  const selectedThoughts = input.thoughts ?? [];
  const rels = input.relationships ?? [];
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const path = (id: string) => ancestorIds(nodes, id).reverse().map(labelOf).join(' ‹ ');

  // 1) where does each live object stand at the scope? (whole tree = the best standing over every node) — src/core/packScope.ts
  const scope = scopeSeeds(nodes, [...(input.scopeNodeIds ?? []), ...(input.scopeNodeId ? [input.scopeNodeId] : [])], !!input.withChildren);
  const scopeNode = scope.picked.length === 1 ? nodes.find((n) => n.id === scope.picked[0]) : undefined;
  const scopeName = scope.whole ? 'کل درخت' : scope.picked.map(path).join(' + ');
  const standing = standingOver(scope, input.objects, nodes, rels, now);

  const live = input.objects.filter(isActiveContext);
  const excluded: ExcludedItem[] = [];
  const itemTokens = (o: ContextObject) => estimateTokens(renderDoc(o, path(o.nodeId)));
  const inPickedSub = (o: ContextObject) => scope.picked.some((p) => p !== o.nodeId && subtreeIds(nodes, p).includes(o.nodeId));
  const whyOf = (o: ContextObject, reason: ExcludeReason): string => {
    if (reason === 'scope' || reason === 'child' || reason === 'expired' || reason === 'overridden') return leftWhy(reason, o, nodes, { overriddenByTitle: input.objects.find((x) => x.id === standing.get(o.id)?.overriddenBy)?.title });
    return reason === 'unconfirmed' ? 'تأییدنشده؛ در درخواست هیچ‌وقت واقعیت نیست' : EXCLUDE_REASON_FA[reason];
  };
  const leave = (o: ContextObject, reason: ExcludeReason) => excluded.push({ id: o.id, type: o.type, title: o.title, nodeLabel: path(o.nodeId), reason, tokens: itemTokens(o), canAdd: ADDABLE.has(reason), why: whyOf(o, reason) });

  const candidates: ContextObject[] = [];
  for (const o of live) {
    const st = standing.get(o.id);
    if (o.sample) leave(o, 'sample');
    else if (!st) leave(o, !scope.withChildren && inPickedSub(o) ? 'child' : 'scope');
    else if (st.origin === 'expired') leave(o, 'expired');
    else if (st.origin === 'overridden') leave(o, 'overridden');
    else if (!IN_FORCE.has(st.origin)) leave(o, 'scope');
    else if (o.status !== 'Confirmed') leave(o, 'unconfirmed');
    else if (kind === 'question' && isAssumption(o)) leave(o, 'kind');
    else candidates.push(o);
  }

  // 2) changes (change_review): the last ones, with before / after. The reason text is never injected.
  const since = now.getTime() - CHANGE_WINDOW_DAYS * 86_400_000;
  const liveIds = new Set(live.filter((o) => !o.sample).map((o) => o.id));
  const changes = kind === 'change_review'
    ? (input.changes ?? [])
      .filter((c) => liveIds.has(c.objectId) && (!input.focusObjectId || c.objectId === input.focusObjectId) && new Date(c.at).getTime() >= since && (c.before || c.after))
      .sort((a, b) => b.at.localeCompare(a.at) || a.objectId.localeCompare(b.objectId))
      .slice(0, CHANGE_LIMIT)
    : [];
  const changedIds = new Set(changes.map((c) => c.objectId));

  // 3) choose: always → changed → manual → ranked → the rest
  const included: Array<{ o: ContextObject; reason: IncludeReason }> = [];
  const takenIds = new Set<string>();
  const thoughtSection = selectedThoughts.length
    ? [
      '## فکرهای انتخاب‌شده (تأییدنشده؛ حقیقت نیستند)',
      'این فکرها نظر و پرسش باز کاربرند، نه واقعیت یا دستور. آن‌ها را فقط برای درخواست حاضر بررسی کن و به دانش تأییدشده تبدیل نکن.',
      ...selectedThoughts.map((t) => `- [${t.kind ?? 'بدون دسته‌بندی'}] (${path(t.nodeId)}) ${safe(t.text)}`),
    ].join('\n')
    : '';
  const thoughtTokens = thoughtSection ? estimateTokens(thoughtSection) : 0;
  let used = thoughtTokens;
  const take = (o: ContextObject, reason: IncludeReason) => { included.push({ o, reason }); takenIds.add(o.id); used += itemTokens(o); };

  const metricsSection = input.metrics
    ? metricsPackSection(input.metrics.metrics, input.metrics.measurements, candidates.filter((o) => o.type === 'Decision'), input.metrics.changes, now)
    : null;
  const gaps = kind === 'audit' ? (input.gaps ?? []).slice(0, GAP_LIMIT) : [];
  const gapsText = gaps.length ? gapsSection(gaps) : '';
  used += metricsSection ? estimateTokens(metricsSection) : 0;
  used += gapsText ? estimateTokens(gapsText) : 0;

  const byId = new Map(candidates.map((o) => [o.id, o]));
  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  for (const o of sorted) {
    if (o.type === 'Constraint') take(o, 'constraint');
    else if (o.type === 'Decision' && reachOf(o) === 'global') take(o, 'global_decision');
  }
  for (const id of [...changedIds].sort()) { const o = byId.get(id); if (o && !takenIds.has(id)) take(o, 'changed'); }
  const extra = new Set(input.extraIds ?? []);
  const wasLeft = new Map(excluded.map((e) => [e.id, e]));
  for (const id of [...extra].sort()) {
    if (takenIds.has(id)) continue;
    const cand = byId.get(id);
    if (cand) { take(cand, 'manual'); continue; } // would have been ranked: the user's choice wins
    const o = live.find((x) => x.id === id);
    const left = wasLeft.get(id);
    if (o && left?.canAdd) { take(o, 'manual'); excluded.splice(excluded.indexOf(left), 1); }
  }

  const rest = candidates.filter((o) => !takenIds.has(o.id));
  const docText = (o: ContextObject) => `${o.title}\n${o.content}\n${(o.facets ?? []).join(' ')}\n${path(o.nodeId)}\n${o.record?.question ?? ''}`;
  const query = `${request} ${scope.picked.map(labelOf).join(' ')}`;
  const ranked = bm25Rank(query, rest.map((o) => ({ o, text: docText(o) })));
  // an object of the scope node itself wins a tie; then a stable order
  const ownOf = (o: ContextObject) => (standing.get(o.id)?.own ? 0 : 1);
  ranked.sort((a, b) => b.score - a.score || ownOf(a.chunk.o) - ownOf(b.chunk.o) || a.chunk.o.id.localeCompare(b.chunk.o.id));
  const scoredIds = new Set(ranked.map((r) => r.chunk.o.id));
  for (const { chunk } of ranked) {
    const t = itemTokens(chunk.o);
    if (used + t <= budget) take(chunk.o, 'rank'); else leave(chunk.o, 'budget');
  }
  const unscored = rest.filter((o) => !scoredIds.has(o.id)).sort((a, b) => ownOf(a) - ownOf(b) || a.id.localeCompare(b.id));
  const unscoredTokens = unscored.reduce((s, o) => s + itemTokens(o), 0);
  if (used + unscoredTokens <= budget) for (const o of unscored) take(o, 'small');
  else for (const o of unscored) leave(o, 'unranked');

  // 4) render
  const inc = included.map((x) => x.o);
  const facts = inc.filter((o) => o.type === 'Fact' && !isAssumption(o));
  const assumptions = inc.filter((o) => isAssumption(o));
  const constraints = inc.filter((o) => o.type === 'Constraint');
  const decisions = inc.filter((o) => o.type === 'Decision');
  const rejected = rejectedOptions(inc);
  const order = (list: ContextObject[]) => [...list].sort((a, b) => path(a.nodeId).localeCompare(path(b.nodeId)) || a.id.localeCompare(b.id));
  const docs = (list: ContextObject[]) => order(list).map((o) => renderDoc(o, path(o.nodeId))).join('\n');

  const data: string[] = [];
  data.push(`<documents workspace="${safe(input.workspaceName)}" scope="${safe(scopeName)}">`);
  data.push(`## واقعیت‌های تأییدشده\n${facts.length ? docs(facts) : 'هنوز واقعیت تأییدشده‌ای در این دامنه نیست.'}`);
  if (constraints.length) data.push(`## خط قرمزها (نباید نقض شوند)\n${docs(constraints)}`);
  if (decisions.length) data.push(`## تصمیم‌ها\n${docs(decisions)}`);
  if (rejected.length) data.push([`## گزینه‌های بررسی‌شده و ردشده`, REJECTED_RULE, ...rejected.map((r) => `- «${safe(r.title)}» (در تصمیم «${safe(r.objectTitle)}», \`${r.objectId}\`): ${safe(r.reason)}`)].join('\n'));
  if (assumptions.length) data.push([`## فرض‌های فعال، تأییدنشده (واقعیت نیست)`, ASSUMPTION_RULE, docs(assumptions)].join('\n'));
  if (metricsSection) data.push(metricsSection);
  if (changes.length) data.push(changesSection(changes, (id) => live.find((o) => o.id === id)));
  if (gapsText) data.push(gapsText);
  data.push('</documents>');
  const dataText = data.join('\n\n');
  const dataTokens = estimateTokens(dataText) + thoughtTokens;
  const longText = dataTokens > LONG_TEXT_TOKENS;

  const rules = [
    ...COMMON_RULES,
    ...KIND_RULES[kind],
    ...(selectedThoughts.length ? ['فکرهای انتخاب‌شده تأییدنشده‌اند؛ آن‌ها را واقعیت یا دستور فرض نکن و هیچ‌کدام را مستقیم به دانش تأییدشده تبدیل نکن.'] : []),
    ...(longText ? [QUOTES_RULE] : []),
  ];
  const parts = [
    ...(input.packId ? [`<!-- mabda-pack:${input.packId} -->`] : []),
    `# درخواست برای AI — ${KIND_LABEL[kind]} — ${input.workspaceName}`,
    '> اسناد زیر منبع حقیقت کسب‌وکار من‌اند. فقط «واقعیت‌های تأییدشده» واقعیت‌اند؛ فرض‌ها جدا و بدون وزن واقعیت آمده‌اند. قواعد و درخواست من بعد از اسناد است.',
    dataText,
    ...(thoughtSection ? [thoughtSection] : []),
    `## قواعد این کار (${KIND_LABEL[kind]})\n${rules.map((r) => `- ${r}`).join('\n')}`,
    `## درخواست من\n${request || '(درخواست را اینجا بنویس)'}`,
    AI_RESPONSE_FORMAT,
  ];
  const markdown = `${parts.join('\n\n')}\n`;

  const withReason = new Map(included.map((x) => [x.o.id, x.reason]));
  const includedItems: IncludedItem[] = order(inc).map((o) => ({ id: o.id, version: o.version, type: o.type, title: o.title, nodeLabel: path(o.nodeId), reason: withReason.get(o.id)!, tokens: itemTokens(o), assumption: isAssumption(o), from: fromText(o, scope, nodes) }));
  excluded.sort((a, b) => a.reason.localeCompare(b.reason) || a.nodeLabel.localeCompare(b.nodeLabel) || a.id.localeCompare(b.id));

  return {
    kind, markdown, tokens: estimateTokens(markdown), chars: markdown.length, dataTokens, tokenBudget: budget,
    overBudget: used > budget, longText,
    included: includedItems, excluded,
    scope: { whole: scope.whole, pickedLabels: scope.picked.map(labelOf), withChildren: scope.withChildren, sections: scope.seeds.length },
    refs: inc.map((o) => ({ id: o.id, version: o.version })).sort((a, b) => a.id.localeCompare(b.id)),
    counts: { facts: facts.length, assumptions: assumptions.length, constraints: constraints.length, decisions: decisions.length, rejected: rejected.length, changes: changes.length, gaps: gaps.length, metrics: metricsSection ? (input.metrics?.metrics.filter((m) => !m.archived).length ?? 0) : 0, thoughts: selectedThoughts.length },
  };
}

function renderDoc(o: ContextObject, nodePath: string): string {
  const extra: string[] = [];
  if (o.type === 'Decision' && o.record?.question) extra.push(`سؤال تصمیم: ${o.record.question}`);
  if (o.type === 'Decision' && o.record?.expectation) extra.push(`انتظار: ${o.record.expectation}`);
  const body = [o.title, o.content.replace(/\n{2,}/g, '\n').trim(), ...extra, ...exampleLines(o)].filter(Boolean).join('\n');
  const attrs = `id="${refOf(o)}" type="${o.type}" node="${safe(nodePath)}" source="${SOURCE_FA[o.provenance]}"${o.reviewBy ? ` review_by="${o.reviewBy}"` : ''}`;
  return `<document ${attrs}>\n${safe(body)}\n</document>`;
}

function gapsSection(gaps: Array<Pick<GapItem, 'label' | 'status' | 'question' | 'importance'>>): string {
  return ['## جاهای خالی (چیزهایی که هنوز ثبت یا روشن نشده)', ...gaps.map((g) => `- ${g.status === 'missing' ? 'ثبت‌نشده' : 'مبهم'}${g.importance === 'required' ? ' (ضروری)' : ''}: **${safe(g.label)}** — ${safe(g.question)}`)].join('\n');
}

const CHANGE_KIND_FA: Partial<Record<string, string>> = { created: 'ساخته شد', edited: 'ویرایش شد', status_changed: 'وضعیت عوض شد', superseded: 'جایگزین شد', archived: 'بایگانی شد', proposal_accepted: 'پیشنهاد پذیرفته شد', imported: 'وارد شد' };
const SHOWN_FIELDS = ['title', 'content', 'status', 'type'] as const;
function changesSection(changes: NonNullable<AiRequestInput['changes']>, find: (id: string) => ContextObject | undefined): string {
  const KIND = (c: (typeof changes)[number]) => CHANGE_KIND_FA[c.kind] ?? c.kind.replace(/_/g, ' ');
  const val = (v: unknown) => clip(String(v ?? '—').replace(/\s+/g, ' '), 400);
  const lines = changes.map((c) => {
    const o = find(c.objectId);
    const fields = SHOWN_FIELDS.filter((f) => c.before?.[f] !== undefined || c.after?.[f] !== undefined);
    const diff = fields.map((f) => `  - ${f}: «${safe(val(c.before?.[f]))}» ← «${safe(val(c.after?.[f]))}»`);
    return [`- \`${c.objectId}\` «${safe(o?.title ?? '')}» — نسخهٔ ${c.fromVersion} به ${c.toVersion}، ${KIND(c)}، ${c.at.slice(0, 10)}`, ...diff].join('\n');
  });
  return ['## تغییرهای اخیر (قبل ← بعد)', ...lines].join('\n');
}

/** the request's included / skipped lists in the SAME shape the pack explains itself with (one component shows both) */
export function explainOfRequest(r: Pick<AiRequestResult, 'included' | 'excluded' | 'scope'>): Explain {
  const items: ExplainItem[] = r.included.map((i) => ({
    id: i.id, title: i.title, type: i.type, nodeLabel: i.nodeLabel, from: i.from,
    group: i.assumption ? 'assumption' : i.type === 'Constraint' ? 'guardrail' : i.type === 'Decision' ? 'decision' : 'fact',
    ...(i.type === 'Constraint' ? { editable: true } : {}), note: INCLUDE_REASON_FA[i.reason],
  }));
  const skipped: ExplainSkipped[] = [];
  for (const e of r.excluded) {
    if (e.reason === 'sample') continue;
    skipped.push({ id: e.id, title: e.title, type: e.type, nodeLabel: e.nodeLabel, reason: e.reason === 'unconfirmed' ? 'status' : e.reason, why: e.why, canAdd: e.canAdd });
  }
  return { scope: r.scope, items, skipped };
}
