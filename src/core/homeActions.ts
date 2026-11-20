/**
 * «الان چه کاری ارزش دارد؟» — the home page shows at most THREE things, each one sentence and one button; everything else waits
 * under «همه (N)». The ranking is a pure function of what the engines already computed (nothing new is detected here):
 *
 *   خروجی به‌روز نیست (اخیراً ساخته‌شده بالاتر) › تناقض › دانشی که به‌خاطر تغییر نیاز به نگاه دارد › تصمیم آماده ›
 *   پیشنهادهای منتظر › بازبینی هفتگی سررسید › مواردی که موعدشان رسیده
 *
 * One item per kind goes to the top (three different kinds beat three stale outputs); the rest are listed in «همه».
 */

import type { ContextObject, GapItem } from '../types';
import { formatNumber } from '../ui/format';

export type HomeActionKind = 'stale' | 'contradiction' | 'review' | 'ready' | 'proposals' | 'weekly' | 'due' | 'thinking' | 'monitor' | 'unlinked' | 'drafts';
export type HomeTarget = { type: 'asset' | 'object' | 'link-metric'; id: string } | { type: 'contradictions' | 'proposals' | 'weekly' | 'due' | 'thinking' };
export interface HomeAction { id: string; kind: HomeActionKind; text: string; button: string; target: HomeTarget; score: number }

export interface HomeInput {
  now: Date;
  /** outputs that are no longer up to date, with the reasons the impact engine gave */
  stale: Array<{ deliverableId: string; reasons: Array<{ message: string }> }>;
  deliverables: Array<{ id: string; title: string; createdAt: string }>;
  contradictions: Array<{ id: string; titleA: string; titleB: string; idA: string }>;
  reviews: Array<{ id: string; title: string; because: string[] }>;
  /** decisions that can be decided now (everything they rest on is confirmed) */
  ready: Array<{ id: string; title: string }>;
  proposedCount: number;
  /** rewrites of confirmed truths that wait for approval (a draft on the truth): decided in «فکر», named here (decisions.md §۴۹) */
  draftCount?: number;
  /** the waiting draft when there is exactly ONE: Home opens that truth directly instead of a list of one (decisions.md §۵۱) */
  draftOne?: { id: string; title: string };
  weekly: { due: boolean; changes: number };
  dueCount: number;
  /** open questions and open decisions written in notes (a line that ends with «؟» counts) that have not become knowledge */
  openThinking?: number;
  /** «پایش»: monitored truths whose cadence has passed since the last number (the calm upkeep, like expiry and assumptions) */
  monitors?: Array<{ objectId: string; title: string; cadence: 'week' | 'month'; never: boolean }>;
  /** numbers made before monitoring moved onto truths and not linked to one yet: the person links each one herself */
  unlinked?: Array<{ id: string; name: string }>;
}

export const HOME_TOP = 3;
const RECENT_DAYS = 30;
const q = (t: string) => `«${t}»`;
const fa = (n: number) => formatNumber(n);

function allActions(input: HomeInput): HomeAction[] {
  const all: HomeAction[] = [];
  const titleOfAsset = new Map(input.deliverables.map((d) => [d.id, d]));
  for (const s of input.stale) {
    const d = titleOfAsset.get(s.deliverableId);
    if (!d) continue;
    const recent = input.now.getTime() - new Date(d.createdAt).getTime() <= RECENT_DAYS * 86_400_000;
    all.push({ id: `stale:${d.id}`, kind: 'stale', text: `خروجی ${q(d.title)} دیگر به‌روز نیست${s.reasons[0] ? `: ${s.reasons[0].message}` : '.'}`, button: 'باز کردن', target: { type: 'asset', id: d.id }, score: recent ? 95 : 70 });
  }
  // two items often share a title («اجارهٔ ماهانه» written twice with different amounts): then the sentence names it once
  for (const c of input.contradictions) all.push({ id: `contradiction:${c.id}`, kind: 'contradiction', text: c.titleA.trim() === c.titleB.trim() ? `دو مورد ${q(c.titleA)} با هم نمی‌خوانند.` : `${q(c.titleA)} و ${q(c.titleB)} با هم نمی‌خوانند.`, button: 'بررسی', target: { type: 'contradictions' }, score: 85 });
  for (const r of input.reviews) all.push({ id: `review:${r.id}`, kind: 'review', text: `${q(r.title)} به‌خاطر تغییر ${r.because.map(q).join('، ')} نیاز به نگاه دارد.`, button: 'باز کردن', target: { type: 'object', id: r.id }, score: 80 });
  for (const d of input.ready) all.push({ id: `ready:${d.id}`, kind: 'ready', text: `تصمیم ${q(d.title)} آماده است؛ هرچه به آن تکیه دارد تأیید شده.`, button: 'تصمیم بگیر', target: { type: 'object', id: d.id }, score: 70 });
  if (input.proposedCount > 0) all.push({ id: 'proposals', kind: 'proposals', text: `${fa(input.proposedCount)} پیشنهاد منتظر تأیید توست.`, button: 'مرور کن', target: { type: 'proposals' }, score: 60 });
  // a waiting rewrite of a truth is a decision like a proposal; its only place to decide is «فکر» (that is where the before and after are)
  if (input.draftCount === 1 && input.draftOne) all.push({ id: 'drafts', kind: 'drafts', text: `تغییر ${q(input.draftOne.title)} منتظر تأیید توست.`, button: 'باز کن', target: { type: 'object', id: input.draftOne.id }, score: 61 });
  else if ((input.draftCount ?? 0) > 0) all.push({ id: 'drafts', kind: 'drafts', text: `${fa(input.draftCount!)} تغییر روی حقیقت‌هایت منتظر تأیید توست.`, button: 'مرور کن', target: { type: 'thinking' }, score: 61 });
  if (input.weekly.due) all.push({ id: 'weekly', kind: 'weekly', text: `بازبینی هفتگی: ${fa(input.weekly.changes)} تغییر در این هفته بوده.`, button: 'شروع (۵ دقیقه)', target: { type: 'weekly' }, score: 55 });
  if (input.dueCount > 0) all.push({ id: 'due', kind: 'due', text: `${fa(input.dueCount)} مورد موعد بازبینی دارد.`, button: 'باز کردن', target: { type: 'due' }, score: 50 });

  // a number is part of keeping a truth current: quiet, below the decisions that wait for her, one sentence and one button
  for (const m of input.monitors ?? []) all.push({ id: `monitor:${m.objectId}`, kind: 'monitor', text: m.never ? `برای ${q(m.title)} هنوز عددی ثبت نشده.` : `عدد ${q(m.title)} ${m.cadence === 'week' ? 'این هفته' : 'این ماه'} هنوز ثبت نشده.`, button: 'ثبت عدد', target: { type: 'object', id: m.objectId }, score: 48 });
  for (const m of input.unlinked ?? []) all.push({ id: `unlinked:${m.id}`, kind: 'unlinked', text: `عددهای ${q(m.name)} هنوز به حقیقتی وصل نیستند.`, button: 'وصل کردن', target: { type: 'link-metric', id: m.id }, score: 40 });
  if ((input.openThinking ?? 0) > 0) all.push({ id: 'thinking', kind: 'thinking', text: `${fa(input.openThinking!)} سؤال یا تصمیم باز در یادداشت‌هایت مانده است.`, button: 'باز کردن', target: { type: 'thinking' }, score: 45 });

  all.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return all;
}

