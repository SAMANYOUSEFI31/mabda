/**
 * Metrics and «انتظار در برابر نتیجه» — recorded numbers next to the decisions made, WITHOUT any claim about cause.
 *
 *  • a Metric and a Measurement are not Context objects and never become facts; only the user's confirmed numbers are
 *    drawn, counted or packed (a value an AI suggested is `Proposed` until the user confirms it)
 *  • the comparison is arithmetic: the last number before / at the decision, the last number now, the target. The words
 *    are «پس از» and «انتظار در برابر نتیجه» — never «اثر» or «علت» (src/core/metricsText.ts, enforced by a test)
 *  • the verdict (met / partial / missed) is the user's; `suggestVerdict` only pre-selects the arithmetic reading
 * Pure.
 */

import type { ContextChange, ContextObject, Measurement, Metric, MetricDirection, MetricExpectation, ExpectationVerdict } from '../types';

const day = (iso: string) => iso.slice(0, 10);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // 2026-02-30 is not a date
};

const DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Persian / Arabic digits and separators → ASCII (so a number pasted from a Persian spreadsheet parses) */
export function normalizeNumeric(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[٫]/g, '.').replace(/[٬،]/g, ',').replace(/٪/g, '%');
}

/** a number from user text: «۱٬۲۰۰», «12.5», «35%» (the % sign is dropped; the unit lives on the Metric) */
export function parseNumber(raw: string): number | null {
  const t = normalizeNumeric(raw).trim().replace(/%$/, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ── series ────────────────────────────────────────────────────────────────

/** the confirmed numbers of one metric, oldest first (the only ones that are ever drawn, counted or packed) */
export function seriesOf(metricId: string, measurements: Measurement[]): Measurement[] {
  return measurements.filter((m) => m.metricId === metricId && m.status === 'Confirmed').sort((a, b) => a.at.localeCompare(b.at) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export const latestOf = (metricId: string, measurements: Measurement[]): Measurement | undefined => seriesOf(metricId, measurements).at(-1);
export const proposedMeasurements = (measurements: Measurement[]): Measurement[] => measurements.filter((m) => m.status === 'Proposed');

/** active metrics that have no confirmed number in the last `days` days — a quiet marker, never a reminder */
export function metricsWithoutRecentNumber(metrics: Metric[], measurements: Measurement[], now: Date | string | number, days = 7): Metric[] {
  const cutoff = day(new Date(new Date(now).getTime() - days * 86_400_000).toISOString());
  return metrics.filter((m) => !m.archived).filter((m) => (latestOf(m.id, measurements)?.at ?? '') < cutoff);
}

// ── decisions on the time line ─────────────────────────────────────────────

export interface DecisionMoment { id: string; title: string; /** YYYY-MM-DD */ at: string }
/**
 * When a decision was made = from the Change table: the first time it became Confirmed (created Confirmed,
 * proposal accepted, or a status change to Confirmed). A decision that never was Confirmed has no moment.
 */
export function decisionMoments(objects: ContextObject[], changes: Pick<ContextChange, 'objectId' | 'kind' | 'at' | 'after'>[]): DecisionMoment[] {
  const out: DecisionMoment[] = [];
  for (const o of objects) {
    if (o.type !== 'Decision' || o.sample) continue;
    const mine = changes.filter((c) => c.objectId === o.id).sort((a, b) => a.at.localeCompare(b.at));
    const first = mine.find((c) => c.kind === 'proposal_accepted' || ((c.kind === 'created' || c.kind === 'imported' || c.kind === 'status_changed') && c.after?.status === 'Confirmed'));
    if (first) out.push({ id: o.id, title: o.title, at: day(first.at) });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

// ── expectation versus result ─────────────────────────────────────────────

export type ExpectationState = 'no_data' | 'open' | 'due';
export interface ExpectationReading {
  state: ExpectationState;
  /** the last confirmed number on or before the decision day */
  before?: Measurement;
  /** the last confirmed number up to the `by` date (or up to now while still open) */
  after?: Measurement;
  /** after − before, when both exist */
  delta?: number;
  /** moved the way the expectation says (needs both numbers) */
  movedAsExpected?: boolean;
  /** the target (if any) is reached by the last number */
  reachedTarget?: boolean;
}

const better = (dir: MetricDirection, from: number, to: number) => (dir === 'up' ? to > from : to < from);
const reached = (dir: MetricDirection, target: number, value: number) => (dir === 'up' ? value >= target : value <= target);

/** the arithmetic of one decision's expectation. No cause is inferred: «پس از» is a position on the time line, nothing more. */
export function readExpectation(exp: MetricExpectation, decisionAt: string, measurements: Measurement[], now: Date | string | number): ExpectationReading {
  const series = seriesOf(exp.metricId, measurements);
  const today = day(new Date(now).toISOString());
  const decDay = day(decisionAt);
  const before = [...series].reverse().find((m) => m.at <= decDay);
  const upTo = exp.by <= today ? exp.by : today;
  const after = [...series].reverse().find((m) => m.at > decDay && m.at <= upTo) ?? undefined;
  const state: ExpectationState = exp.by <= today ? 'due' : 'open';
  if (!after) return { state: series.length === 0 ? 'no_data' : state, ...(before ? { before } : {}) };
  const reading: ExpectationReading = { state, ...(before ? { before } : {}), after };
  if (before) { reading.delta = Math.round((after.value - before.value) * 1e6) / 1e6; reading.movedAsExpected = better(exp.direction, before.value, after.value); }
  if (exp.targetValue !== undefined) reading.reachedTarget = reached(exp.direction, exp.targetValue, after.value);
  return reading;
}

/**
 * The arithmetic reading, offered as a PRE-SELECTION of the three buttons (the user decides):
 * target reached → met; moved the right way but short of the target → partial; otherwise missed. Without a target, moved → met.
 * `null` when there is not enough to read.
 */
export function suggestVerdict(reading: ExpectationReading): ExpectationVerdict | null {
  if (!reading.after) return null;
  if (reading.reachedTarget === true) return 'met';
  if (reading.movedAsExpected === true) return reading.reachedTarget === false ? 'partial' : 'met';
  if (reading.movedAsExpected === false) return 'missed';
  return reading.reachedTarget === false ? 'missed' : null;
}

export interface ExpectationRow { decision: ContextObject; moment?: DecisionMoment; expectation: MetricExpectation; metric?: Metric; reading: ExpectationReading; verdict?: ExpectationVerdict; verdictAt?: string }

/** the verdict a user wrote with «نتیجه چه شد؟» (latest outcome_noted change that carries one) */
export function verdictOf(decisionId: string, changes: Pick<ContextChange, 'objectId' | 'kind' | 'at' | 'after'>[]): { verdict: ExpectationVerdict; at: string } | undefined {
  const c = changes.filter((x) => x.objectId === decisionId && x.kind === 'outcome_noted' && isVerdict(x.after?.verdict)).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  return c ? { verdict: c.after!.verdict as ExpectationVerdict, at: c.at } : undefined;
}
export const isVerdict = (v: unknown): v is ExpectationVerdict => v === 'met' || v === 'partial' || v === 'missed';

/** every live Confirmed decision that carries a metric expectation, read against the numbers */
export function expectationRows(objects: ContextObject[], metrics: Metric[], measurements: Measurement[], changes: Pick<ContextChange, 'objectId' | 'kind' | 'at' | 'after'>[], now: Date | string | number): ExpectationRow[] {
  const moments = new Map(decisionMoments(objects, changes).map((m) => [m.id, m]));
  const rows: ExpectationRow[] = [];
  for (const o of objects) {
    const exp = o.record?.metricExpectation;
    if (o.type !== 'Decision' || o.sample || !exp || o.status === 'Archived' || o.status === 'Superseded' || o.status === 'Proposed') continue;
    const moment = moments.get(o.id);
    const v = verdictOf(o.id, changes);
    rows.push({ decision: o, ...(moment ? { moment } : {}), expectation: exp, ...(metrics.find((m) => m.id === exp.metricId) ? { metric: metrics.find((m) => m.id === exp.metricId)! } : {}), reading: readExpectation(exp, moment?.at ?? o.createdAt, measurements, now), ...(v ? { verdict: v.verdict, verdictAt: v.at } : {}) });
  }
  return rows.sort((a, b) => a.expectation.by.localeCompare(b.expectation.by) || a.decision.id.localeCompare(b.decision.id));
}

/** expectations whose date has come and that nobody has judged yet — the «بازبینی تصمیم» list */
export const expectationsDue = (rows: ExpectationRow[], now: Date | string | number): ExpectationRow[] => {
  const t = day(new Date(now).toISOString());
  return rows.filter((r) => !r.verdict && r.expectation.by <= t);
};

export interface VerdictTally { met: number; partial: number; missed: number; open: number }
/** the plain count shown on Home: judged ones by verdict, the rest still open */
export function verdictTally(rows: ExpectationRow[]): VerdictTally {
  const t: VerdictTally = { met: 0, partial: 0, missed: 0, open: 0 };
  for (const r of rows) { if (r.verdict) t[r.verdict]++; else t.open++; }
  return t;
}

// ── quick entry: CSV ────────────────────────────────────────────────────────

export interface CsvRow { metricId: string; value: number; at: string; note?: string }
export interface CsvResult { rows: CsvRow[]; errors: Array<{ line: number; text: string; reason: 'unknown_metric' | 'bad_value' | 'bad_date' | 'too_few' }> }

/**
 * Plain CSV (comma, semicolon, tab or Persian comma): `شاخص, عدد[, تاریخ[, یادداشت]]`. The date defaults to today
 * (YYYY-MM-DD or YYYY/MM/DD, Gregorian). A first line whose number column is not a number is a header and is skipped.
 */
export function parseMeasurementCsv(text: string, metrics: Metric[], today: string): CsvResult {
  const byName = new Map(metrics.filter((m) => !m.archived).map((m) => [m.name.trim().replace(/\s+/g, ' ').toLowerCase(), m.id]));
  const rows: CsvRow[] = []; const errors: CsvResult['errors'] = [];
  const lines = text.split(/\r?\n/);
  let seenData = false;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(/[,;\t،]/).map((c) => c.trim());
    if (cells.length < 2) { errors.push({ line: i + 1, text: line, reason: 'too_few' }); return; }
    const value = parseNumber(cells[1]);
    if (value === null && !seenData && i === lines.findIndex((l) => l.trim())) return; // header
    seenData = true;
    const metricId = byName.get(cells[0].replace(/\s+/g, ' ').toLowerCase());
    if (!metricId) { errors.push({ line: i + 1, text: line, reason: 'unknown_metric' }); return; }
    if (value === null) { errors.push({ line: i + 1, text: line, reason: 'bad_value' }); return; }
    const dateRaw = cells[2] ? normalizeNumeric(cells[2]).replace(/\//g, '-') : today;
    if (!isIsoDate(dateRaw)) { errors.push({ line: i + 1, text: line, reason: 'bad_date' }); return; }
    rows.push({ metricId, value, at: dateRaw, ...(cells[3] ? { note: cells.slice(3).join(', ').slice(0, 300) } : {}) });
  });
  return { rows, errors };
}

// ── the pack section ───────────────────────────────────────────────────────

const trim = (n: number) => String(Math.round(n * 1e4) / 1e4);
const unitOf = (m: Metric) => (m.unit ? ` ${m.unit}` : '');

/**
 * «اندازه‌گیری‌ها» for the pack: a separate section, only confirmed numbers, with the rule that these are recorded
 * numbers — not knowledge, and not a reason to infer cause from a decision sitting next to a number.
 */
export function metricsPackSection(metrics: Metric[], measurements: Measurement[], decisions: ContextObject[] = [], changes: Pick<ContextChange, 'objectId' | 'kind' | 'at' | 'after'>[] = [], now: Date = new Date()): string | null {
  const live = metrics.filter((m) => !m.archived);
  if (live.length === 0) return null;
  const lines = live.map((m) => {
    const last = seriesOf(m.id, measurements).slice(-4);
    const dir = m.direction === 'up' ? 'بالاتر بهتر است' : 'پایین‌تر بهتر است';
    const head = `- **${m.name}**${m.unit ? ` (${m.unit})` : ''} — ${dir}${m.target !== undefined ? `؛ هدف: ${trim(m.target)}${unitOf(m)}` : ''}`;
    return last.length ? `${head}\n  آخرین اعداد: ${last.map((x) => `${x.at}: ${trim(x.value)}`).join('، ')}` : `${head}\n  هنوز عددی ثبت نشده.`;
  });
  const exps = expectationRows(decisions, metrics, measurements, changes, now).filter((r) => r.metric && !r.metric.archived);
  const expLines = exps.map((r) => {
    const m = r.metric!;
    const goal = `${m.direction === 'up' ? 'بالا برود' : 'پایین بیاید'}${r.expectation.targetValue !== undefined ? ` تا ${trim(r.expectation.targetValue)}${unitOf(m)}` : ''} تا ${r.expectation.by}`;
    const seen = r.reading.after ? `؛ آخرین عدد: ${trim(r.reading.after.value)} در ${r.reading.after.at}` : '';
    return `- تصمیم «${r.decision.title}» — انتظار: «${m.name}» ${goal}${seen}${r.verdict ? `؛ داوری کاربر: ${{ met: 'به انتظار رسید', partial: 'نیمه', missed: 'نرسید' }[r.verdict]}` : ''}`;
  });
  return [
    '## اندازه‌گیری‌ها (اعداد ثبت‌شدهٔ کاربر)',
    'این‌ها فقط اعدادی‌اند که کاربر خودش ثبت کرده؛ دانش تأییدشده نیستند. از کنار هم قرار گرفتن یک عدد و یک تصمیم، رابطهٔ علت‌ومعلولی نتیجه نگیر و چنین ادعایی ننویس.',
    '',
    ...lines,
    ...(expLines.length ? ['', '### انتظارها در برابر اعداد', ...expLines] : []),
  ].join('\n');
}
