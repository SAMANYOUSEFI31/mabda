/**
 * The showcase workspace («قهوهٔ تخصصی آنلاین», a fictional online specialty-coffee brand: monthly subscription + roasting
 * workshop). Pure: `buildDemo(now)` returns everything that is stored — nodes, objects with their version history, relations,
 * the change log, notes, a text file with its summary, custom workstreams, three hand-written sample assets, and the boards.
 *
 * Rules of the data (docs/case-study.md): every date is relative to `now` (Tehran time); no AI output and no AI judgement is
 * invented — the sample assets are labelled as hand-made, «ambiguous» comes from a Needs Review status, contradictions are
 * found by the same deterministic engines as everywhere else.
 */

import { lineHash } from './thinkingMarkers';
import { nodeTemplateOf } from './templates';
import type { NodeTemplate } from './templates';
import { DEFAULT_TREE_NODES } from './specs';
import type {
  ContextChange, ContextChangeActor, ContextChangeKind, ContextObject, ContextRelationship, GeneratedDeliverable, Note, ObjectSource, SavedPack, TreeNode, WorkstreamSpec,
} from '../types';

const TEHRAN_OFFSET_MIN = 210; // UTC+3:30 (no daylight saving)
const DAY = 86_400_000;

/** `daysAgo` days before today's date in Tehran, at `hour:minute` Tehran time → ISO (UTC) */
export function tehranAt(now: Date, daysAgo: number, hour = 10, minute = 0): string {
  const local = new Date(now.getTime() + TEHRAN_OFFSET_MIN * 60_000);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(dayStart - daysAgo * DAY + (hour * 60 + minute - TEHRAN_OFFSET_MIN) * 60_000).toISOString();
}

export const DEMO_ID = 'ws_demo';
const W = DEMO_ID;
const BRAND = 'دانه‌گاه'; // fictional

export interface DemoVersion { objectId: string; version: number; type: ContextObject['type']; title: string; content: string; at: string }
export interface DemoFile { id: string; nodeId: string; name: string; mime: string; rawText: string; summary: string; tokens: number; createdAt: string; chunks: Array<{ index: number; text: string; tokens: number }> }
export interface DemoCanvasItem { itemRef: string; lane?: string; rank?: number; x?: number; y?: number }
export interface DemoData {
  nodes: TreeNode[];
  objects: ContextObject[];
  versions: DemoVersion[];
  relationships: ContextRelationship[];
  changes: ContextChange[];
  notes: Note[];
  file: DemoFile;
  specs: WorkstreamSpec[];
  deliverables: GeneratedDeliverable[];
  canvas: { decisions: DemoCanvasItem[]; free: DemoCanvasItem[] };
  /** three saved packs, a user template, and a few grey samples (never seen by an AI) */
  packs: SavedPack[];
  templates: Array<{ id: string; kind: 'node'; name: string; payload: NodeTemplate; at: string }>;
  samples: Array<{ id: string; type: ContextObject['type']; nodeId: string; title: string; content: string; at: string }>;
}

interface Who { actor: ContextChangeActor; label?: string }
const USER: Who = { actor: 'user' };
const CLAUDE: Who = { actor: 'mcp', label: 'Claude' };
const CHAT: Who = { actor: 'chat' };
const COACH: Who = { actor: 'coach' };
const IMPORT = (label: string): Who => ({ actor: 'import', label });

interface Spec {
  id: string; type: ContextObject['type']; node: string; title: string; first: string; status: ContextObject['status']; provenance: ContextObject['provenance'];
  slot?: string; created: [daysAgo: number, hour?: number]; by?: Who; source?: Omit<ObjectSource, 'at'> & { daysAgo?: number };
  /** content edits, oldest first (each is a new version) */
  edits?: Array<{ d: number; h?: number; content: string; by?: Who; reason?: string }>;
  /** status transitions after creation, oldest first */
  log?: Array<{ d: number; h?: number; kind: ContextChangeKind; to: ContextObject['status']; by?: Who; reason?: string }>;
  supersededBy?: { id: string; d: number; h?: number; by?: Who; reason?: string };
  /** how far it applies (docs/spine.md: effective context); absent = the type default */
  /** a working assumption (Fact) and the day it should be looked at again (days ago; negative = in the future) */
  assumption?: boolean;
  reviewByDaysAgo?: number;
  /** the record of a Decision: `reviewOnDaysAgo` becomes a date */
  record?: { question?: string; options?: Array<{ title: string; rejectedReason?: string }>; expectation?: string; reviewOnDaysAgo?: number };
  reach?: 'global' | 'position';
  /** days ago the object stopped applying (an end date in the past = expired) */
  expiredDaysAgo?: number;
}

