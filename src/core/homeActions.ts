/**
 * «الان چه کاری ارزش دارد؟» — the home page shows at most THREE things, each one sentence and one button; everything else waits
 * under «همه (N)». The ranking is a pure function of what the engines already computed (nothing new is detected here):
 *
 *   خروجی به‌روز نیست (اخیراً ساخته‌شده بالاتر) › تناقض › دانشی که به‌خاطر تغییر نیاز به نگاه دارد › تصمیم آماده ›
 *   پیشنهادهای منتظر › بازبینی هفتگی سررسید › مواردی که موعدشان رسیده
 *
 * One item per kind goes to the top (three different kinds beat three stale outputs); the rest are listed in «همه».
 */

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

export function homeActions(input: HomeInput): { top: HomeAction[]; rest: HomeAction[]; total: number } {
  const all: HomeAction[] = [];
  const titleOfAsset = new Map(input.deliverables.map((d) => [d.id, d]));
  for (const s of input.stale) {
    const d = titleOfAsset.get(s.deliverableId);
    if (!d) continue;
    const recent = input.now.getTime() - new Date(d.createdAt).getTime() <= RECENT_DAYS * 86_400_000;
    all.push({ id: `stale:${d.id}`, kind: 'stale', text: `خروجی ${q(d.title)} دیگر به‌روز نیست${s.reasons[0] ? `: ${s.reasons[0].message}` : '.'}`, button: 'ببین', target: { type: 'asset', id: d.id }, score: recent ? 95 : 70 });
  }
  for (const c of input.contradictions) all.push({ id: `contradiction:${c.id}`, kind: 'contradiction', text: `${q(c.titleA)} و ${q(c.titleB)} با هم نمی‌خوانند.`, button: 'بررسی', target: { type: 'contradictions' }, score: 85 });
  for (const r of input.reviews) all.push({ id: `review:${r.id}`, kind: 'review', text: `${q(r.title)} به‌خاطر تغییر ${r.because.map(q).join('، ')} نیاز به نگاه دارد.`, button: 'باز کن', target: { type: 'object', id: r.id }, score: 80 });
  for (const d of input.ready) all.push({ id: `ready:${d.id}`, kind: 'ready', text: `تصمیم ${q(d.title)} آماده است؛ هرچه به آن تکیه دارد تأیید شده.`, button: 'تصمیم بگیر', target: { type: 'object', id: d.id }, score: 70 });
  if (input.proposedCount > 0) all.push({ id: 'proposals', kind: 'proposals', text: `${fa(input.proposedCount)} پیشنهاد منتظر تأیید توست.`, button: 'مرور کن', target: { type: 'proposals' }, score: 60 });
  if (input.weekly.due) all.push({ id: 'weekly', kind: 'weekly', text: `بازبینی هفتگی: ${fa(input.weekly.changes)} تغییر در این هفته بوده.`, button: 'شروع (۵ دقیقه)', target: { type: 'weekly' }, score: 55 });
  if (input.dueCount > 0) all.push({ id: 'due', kind: 'due', text: `${fa(input.dueCount)} مورد موعد بازبینی دارد.`, button: 'ببین', target: { type: 'due' }, score: 50 });

  if ((input.openThinking ?? 0) > 0) all.push({ id: 'thinking', kind: 'thinking', text: `${fa(input.openThinking!)} سؤال یا تصمیم باز در یادداشت‌هایت مانده است.`, button: 'ببین', target: { type: 'thinking' }, score: 45 });

  all.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const seen = new Set<HomeActionKind>();
  const top: HomeAction[] = [];
  for (const a of all) { if (top.length < HOME_TOP && !seen.has(a.kind)) { top.push(a); seen.add(a.kind); } }
  const rest = all.filter((a) => !top.includes(a));
  return { top, rest, total: all.length };
}
