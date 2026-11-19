/**
 * Every sentence the metrics UI shows. Kept in one place so a test can prove that none of them claims a cause:
 * the vocabulary is «پس از» (a position on the time line) and «انتظار در برابر نتیجه» (what we expected, what the number is).
 */

import type { ExpectationVerdict, MetricCadence, MetricDirection } from '../types';

export const MX = {
  // «پایش»: an option on a truth (docs/product-scope.md). Words fit «وزن», «پس‌انداز» and «پیشرفت پایان‌نامه» as well as «فروش ماهانه»
  monitorToggle: 'پایش این عدد (اختیاری)',
  monitorTitle: 'پایش',
  monitorHint: 'عدد را اینجا ثبت کن، نه در متن حقیقت؛ نمودار، تاریخچهٔ همین عدد است.',
  linkFrom: 'از عددهایی که قبلاً ثبت کرده‌ای',
  linkNone: 'عدد تازه',
  unit: 'واحد',
  unitHint: 'مثلاً کیلو، میلیون تومان، صفحه، درصد',
  cadence: 'هر چند وقت تازه می‌شود؟',
  cadenceNone: 'یادآوری نکن',
  directionLabel: 'کدام سمت بهتر است؟',
  target: 'هدف (اختیاری)',
  firstValue: 'عدد امروز (اختیاری)',
  newValue: 'عدد امروز',
  record: 'ثبت',
  stop: 'قطع پایش',
  stopHint: 'عددهای ثبت‌شده و انتظار تصمیم‌ها می‌مانند.',
  last: 'آخرین عدد',
  thisWeek: 'عددهای این هفته',
  thisWeekHint: 'هر کدام را که داری بنویس؛ خالی بماند مشکلی نیست.',
  recordAll: 'ثبت عددها',
  pasteCsv: 'چسباندن CSV',
  csvHint: 'هر خط: نام، عدد، تاریخ (اختیاری)، یادداشت (اختیاری)',
  csvApply: 'ثبت خطوط درست',
  chartNote: 'خط عمودی یعنی روز ثبت یک تصمیم. این نمودار فقط ترتیب زمانی را نشان می‌دهد.',
  targetLine: 'هدف',
  noNumbers: 'هنوز عددی ثبت نشده.',
  expectationsTitle: 'انتظار در برابر نتیجه',
  expectationsBody: 'برای هر تصمیم، آنچه انتظار داشتی کنار عددی که ثبت شده است.',
  verdictQuestion: 'نتیجه چه شد؟',
  expectationField: 'انتظار از یک عدد پایش‌شده (اختیاری)',
  expectationMetric: 'کدام عدد؟',
  expectationBy: 'تا تاریخ',
  expectationTarget: 'مقدار هدف (اختیاری)',
  expectationNone: 'بدون انتظار عددی',
  expectationEmpty: 'هنوز هیچ حقیقتی پایش ندارد؛ روی یک حقیقت، در «جزئیات بیشتر»، «پایش این عدد» را روشن کن.',
  homeTitle: 'انتظار در برابر نتیجه',
} as const;

export const CADENCE_FA: Record<MetricCadence, string> = { week: 'هفتگی', month: 'ماهانه' };

export const DIRECTION_FA: Record<MetricDirection, string> = { up: 'بالاتر بهتر است', down: 'پایین‌تر بهتر است' };
export const VERDICT_FA: Record<ExpectationVerdict, string> = { met: 'به انتظار رسید', partial: 'نیمه', missed: 'نرسید' };

/** «پس از» sentence: `before` → `after` (numbers formatted by the caller), never a reason */
export function afterSentence(args: { decision: string; before?: string; after?: string; unit?: string }): string {
  const u = args.unit ? ` ${args.unit}` : '';
  if (args.after === undefined) return `پس از «${args.decision}» هنوز عددی ثبت نشده.`;
  return args.before === undefined ? `پس از «${args.decision}»: ${args.after}${u}.` : `پس از «${args.decision}»: از ${args.before}${u} به ${args.after}${u}.`;
}

export function expectationSentence(args: { metric: string; direction: MetricDirection; target?: string; unit?: string; by: string }): string {
  const u = args.unit ? ` ${args.unit}` : '';
  return `انتظار: «${args.metric}» ${args.direction === 'up' ? 'بالا برود' : 'پایین بیاید'}${args.target !== undefined ? ` تا ${args.target}${u}` : ''} تا ${args.by}.`;
}

/** all fixed texts, for the no-causal-claim test */
export const allMetricTexts = (): string[] => [...Object.values(MX), ...Object.values(CADENCE_FA), ...Object.values(DIRECTION_FA), ...Object.values(VERDICT_FA),
  afterSentence({ decision: 'x', before: '1', after: '2', unit: 'u' }), afterSentence({ decision: 'x' }), afterSentence({ decision: 'x', after: '2' }),
  expectationSentence({ metric: 'm', direction: 'up', target: '1', unit: 'u', by: 'd' }), expectationSentence({ metric: 'm', direction: 'down', by: 'd' })];
