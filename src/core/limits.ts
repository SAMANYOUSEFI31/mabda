/**
 * Fair-use limits: THE ONE PLACE for every number that caps what one person can use (CLAUDE.md rule 5).
 *
 * Goal: protect one shared server (its disk, and what the platform pays for non-generative models) so one person
 * cannot crowd out the others. These are NOT a plan: they are the same for everyone, carry no price and never ask
 * anyone to upgrade. The subscription model was removed (user decision, 2026-11-16); its economics are an open
 * question in docs/later.md. Every number is an assumption [فرض] until real use calibrates it; change them here only.
 * Check: `limits.test.ts` (readers follow the config, messages name the cap and a way out that is not a purchase).
 */
import { formatNumber } from '../ui/format';

export interface Limits { workspaces: number; maxObjects: number; storedTextPerPerson: number; fileTokensPerMonth: number; decisionJudgmentsPerDay: number; coachPerDay: number; chatPerDay: number; importTextChars: number }

/** (a plain object so a test can lower one number and see every reader follow it) */
export const LIMITS: Limits = {
  /** live workspaces per person (archived and the showcase do not count); the same cap applies to a restore */
  workspaces: 20,
  /** active Context objects per workspace (Archived/Superseded and sample objects do not count): an abuse guard, saving Context is free */
  maxObjects: 8_000,
  /** characters of text one person keeps across ALL their workspaces (knowledge, notes, thoughts, outputs, text read from files):
   *  the per-workspace caps multiply by `workspaces`, this one does not; it is what protects the shared disk */
  storedTextPerPerson: 30_000_000,
  /** tokens of extracted file text processed per workspace per month */
  fileTokensPerMonth: 1_500_000,
  /** decision-layer judgements per workspace per day (Gap ambiguity, semantic contradiction) the platform pays for */
  decisionJudgmentsPerDay: 400,
  /** Context Coach sessions per workspace per day */
  coachPerDay: 40,
  /** focused-chat turns per day before chat quietly moves to the lightest model (never blocked) */
  chatPerDay: 140,
  /** characters of one pasted answer from another tool («وارد کردن پاسخ ابزار دیگر»): one request, not a running total */
  importTextChars: 200_000,
};

export interface Meter {
  key: 'objects' | 'fileTokens' | 'judgments' | 'coach';
  label: string;
  used: number;
  limit: number;
  /** 0..1 (can exceed 1) */
  ratio: number;
  exceeded: boolean;
  /** shown as «نزدیک سقف» from this ratio */
  nearLimit: boolean;
  unit: string;
}

export interface UsageNumbers { objects: number; fileTokens: number; judgmentsToday: number; coachToday: number }

const meter = (key: Meter['key'], label: string, unit: string, used: number, limit: number): Meter => ({
  key, label, unit, used, limit, ratio: limit > 0 ? used / limit : 1, exceeded: used >= limit, nearLimit: limit > 0 && used / limit >= 0.8,
});

/** The four meters the usage panel shows, in a stable order. */
export function meters(u: UsageNumbers): Meter[] {
  return [
    meter('objects', 'دانش', 'مورد', u.objects, LIMITS.maxObjects),
    meter('fileTokens', 'پردازش فایل این ماه', 'توکن', u.fileTokens, LIMITS.fileTokensPerMonth),
    meter('judgments', 'قضاوت‌های امروز (لایهٔ تصمیم)', 'قضاوت', u.judgmentsToday, LIMITS.decisionJudgmentsPerDay),
    meter('coach', 'مربی دانش امروز', 'جلسه', u.coachToday, LIMITS.coachPerDay),
  ];
}

export const objectsRemaining = (activeObjects: number) => Math.max(0, LIMITS.maxObjects - activeObjects);

/** what to say when a cap is reached: the number, and a way out that is the person's own (archive), never a purchase */
export const workspaceLimitMessage = () => `${formatNumber(LIMITS.workspaces)} فضا داری و این سقف است؛ برای فضای تازه، اول یکی را بایگانی یا حذف کن.`;
export const storageLimitMessage = () => `متن‌هایی که در همهٔ فضاهایت نگه داشته‌ای به سقف ${formatNumber(LIMITS.storedTextPerPerson)} نویسه رسیده است؛ برای جای تازه، فایل، یادداشت یا فضایی را که لازم نداری حذف کن.`;
/** would adding `added` characters to what this person keeps (`stored`) pass the cap? Removing text is always allowed. */
export const storageAllows = (stored: number, added: number): boolean => added <= 0 || stored + added <= LIMITS.storedTextPerPerson;
/** checked in the dialog before sending and again on the server: the same sentence, with a way out (paste it in parts) */
export const importTextLimitMessage = () => `این متن از ${formatNumber(LIMITS.importTextChars)} نویسه بلندتر است؛ آن را در چند بخش جدا بچسبان و هر بار یکی را وارد کن.`;
export const objectLimitMessage = () => `این فضا ${formatNumber(LIMITS.maxObjects)} دانش فعال دارد و این سقف است؛ موارد قدیمی را بایگانی کن.`;

/** Today's chat count: a count recorded on another day is yesterday's, i.e. zero. `today` = YYYY-MM-DD (Tehran). */
export function chatCountToday(todayChatCount: number, chatCountDay: string | undefined, today: string): number {
  return chatCountDay === today ? todayChatCount : 0;
}

/** Fair-use chat: past the daily limit chat is NEVER blocked; it quietly runs on the lightest model until tomorrow. */
export function checkChatFairUse(todayChatCount: number): { isSoftExceeded: boolean; limit: number; remaining: number } {
  const limit = LIMITS.chatPerDay;
  return { isSoftExceeded: todayChatCount >= limit, limit, remaining: Math.max(0, limit - todayChatCount) };
}

export interface FileCharge {
  quota: number;
  usedBefore: number;
  remainingBefore: number;
  withinQuota: boolean;
  /** tokens of this file that fall beyond the monthly quota (processing is refused when > 0) */
  excessTokens: number;
}

/** Where processing a file of `tokens` stands against this month's quota. */
export function fileQuotaCheck(usedThisMonth: number, tokens: number): FileCharge {
  const quota = LIMITS.fileTokensPerMonth;
  const remainingBefore = Math.max(0, quota - usedThisMonth);
  const excessTokens = Math.max(0, tokens - remainingBefore);
  return { quota, usedBefore: usedThisMonth, remainingBefore, withinQuota: excessTokens === 0, excessTokens };
}