export function buildDemo(now: Date): DemoData {
  const at = (d: number, h = 10, m = 0) => tehranAt(now, d, h, m);

  // ── tree: system nodes exist already (business › brand, product › offer, content); user nodes make it 4 levels deep ──
  const nodes: TreeNode[] = [
    { id: 'dn_sub', label: 'اشتراک ماهانه', parentId: 'product', description: 'بستهٔ ماهانهٔ قهوه، قیمت و ارسال', order: 10 },
    { id: 'dn_ship', label: 'ارسال و بسته‌بندی', parentId: 'dn_sub', description: 'روز و هزینهٔ ارسال، بسته‌بندی', order: 11 },
    { id: 'dn_support', label: 'پشتیبانی و پس از فروش', parentId: 'product', description: 'ساعت و زمان پاسخ به مشتری', order: 12 },
    { id: 'dn_ws', label: 'کارگاه برشته‌کاری', parentId: 'offer', description: 'کارگاه حضوری و آموزش خانگی', order: 13 },
    { id: 'dn_ws_prog', label: 'برنامهٔ جلسه‌ها', parentId: 'dn_ws', description: 'سرفصل و زمان‌بندی جلسه‌های کارگاه', order: 14 },
    { id: 'dn_social', label: 'محتوا و شبکه‌های اجتماعی', parentId: 'content', description: 'کانال‌ها، لحن و تقویم', order: 15 },
  ];

  const objects: ContextObject[] = [];
  const versions: DemoVersion[] = [];
  const changes: ContextChange[] = [];
  const relationships: ContextRelationship[] = [];
  let seq = 0;
  const chg = (c: Omit<ContextChange, 'id' | 'workspaceId'>) => changes.push({ id: `chg_demo_${String(++seq).padStart(3, '0')}`, workspaceId: W, ...c });
  const rel = (type: ContextRelationship['type'], sourceId: string, targetId: string, at0: string) => relationships.push({ id: `rel_demo_${relationships.length + 1}`, sourceId, targetId, type, createdAt: at0 });

  const add = (s: Spec) => {
    const created = at(s.created[0], s.created[1] ?? 10);
    const by = s.by ?? (s.source ? sourceActor(s.source.kind, s.source.label) : USER);
    let version = 1;
    let content = s.first;
    let updated = created;
    versions.push({ objectId: s.id, version, type: s.type, title: s.title, content, at: created });
    chg({ objectId: s.id, fromVersion: 0, toVersion: 1, kind: s.provenance === 'Imported' ? 'imported' : 'created', actor: by.actor, ...(by.label ? { actorLabel: by.label } : {}), after: { type: s.type, title: s.title, nodeId: s.node, status: s.status === 'Archived' || s.status === 'Superseded' || s.status === 'Needs Review' || (s.status === 'Confirmed' && s.log) ? 'Proposed' : s.status }, at: created, ...(s.source?.reason ? { reason: s.source.reason } : {}) });
    for (const e of s.edits ?? []) {
      const when = at(e.d, e.h ?? 11);
      chg({ objectId: s.id, fromVersion: version, toVersion: version + 1, kind: 'edited', actor: (e.by ?? USER).actor, ...(e.by?.label ? { actorLabel: e.by.label } : {}), ...(e.reason ? { reason: e.reason } : {}), before: { content }, after: { content: e.content }, at: when });
      version += 1; content = e.content; updated = when;
      versions.push({ objectId: s.id, version, type: s.type, title: s.title, content, at: when });
    }
    let status: ContextObject['status'] = s.log ? 'Proposed' : s.status;
    for (const l of s.log ?? []) {
      const when = at(l.d, l.h ?? 12);
      chg({ objectId: s.id, fromVersion: version, toVersion: version, kind: l.kind, actor: (l.by ?? USER).actor, ...(l.by?.label ? { actorLabel: l.by.label } : {}), ...(l.reason ? { reason: l.reason } : {}), before: { status }, after: { status: l.to }, at: when });
      status = l.to; updated = when;
    }
    if (s.supersededBy) {
      const when = at(s.supersededBy.d, s.supersededBy.h ?? 13);
      chg({ objectId: s.id, fromVersion: version, toVersion: version + 1, kind: 'superseded', actor: (s.supersededBy.by ?? USER).actor, ...(s.supersededBy.reason ? { reason: s.supersededBy.reason } : {}), before: { status }, after: { status: 'Superseded', supersededById: s.supersededBy.id }, at: when });
      rel('supersedes', s.supersededBy.id, s.id, when);
      status = 'Superseded'; updated = when;
    }
    objects.push({
      id: s.id, workspaceId: W, type: s.type, status, provenance: s.provenance, title: s.title, content, nodeId: s.node, version,
      ...(s.supersededBy ? { supersededById: s.supersededBy.id } : {}), ...(s.slot ? { slotKey: s.slot } : {}), ...(s.reach ? { reach: s.reach } : {}), ...(s.assumption ? { assumption: true, ...(s.reviewByDaysAgo !== undefined ? { reviewBy: at(s.reviewByDaysAgo, 12).slice(0, 10) } : {}) } : {}),
      ...(s.record ? { record: { ...(s.record.question ? { question: s.record.question } : {}), ...(s.record.options ? { options: s.record.options } : {}), ...(s.record.expectation ? { expectation: s.record.expectation } : {}), ...(s.record.reviewOnDaysAgo !== undefined ? { reviewOn: at(s.record.reviewOnDaysAgo, 12).slice(0, 10) } : {}) } } : {}), ...(s.expiredDaysAgo !== undefined ? { validUntil: at(s.expiredDaysAgo, 12).slice(0, 10) } : {}),
      ...(s.source ? { source: { kind: s.source.kind, ...(s.source.label ? { label: s.source.label } : {}), ...(s.source.reason ? { reason: s.source.reason } : {}), ...(s.source.quote ? { quote: s.source.quote } : {}), ...(s.source.noteId ? { noteId: s.source.noteId, lineKey: s.source.lineKey } : {}), at: at(s.source.daysAgo ?? s.created[0], s.created[1] ?? 10) } } : {}),
      createdAt: created, updatedAt: updated,
    });
  };
  function sourceActor(kind: ObjectSource['kind'], label?: string): Who {
    if (kind === 'mcp') return { actor: 'mcp', ...(label ? { label } : {}) };
    if (kind === 'chat') return CHAT;
    if (kind === 'coach') return COACH;
    if (kind === 'file' || kind === 'paste' || kind === 'note' || kind === 'asset') return IMPORT(label ?? 'ورود');
    return USER;
  }

  // ── the business ───────────────────────────────────────────────────────────────────────────
  add({ id: 'dm_domain', type: 'Fact', node: 'business', title: 'حوزهٔ کسب‌وکار', first: `ما قهوهٔ تخصصی برشته‌شده را آنلاین می‌فروشیم: اشتراک ماهانه و کارگاه آموزشی برشته‌کاری (برند خیالی «${BRAND}»).`, status: 'Confirmed', provenance: 'Onboarding', slot: 'business_domain', created: [40] });
  add({ id: 'dm_audience', type: 'Decision', node: 'business', title: 'مخاطب اصلی', first: 'علاقه‌مندان قهوه', status: 'Confirmed', provenance: 'User Input', slot: 'target_audience', created: [40, 11],
    edits: [{ d: 3, content: 'علاقه‌مندان قهوهٔ خانگی ۲۵ تا ۴۵ ساله در شهرهای بزرگ که اسپرسوساز یا موکاپات دارند.', reason: 'بعد از نظرسنجی از مشتری‌ها دقیق‌ترش کردم.' }] });
  add({ id: 'dm_problem', type: 'Fact', node: 'business', title: 'معضل اصلی مخاطب', first: 'پیدا کردن قهوهٔ خوب سخت است.', status: 'Confirmed', provenance: 'User Input', slot: 'core_problem', created: [40, 12],
    edits: [{ d: 2, content: 'پیدا کردن قهوهٔ واقعاً تازه سخت است: بیشتر دانه‌ها هفته‌ها پیش برشته شده‌اند و تاریخ برشته روی بسته نیست.', reason: 'بعد از جواب‌های نظرسنجی.' }] });
  add({ id: 'dm_valueprop', type: 'Decision', node: 'product', title: 'پیشنهاد ارزش', first: 'قهوهٔ تازه‌برشته با تاریخ برشتهٔ روی بسته و یک منشأ تازه در هر ماه.', status: 'Confirmed', provenance: 'User Input', slot: 'value_proposition', created: [38] });
  add({ id: 'dm_nodiscount', type: 'Constraint', node: 'offer', title: 'بدون تخفیف', first: 'تخفیف نداریم؛ ارزش را با کیفیت نشان می‌دهیم و روی قیمت اشتراک چانه نمی‌زنیم.', status: 'Confirmed', provenance: 'User Input', slot: 'pricing_boundary', created: [30], reach: 'global' });
  add({ id: 'dm_discount', type: 'Decision', node: 'offer', title: 'کمپین ماه اول', first: 'برای ماه اول اشتراک تخفیف ۲۰ درصد بدهیم.', status: 'Proposed', provenance: 'AI Suggested', created: [2, 15],
    source: { kind: 'mcp', label: 'Claude', reason: 'در گفتگو گفتی می‌خواهی ماه اول جذاب باشد.' } });

  // ── subscription ───────────────────────────────────────────────────────────────────────────
  add({ id: 'dm_price', type: 'Decision', node: 'dn_sub', title: 'قیمت اشتراک ماهانه', first: '۴۲۰ هزار تومان در ماه برای ۴ بستهٔ ۲۵۰ گرمی.', status: 'Confirmed', provenance: 'User Input', slot: 'subscription_price', created: [33],
    edits: [{ d: 9, content: '۴۵۰ هزار تومان در ماه برای ۴ بستهٔ ۲۵۰ گرمی.', reason: 'قیمت دانهٔ خام بالا رفت.' }] });
  add({ id: 'dm_price2', type: 'Decision', node: 'dn_sub', title: 'قیمت اشتراک ماهانه', first: '۵۲۰ هزار تومان در ماه برای ۴ بستهٔ ۲۵۰ گرمی.', status: 'Confirmed', provenance: 'User Input', created: [12] });
  add({ id: 'dm_pack', type: 'Decision', node: 'dn_sub', title: 'بستهٔ اشتراک', first: 'هر ماه چهار بستهٔ ۲۵۰ گرمی: دو تک‌خاستگاه و دو ترکیب خانگی.', status: 'Confirmed', provenance: 'User Input', slot: 'subscription_package', created: [33, 11],
    log: [{ d: 33, h: 11, kind: 'proposal_accepted', to: 'Confirmed' }, { d: 8, kind: 'review_accepted', to: 'Confirmed', reason: 'قیمت عوض شد ولی بسته همان است.' }] });
  add({ id: 'dm_ship_policy', type: 'Decision', node: 'dn_ship', title: 'سیاست ارسال', first: 'ارسال برای همهٔ اشتراک‌ها رایگان است.', status: 'Proposed', provenance: 'AI Suggested', slot: 'shipping_policy', created: [2, 9],
    source: { kind: 'mcp', label: 'Claude', reason: 'گفتی مشتری‌ها از هزینهٔ ارسال ناراضی‌اند.' } });
  add({ id: 'dm_ship_cost', type: 'Decision', node: 'dn_ship', title: 'هزینهٔ ارسال', first: 'ارسال با هزینهٔ ۶۰ هزار تومان برای همهٔ سفارش‌ها.', status: 'Proposed', provenance: 'AI Suggested', created: [2, 16],
    source: { kind: 'chat', reason: 'در گفتگوی گرهٔ ارسال گفتی هزینهٔ پست را مشتری بدهد.' } });
  // «روز ارسال» was replaced three times: Monday → Tuesday → Thursday → Saturday
  add({ id: 'dm_day1', type: 'Decision', node: 'dn_ship', title: 'روز ارسال اشتراک', first: 'ارسال هر دوشنبه.', status: 'Confirmed', provenance: 'User Input', created: [35], supersededBy: { id: 'dm_day2', d: 26, reason: 'پست دوشنبه‌ها شلوغ بود.' } });
  add({ id: 'dm_day2', type: 'Decision', node: 'dn_ship', title: 'روز ارسال اشتراک', first: 'ارسال هر سه‌شنبه.', status: 'Confirmed', provenance: 'User Input', created: [26, 13], supersededBy: { id: 'dm_day3', d: 15, reason: 'برشته‌کاری سه‌شنبه تمام نمی‌شود.' } });
  add({ id: 'dm_day3', type: 'Decision', node: 'dn_ship', title: 'روز ارسال اشتراک', first: 'ارسال هر پنجشنبه.', status: 'Confirmed', provenance: 'User Input', created: [15, 13], supersededBy: { id: 'dm_day4', d: 1, reason: 'پنجشنبه‌ها اداره‌های پست زود می‌بندند.' } });
  // parent says one thing, the child node says another (found by the level-by-level contradiction check, `inherits_conflict`)
  add({ id: 'dm_ship_time', type: 'Decision', node: 'dn_sub', title: 'زمان ارسال اشتراک', first: 'هر بسته در اول هر ماه ارسال می‌شود.', status: 'Confirmed', provenance: 'User Input', created: [34, 10] });
  add({ id: 'dm_day4', type: 'Decision', node: 'dn_ship', title: 'روز ارسال اشتراک', first: 'ارسال هر شنبه صبح.', status: 'Confirmed', provenance: 'User Input', created: [1, 13] });

  // ── advertising: a chain (audience ← channel ← budget) and a blocked pair ───────────────────
  add({ id: 'dm_channel', type: 'Decision', node: 'brand', title: 'کانال اصلی تبلیغ', first: 'اینستاگرام کانال اصلی تبلیغ است.', status: 'Confirmed', provenance: 'User Input', slot: 'ad_channel', created: [20] });
  add({ id: 'dm_budget', type: 'Decision', node: 'offer', title: 'بودجهٔ ماهانهٔ تبلیغات', first: 'بودجهٔ تبلیغات ماهانه ۱۵ میلیون تومان است.', status: 'Confirmed', provenance: 'User Input', slot: 'ad_budget', created: [18] });
  add({ id: 'dm_tg_budget', type: 'Decision', node: 'dn_social', title: 'بودجهٔ کمپین تلگرام', first: 'برای کمپین تلگرام ۳ میلیون تومان کنار بگذاریم.', status: 'Proposed', provenance: 'Imported', created: [1, 14],
    source: { kind: 'paste', label: 'متن چسبانده‌شده', reason: 'از یادداشت جلسهٔ هفتگی که چسباندی.', quote: 'برای کمپین تلگرام ۳ میلیون تومان کنار بگذاریم' } });
  add({ id: 'dm_tg_campaign', type: 'Decision', node: 'dn_social', title: 'کمپین کانال تلگرام', first: 'یک کمپین دوهفته‌ای برای رشد کانال تلگرام اجرا کنیم.', status: 'Proposed', provenance: 'AI Suggested', created: [4, 14],
    source: { kind: 'coach', reason: 'مربی دانش پرسید برای رشد کانال چه برنامه‌ای داری.' } });

  // ── workshop ───────────────────────────────────────────────────────────────────────────────
  add({ id: 'dm_ws_price', type: 'Decision', node: 'dn_ws', title: 'قیمت کارگاه', first: '۸۵۰ هزار تومان برای هر شرکت‌کننده.', status: 'Confirmed', provenance: 'User Input', slot: 'workshop_price', created: [22] });
  add({ id: 'dm_ws_cap', type: 'Fact', node: 'dn_ws', title: 'ظرفیت کارگاه', first: 'هر دوره حداکثر ۱۲ نفر ظرفیت دارد.', status: 'Confirmed', provenance: 'User Input', slot: 'workshop_capacity', created: [22, 11] });
  add({ id: 'dm_ws_refund', type: 'Constraint', node: 'dn_ws', title: 'بازگشت وجه کارگاه', first: 'تا ۴۸ ساعت قبل از کارگاه بازگشت وجه کامل داریم؛ بعد از آن بازگشت وجه نداریم.', status: 'Confirmed', provenance: 'User Input', created: [22, 12], reach: 'position' });
  add({ id: 'dm_ws_plan', type: 'Decision', node: 'dn_ws_prog', title: 'برنامهٔ جلسه‌ها', first: 'سه جلسهٔ دو ساعته: آشنایی با دانه، برشته‌کاری، قهوه‌چشی.', status: 'Proposed', provenance: 'AI Suggested', created: [5, 11],
    source: { kind: 'coach', reason: 'از جواب‌هایت دربارهٔ کارگاه ساختم؛ بررسی‌اش کن.' } });

  // ── support, content ───────────────────────────────────────────────────────────────────────
  add({ id: 'dm_sup_hours', type: 'Fact', node: 'dn_support', title: 'ساعت پاسخگویی', first: 'پیام مشتری‌ها از ۹ تا ۱۸ همهٔ روزهای هفته پاسخ داده می‌شود.', status: 'Confirmed', provenance: 'User Input', created: [28] });
  add({ id: 'dm_sup_sla', type: 'Constraint', node: 'dn_support', title: 'زمان پاسخ', first: 'پاسخ به پیام مشتری حداکثر ظرف ۲ ساعت کاری.', status: 'Confirmed', provenance: 'User Input', created: [28, 11], reach: 'position' });
  add({ id: 'dm_sup_old', type: 'Fact', node: 'dn_support', title: 'تعداد اعضای کانال تلگرام', first: 'کانال تلگرام ۵۰۰ عضو دارد.', status: 'Archived', provenance: 'Imported', created: [6, 10],
    source: { kind: 'file', label: 'گزارش فروش پاییز.txt', reason: 'از گزارش فروش پاییز خوانده شد.', quote: 'کانال تلگرام ۵۰۰ عضو دارد' },
    log: [{ d: 3, h: 15, kind: 'proposal_rejected', to: 'Archived', reason: 'این عدد قدیمی بود.' }] });
  add({ id: 'dm_voice', type: 'Decision', node: 'brand', title: 'لحن برند', first: 'صمیمی، دقیق و بدون اغراق؛ واژهٔ تخصصی را با یک توضیح کوتاه می‌آوریم.', status: 'Confirmed', provenance: 'User Input', slot: 'brand_voice', created: [36] });
  add({ id: 'dm_channels', type: 'Fact', node: 'dn_social', title: 'کانال‌های فعال', first: 'اینستاگرام و کانال تلگرام.', status: 'Confirmed', provenance: 'User Input', slot: 'active_channels', created: [36, 11] });
  add({ id: 'dm_calendar', type: 'Decision', node: 'dn_social', title: 'تقویم محتوا', first: 'هفته‌ای ۳ پست و ۲ استوری.', status: 'Needs Review', provenance: 'User Input', slot: 'content_calendar', created: [24],
    log: [{ d: 24, h: 11, kind: 'proposal_accepted', to: 'Confirmed' }, { d: 4, kind: 'status_changed', to: 'Needs Review', reason: 'ظرفیت تیم عوض شد؛ دوباره بررسی شود.' }] });

  // ── the thinking structure: assumptions (one due, one later) — never facts, even when confirmed ──────────────────
  add({ id: 'dm_assume_msg', type: 'Fact', node: 'dn_social', title: 'مشتری‌ها پیام‌رسان را از ایمیل بیشتر می‌خوانند', first: 'مشتری‌ها پیام‌رسان را از ایمیل بیشتر می‌خوانند.', status: 'Confirmed', provenance: 'User Input', created: [14, 12], assumption: true, reviewByDaysAgo: 2 });
  add({ id: 'dm_assume_renew', type: 'Fact', node: 'dn_sub', title: 'تمدید اشتراک بعد از سه ماه', first: 'بیشتر مشتری‌ها بعد از سه ماه تمدید می‌کنند.', status: 'Proposed', provenance: 'User Input', created: [3, 11], assumption: true, reviewByDaysAgo: -20,
    source: { kind: 'note', label: 'یادداشت', quote: 'بیشتر مشتری‌ها بعد از سه ماه تمدید می‌کنند', noteId: 'dnote_7', lineKey: lineHash('بیشتر مشتری‌ها بعد از سه ماه تمدید می‌کنند'), daysAgo: 3 } });

  // ── effective context: an exception for a sub-tree, and a rule that ended ────────────────────────
  add({ id: 'dm_ws_group', type: 'Decision', node: 'dn_ws', title: 'قیمت کارگاه گروهی', first: 'کارگاه گروهی (۴ نفر به بالا) قیمت جداگانه دارد و با قیمت اشتراک ماهانه یکی نیست.', status: 'Confirmed', provenance: 'User Input', created: [9, 15],
    record: { question: 'کارگاه گروهی چطور قیمت‌گذاری شود؟', options: [{ title: 'تخفیف ۱۵ درصد روی قیمت کارگاه', rejectedReason: 'با قید «تخفیف نداریم» نمی‌خواند' }, { title: 'قیمت جداگانهٔ گروهی' }], expectation: 'دست‌کم سه ثبت‌نام گروهی تا دو ماه دیگر', reviewOnDaysAgo: 3 } });
  add({ id: 'dm_old_promo', type: 'Constraint', node: 'dn_social', title: 'جشنوارهٔ پاییز', first: 'تا پایان جشنوارهٔ پاییز بستهٔ هدیه ارسال نکنیم.', status: 'Confirmed', provenance: 'User Input', created: [40, 12], reach: 'position', expiredDaysAgo: 12 });

  // ── more suggestions from different ways in ─────────────────────────────────────────────────
  add({ id: 'dm_p_file', type: 'Fact', node: 'dn_sub', title: 'تمدید اشتراک', first: 'بیشتر مشتری‌هایی که ۳ ماه مانده‌اند، اشتراک را تمدید کرده‌اند.', status: 'Proposed', provenance: 'Imported', created: [1, 11],
    source: { kind: 'file', label: 'گزارش فروش پاییز.txt', reason: 'از خلاصهٔ گزارش فروش.', quote: 'بیشتر مشتری‌هایی که سه ماه مانده‌اند تمدید کرده‌اند' } });
  add({ id: 'dm_p_paste', type: 'Fact', node: 'brand', title: 'ترجیح مشتری دربارهٔ پیام‌رسانی', first: 'مشتری‌ها پیام‌رسان را از ایمیل بیشتر می‌خوانند.', status: 'Proposed', provenance: 'Imported', created: [1, 16],
    source: { kind: 'paste', label: 'حافظهٔ ChatGPT', reason: 'از حافظهٔ ChatGPT چسباندی.', quote: 'مشتری‌ها پیام‌رسان را از ایمیل بیشتر می‌خوانند' } });
  add({ id: 'dm_p_coach', type: 'Fact', node: 'dn_support', title: 'پرسش رایج دربارهٔ آسیاب', first: 'مشتری‌ها اغلب می‌پرسند دانه را آسیاب‌شده بفرستیم یا کامل.', status: 'Proposed', provenance: 'AI Suggested', created: [4, 16],
    source: { kind: 'coach', reason: 'از پاسخ‌هایت دربارهٔ پشتیبانی.' } });

  // ── relations (all `depends_on` are read by decisionGraph / impactEngine) ────────────────────
  const dep = (a: string, b: string, d: number) => rel('depends_on', a, b, at(d));
  dep('dm_price', 'dm_pack', 33); dep('dm_pack', 'dm_ship_policy', 2); dep('dm_ship_policy', 'dm_price', 2); // the three-way loop
  dep('dm_channel', 'dm_audience', 20); dep('dm_budget', 'dm_channel', 18); // chain
  dep('dm_tg_campaign', 'dm_tg_budget', 1); // blocked until the budget is decided
  dep('dm_valueprop', 'dm_problem', 38);
  dep('dm_ws_plan', 'dm_ws_cap', 5); // ready: what it rests on is confirmed
  dep('dm_discount', 'dm_price', 2);
  // exception (overrides): the group workshop sets «no discount» aside for the workshop branch only — with a reason, in the Change log
  rel('overrides', 'dm_ws_group', 'dm_nodiscount', at(9, 15));
  chg({ objectId: 'dm_ws_group', fromVersion: 1, toVersion: 1, kind: 'edited', actor: 'user', reason: 'قیمت کارگاه گروهی جدا از اشتراک تعیین می‌شود؛ قید «تخفیف نداریم» برای اشتراک می‌ماند.', before: { overrides: [] }, after: { overrides: ['dm_nodiscount'] }, at: at(9, 15, 5) });

  // ── notes: raw thoughts (never fed to a model) ────────────────────────────────────────────────
  const notes: Note[] = [
    { id: 'dnote_1', nodeId: 'business', content: 'شاید یک اشتراک هدیه هم بسازیم؟ مناسب عید و تولد.', at: at(5, 20) },
    { id: 'dnote_2', nodeId: 'dn_sub', content: 'اگر دانه را آسیاب‌شده بفرستیم شکایت‌ها کم می‌شود؟ ولی عطرش زود می‌پرد.', at: at(3, 21) },
    { id: 'dnote_3', nodeId: 'dn_ws', content: 'کارگاه آنلاین هم برگزار کنیم؟ جلسه‌ها را ضبط کنیم و بفروشیم.', at: at(2, 19) },
    { id: 'dnote_4', nodeId: 'dn_social', content: 'ریلز از مراحل برشته‌کاری؛ صدای ترک‌خوردن دانه خیلی جذاب است.', at: at(2, 22) },
    { id: 'dnote_5', nodeId: 'dn_support', content: 'یک راهنمای کوتاه دم‌کردن توی هر بسته بگذاریم.', at: at(1, 18) },
    { id: 'dnote_7', nodeId: 'dn_sub', content: 'فکرهای این هفته دربارهٔ اشتراک:\n[سؤال] آیا دانه را آسیاب‌شده هم بفرستیم؟\n[تصمیم باز] قیمت اشتراک سه‌ماهه چقدر باشد؟\n[ایده] جعبهٔ هدیه برای عید\n[فرض] بیشتر مشتری‌ها بعد از سه ماه تمدید می‌کنند\nاین [فرض] وسط خط است و نشانگر حساب نمی‌شود.', at: at(3, 11) },
    { id: 'dnote_8', nodeId: 'dn_social', content: 'ایده‌های محتوا\n## ریلز\nمراحل برشته‌کاری، صدای ترک‌خوردن دانه.\n## کپشن\nکوتاه، بدون کلمات تبلیغاتی.\n[سؤال] ریلز را هفته‌ای چند بار منتشر کنیم؟', at: at(2, 12) },
    { id: 'dnote_6', nodeId: 'offer', content: 'بستهٔ آزمایشی ۲ ماهه برای مشتری‌های تازه؟ (بدون تخفیف، با یک دانهٔ اضافه)', at: at(1, 21) },
  ].map((n) => ({ id: n.id, workspaceId: W, nodeId: n.nodeId, content: n.content, createdAt: n.at, updatedAt: n.at }));

  // ── a text file with its (hand-written) summary ──────────────────────────────────────────────
  const fileText = [
    'گزارش فروش پاییز — نمونه (ساختگی)',
    'اشتراک ماهانه: بیشتر مشتری‌هایی که سه ماه مانده‌اند تمدید کرده‌اند.',
    'کانال تلگرام ۵۰۰ عضو دارد و بیشترین پرسش‌ها دربارهٔ روز ارسال است.',
    'کارگاه برشته‌کاری: هر دوره پر شد و فهرست انتظار داریم.',
  ].join('\n');
  const file: DemoFile = {
    id: 'file_demo_sales', nodeId: 'dn_sub', name: 'گزارش فروش پاییز.txt', mime: 'text/plain', rawText: fileText, tokens: Math.ceil(fileText.length / 3), createdAt: at(1, 10),
    summary: 'گزارش نمونهٔ فروش پاییز: تمدید خوب اشتراک ۳ ماهه، رشد کانال تلگرام و پر شدن کارگاه‌ها. (خلاصهٔ دستیِ فضای نمونه است، نه خروجی مدل.)',
    chunks: [{ index: 0, text: fileText, tokens: Math.ceil(fileText.length / 3) }],
  };

  // ── three workstreams (custom specs): one ready, one with a missing slot, one with an ambiguous slot ─────
  const cost = { fast: 1, auto: 2, critique: 10, sensitive: 20 };
  const item = (key: string, label: string, description: string, nodeId: string) => ({ key, label, description, nodeId });
  const specs: WorkstreamSpec[] = [
    {
      id: 'demo_spec_intro', title: 'معرفی برند', target: 'یک معرفی کوتاه و دقیق از برند برای صفحهٔ اصلی و پروفایل‌ها.', description: 'کاملاً آماده: همهٔ موارد لازمش تأیید شده است.',
      requiredContext: [item('business_domain', 'حوزهٔ کسب‌وکار', 'برند چه می‌فروشد', 'business'), item('target_audience', 'مخاطب اصلی', 'برای چه کسی', 'business'), item('brand_voice', 'لحن برند', 'چطور حرف می‌زنیم', 'brand')],
      suggestedContext: [item('core_problem', 'معضل اصلی مخاطب', 'چه دردی را حل می‌کنیم', 'business')], optionalContext: [],
      deliverables: [{ id: 'del_intro', title: 'معرفی کوتاه برند', type: 'Asset', description: 'سه جمله برای صفحهٔ اصلی.', order: 1, baseCreditCost: cost, acceptanceCriteria: ['لحن صمیمی و دقیق باشد', 'مخاطب را نام ببرد'] }],
    },
    {
      id: 'demo_spec_campaign', title: 'کمپین اشتراک', target: 'متن کمپین برای معرفی اشتراک ماهانه در اینستاگرام.', description: 'یک مورد لازم هنوز ثبت نشده («تاریخ شروع»)، و یکی هنوز فقط پیشنهادی است.',
      requiredContext: [item('subscription_price', 'قیمت اشتراک ماهانه', 'قیمت نهایی اشتراک', 'dn_sub'), item('shipping_policy', 'سیاست ارسال', 'رایگان یا با هزینه', 'dn_ship'), item('ad_channel', 'کانال اصلی تبلیغ', 'کدام کانال', 'brand'), item('launch_date', 'تاریخ شروع کمپین', 'کمپین از چه روزی شروع می‌شود', 'offer')],
      suggestedContext: [item('ad_budget', 'بودجهٔ ماهانهٔ تبلیغات', 'چقدر خرج می‌کنیم', 'offer')], optionalContext: [],
      deliverables: [{ id: 'del_campaign', title: 'متن کمپین اشتراک', type: 'Deliverable', description: 'سه متن کوتاه برای پست و استوری.', order: 1, baseCreditCost: cost, acceptanceCriteria: ['قیمت درست آمده باشد', 'بدون تخفیف باشد'] }],
      guardrails: ['به مشتری تخفیف وعده نده.'],
    },
    {
      id: 'demo_spec_calendar', title: 'تقویم محتوای هفتگی', target: 'یک تقویم هفتگی برای پست و استوری.', description: 'یک مورد لازم مبهم است («تقویم محتوا» نیاز به بازبینی دارد).',
      requiredContext: [item('content_calendar', 'تقویم محتوا', 'چند پست و استوری در هفته', 'dn_social'), item('brand_voice', 'لحن برند', 'چطور حرف می‌زنیم', 'brand'), item('active_channels', 'کانال‌های فعال', 'کجا منتشر می‌کنیم', 'dn_social')],
      suggestedContext: [item('core_problem', 'معضل اصلی مخاطب', 'چه دردی را حل می‌کنیم', 'business')], optionalContext: [],
      deliverables: [{ id: 'del_calendar', title: 'تقویم هفتگی', type: 'Deliverable', description: 'جدول روز به روز.', order: 1, baseCreditCost: cost, acceptanceCriteria: ['هر روز یک ایده داشته باشد'] }],
    },
  ];

  // ── three sample assets, written by hand (NOT AI output); lineage = the exact object versions they were made from ─────────
  const label = '> **نمونهٔ دستی:** این خروجی را هوش مصنوعی نساخته است؛ برای دیدن ردپا و «نیاز به بازبینی» در فضای نمونه گذاشته شده. با «ساخت با AI» خودت یک نسخهٔ واقعی با کلید خودت بساز.';
  const made = (id: string, specId: string, delId: string, title: string, body: string, used: Array<[string, number]>, d: number): GeneratedDeliverable => ({
    id, workspaceId: W, workstreamId: specId, deliverableId: delId, title, content: `${label}\n\n${body}`, executionMode: 'auto', creditCost: 0,
    usedContext: used.map(([i, v]) => ({ id: i, version: v })), rebuildCount: 0, createdAt: at(d, 15), source: { kind: 'user', label: 'نمونهٔ دستی', at: at(d, 15) },
  });
  const deliverables: GeneratedDeliverable[] = [
    made('dd_intro', 'demo_spec_intro', 'del_intro', 'معرفی کوتاه برند', `${BRAND} قهوهٔ تخصصی را تازه‌برشته به خانهٔ علاقه‌مندان قهوه می‌رساند؛ هر ماه چهار بسته با تاریخ برشتهٔ روی آن.\nاگر اسپرسوساز یا موکاپات داری، می‌دانی تازگی چقدر فرق می‌کند. ما همان را می‌فرستیم.`, [['dm_domain', 1], ['dm_audience', 2], ['dm_voice', 1]], 1),
    made('dd_campaign', 'demo_spec_campaign', 'del_campaign', 'متن کمپین اشتراک', `**پست:** قهوهٔ تازه‌برشته، هر ماه، درِ خانه — ۴۵۰ هزار تومان برای چهار بسته.\n**استوری:** تاریخ برشته را ببین؛ فرقش را می‌چشی.`, [['dm_channel', 1], ['dm_price', 2], ['dm_nodiscount', 1]], 5),
    made('dd_calendar', 'demo_spec_calendar', 'del_calendar', 'تقویم هفتگی', `شنبه: پست معرفی منشأ دانه · دوشنبه: استوری پشت‌صحنهٔ برشته‌کاری · چهارشنبه: پست آموزش دم‌کردن · پنجشنبه: استوری نظر مشتری · جمعه: بازنشر بهترین محتوا.\nدرد اصلی: «قهوهٔ خوب پیدا کردن سخت است.»`, [['dm_problem', 1], ['dm_voice', 1], ['dm_channels', 1]], 6),
  ];

  // ── boards: decision-board ranks (priority inside a column) and free notes with coordinates ─────────────
  const rank = (ids: string[], lane: string): DemoCanvasItem[] => ids.map((id, i) => ({ itemRef: `obj:${id}`, lane, rank: i + 1 }));
  const canvas = {
    decisions: [
      ...rank(['dm_price', 'dm_pack', 'dm_day4', 'dm_channel', 'dm_budget', 'dm_audience'], 'confirmed'),
      ...rank(['dm_ship_policy', 'dm_discount', 'dm_ship_cost'], 'thinking'),
    ],
    free: [
      { itemRef: 'note:dnote_1', x: 0, y: 0 }, { itemRef: 'note:dnote_2', x: 260, y: 20 }, { itemRef: 'note:dnote_3', x: 520, y: 0 },
      { itemRef: 'note:dnote_4', x: 40, y: 150 }, { itemRef: 'note:dnote_5', x: 300, y: 170 },
    ],
  };

  changes.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  // ── facets: one free axis across the tree (an object may belong to «مشتری ماهانه» in one node and «کارگاه» in another) ──
  const FACETS: Record<string, string[]> = {
    'مشتری ماهانه': ['dm_price', 'dm_pack', 'dm_ship_policy', 'dm_ship_cost', 'dm_day4', 'dm_ship_time', 'dm_assume_renew', 'dm_discount', 'dm_nodiscount'],
    'کارگاه': ['dm_ws_cap', 'dm_ws_plan', 'dm_ws_refund', 'dm_ws_group'],
    'پاییز': ['dm_discount', 'dm_old_promo', 'dm_p_file', 'dm_ws_plan'],
  };
  for (const [facet, ids] of Object.entries(FACETS)) for (const id of ids) { const o = objects.find((x) => x.id === id); if (o) o.facets = [...(o.facets ?? []), facet]; }

  // ── three saved packs: each is a different way to hand the same knowledge to an AI ──
  const packs: SavedPack[] = [
    { id: 'pk_demo_ads', workspaceId: W, name: 'متن تبلیغ اشتراک', instruction: 'فقط از همین بسته کار کن؛ اگر چیزی کم بود، بپرس و حدس نزن.', selection: { nodeIds: ['dn_sub', 'dn_ship'], facets: [], statuses: [], includeAssumptions: true }, createdAt: at(6, 10), updatedAt: at(6, 10) },
    { id: 'pk_demo_support', workspaceId: W, name: 'پاسخ به مشتری', instruction: 'لحن صمیمی و محترم؛ هیچ تخفیفی وعده نده.', selection: { nodeIds: ['dn_support'], facets: [], statuses: [], includeAssumptions: false }, createdAt: at(5, 10), updatedAt: at(4, 15) },
    { id: 'pk_demo_ws', workspaceId: W, name: 'کارگاه پاییز (با پیشنهادی‌ها)', instruction: 'پیشنهادی‌ها واقعیت نیستند؛ فقط برای ایده گرفتن‌اند.', selection: { nodeIds: ['dn_ws', 'dn_ws_prog'], facets: ['کارگاه'], statuses: ['Proposed'], includeAssumptions: false }, createdAt: at(3, 10), updatedAt: at(3, 10) },
  ];
  // ── a template of the user's own: the workshop branch ──
  const tpl = nodeTemplateOf('dn_ws', [...DEFAULT_TREE_NODES, ...nodes], objects);
  const templates = tpl ? [{ id: 'tpl_demo_workshop', kind: 'node' as const, name: 'قالب کارگاه', payload: tpl, at: at(2, 12) }] : [];
  // ── grey samples (examples of the SHAPE of an answer): not knowledge, never seen by an AI or an engine ──
  const samples = [
    { id: 'smp_demo_1', type: 'Constraint' as const, nodeId: 'dn_support', title: 'مثال: ساعات پاسخ‌گویی', content: 'مثال: پاسخ به پیام‌ها فقط ساعات اداری، شنبه تا چهارشنبه.', at: at(1, 9) },
    { id: 'smp_demo_2', type: 'Decision' as const, nodeId: 'dn_support', title: 'مثال: کانال پشتیبانی', content: 'مثال: پیام‌رسان اصلی و ایمیل برای فاکتور.', at: at(1, 9, 1) },
    { id: 'smp_demo_3', type: 'Fact' as const, nodeId: 'dn_ws', title: 'مثال: سطح شرکت‌کننده', content: 'مثال: بیشتر شرکت‌کننده‌ها قبلاً قهوه دم کرده‌اند ولی برشته نکرده‌اند.', at: at(1, 9, 2) },
  ];
  return { nodes, objects, versions, relationships, changes, notes, file, specs, deliverables, canvas, packs, templates, samples };
}