export function homeActions(input: HomeInput): { top: HomeAction[]; rest: HomeAction[]; total: number } {
  const all = allActions(input);
  const seen = new Set<HomeActionKind>();
  const top: HomeAction[] = [];
  for (const a of all) { if (top.length < HOME_TOP && !seen.has(a.kind)) { top.push(a); seen.add(a.kind); } }
  const rest = all.filter((a) => !top.includes(a));
  return { top, rest, total: all.length };
}

/**
 * The home page in the order of patterns.md §۸: «منتظر تو» (what waits for her decision: proposals, contradictions, reviews,
 * ready decisions, due items, open questions, the weekly review), «چه چیزی کم است» (the required gaps), «قدیمی‌شده‌ها» (outputs
 * that are no longer up to date). Each list is ranked best first; a section with nothing in it is not shown.
 */
export interface HomeSections { waiting: HomeAction[]; missing: Array<Pick<GapItem, 'key' | 'label' | 'question' | 'nodeId' | 'importance'>>; stale: HomeAction[]; empty: boolean }

export function homeSections(input: HomeInput, gaps: Array<Pick<GapItem, 'key' | 'label' | 'question' | 'nodeId' | 'importance' | 'status'>>): HomeSections {
  const all = allActions(input);
  const waiting = all.filter((a) => a.kind !== 'stale');
  const stale = all.filter((a) => a.kind === 'stale');
  const missing = gaps.filter((g) => g.status !== 'confirmed').map(({ key, label, question, nodeId, importance }) => ({ key, label, question, nodeId, importance }));
  return { waiting, missing, stale, empty: waiting.length + missing.length + stale.length === 0 };
}

/**
 * UX-01: the home has two places to answer a gap (the top «چه چیزی کم است» and the full list under «جزئیات بیشتر»). Both make
 * the SAME knowledge: before, the top made a «واقعیت» and the list below silently made a «تصمیم» for a required gap.
 */
export function gapAnswer(gap: Pick<GapItem, 'key' | 'label' | 'nodeId'>, answer: string, workspaceId: string): Omit<ContextObject, 'id' | 'version' | 'createdAt' | 'updatedAt'> {
  const { id: _id, version: _v, createdAt: _c, updatedAt: _u, ...rest } = gapDraft(gap, workspaceId);
  return { ...rest, content: answer };
}

/** answering a gap from home: a new truth already bound to that gap (its slot), in its place, for her to write and save. A gap
 *  says nothing about its kind («حساسیت‌ها» is not a decision), so it starts as «واقعیت», the plainest; she can change it there */
export function gapDraft(gap: Pick<GapItem, 'key' | 'label' | 'nodeId'>, workspaceId: string, now = new Date().toISOString()): ContextObject {
  return {
    id: '', workspaceId, type: 'Fact', status: 'Confirmed', provenance: 'User Input',
    title: gap.label, content: '', nodeId: gap.nodeId, slotKey: gap.key, version: 1, createdAt: now, updatedAt: now,
  };
}
