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

export type HomeActionKind = 'stale' | 'contradiction' | 'review' | 'ready' | 'proposals' | 'weekly' | 'due' | 'thinking';
export type HomeTarget = { type: 'asset' | 'object'; id: string } | { type: 'contradictions' | 'proposals' | 'weekly' | 'due' | 'thinking' };
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
  weekly: { due: boolean; changes: number };
  dueCount: number;
  /** open questions and open decisions written in notes (a line that ends with «؟» counts) that have not become knowledge */
  openThinking?: number;
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
    all.push({ id: `stale:${d.id}`, kind: 'stale', text: `خروجی ${q(d.title)} دیگر به‌روز نیست${s.reasons[0] ? `: ${s.reasons[0].message}` : '.'}`, button: 'ببین', target: { type: 'asset', id: d.id }, score: recent ? 95 : 70 });
  }
  // two items often share a title («اجارهٔ ماهانه» written twice with different amounts): then the sentence names it once
  for (const c of input.contradictions) all.push({ id: `contradiction:${c.id}`, kind: 'contradiction', text: c.titleA.trim() === c.titleB.trim() ? `دو مورد ${q(c.titleA)} با هم نمی‌خوانند.` : `${q(c.titleA)} و ${q(c.titleB)} با هم نمی‌خوانند.`, button: 'بررسی', target: { type: 'contradictions' }, score: 85 });
  for (const r of input.reviews) all.push({ id: `review:${r.id}`, kind: 'review', text: `${q(r.title)} به‌خاطر تغییر ${r.because.map(q).join('، ')} نیاز به نگاه دارد.`, button: 'باز کن', target: { type: 'object', id: r.id }, score: 80 });
  for (const d of input.ready) all.push({ id: `ready:${d.id}`, kind: 'ready', text: `تصمیم ${q(d.title)} آماده است؛ هرچه به آن تکیه دارد تأیید شده.`, button: 'تصمیم بگیر', target: { type: 'object', id: d.id }, score: 70 });
  if (input.proposedCount > 0) all.push({ id: 'proposals', kind: 'proposals', text: `${fa(input.proposedCount)} پیشنهاد منتظر تأیید توست.`, button: 'مرور کن', target: { type: 'proposals' }, score: 60 });
  if (input.weekly.due) all.push({ id: 'weekly', kind: 'weekly', text: `بازبینی هفتگی: ${fa(input.weekly.changes)} تغییر در این هفته بوده.`, button: 'شروع (۵ دقیقه)', target: { type: 'weekly' }, score: 55 });
  if (input.dueCount > 0) all.push({ id: 'due', kind: 'due', text: `${fa(input.dueCount)} مورد موعد بازبینی دارد.`, button: 'ببین', target: { type: 'due' }, score: 50 });

  if ((input.openThinking ?? 0) > 0) all.push({ id: 'thinking', kind: 'thinking', text: `${fa(input.openThinking!)} سؤال یا تصمیم باز در یادداشت‌هایت مانده است.`, button: 'ببین', target: { type: 'thinking' }, score: 45 });

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

/** answering a gap from home: a new truth already bound to that gap (its slot), in its place, for her to write and save. A gap
 *  says nothing about its kind («حساسیت‌ها» is not a decision), so it starts as «واقعیت», the plainest; she can change it there */
export function gapDraft(gap: Pick<GapItem, 'key' | 'label' | 'nodeId'>, workspaceId: string, now = new Date().toISOString()): ContextObject {
  return {
    id: '', workspaceId, type: 'Fact', status: 'Confirmed', provenance: 'User Input',
    title: gap.label, content: '', nodeId: gap.nodeId, slotKey: gap.key, version: 1, createdAt: now, updatedAt: now,
  };
}
