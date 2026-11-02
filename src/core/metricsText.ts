/**
 * Every sentence the metrics UI shows. Kept in one place so a test can prove that none of them claims a cause:
 * the vocabulary is «پس از» (a position on the time line) and «انتظار در برابر نتیجه» (what we expected, what the number is).
 */

import type { ExpectationVerdict, MetricDirection } from '../types';

export const MX = {
  navTitle: 'شاخص‌ها',
  pageTitle: 'شاخص‌ها و اعداد واقعی',
  pageIntro: 'عددهایی که خودت دنبال می‌کنی. مبدأ فقط کنار هم می‌گذارد: چه زمانی تصمیمی ثبت شد و عدد بعد از آن چه بود.',
  emptyTitle: 'هنوز شاخصی نداری',
  emptyBody: 'یک شاخص بساز، مثلاً «فروش هفتگی». ثبت عدد هیچ‌وقت اجباری نیست.',
  newMetric: 'شاخص تازه',
  name: 'نام شاخص',
  unit: 'واحد',
  directionLabel: 'کدام سمت بهتر است؟',
  target: 'هدف (اختیاری)',
  save: 'ذخیره',
  archive: 'بایگانی شاخص',
  thisWeek: 'عدد این هفته',
  thisWeekHint: 'هر کدام را که داری بنویس؛ خالی بماند مشکلی نیست.',
  record: 'ثبت اعداد',
  pasteCsv: 'چسباندن CSV',
  csvHint: 'هر خط: نام شاخص، عدد، تاریخ (اختیاری)، یادداشت (اختیاری)',
  csvApply: 'ثبت خطوط درست',
  chartTitle: 'نمودار و تصمیم‌ها',
  chartNote: 'خط عمودی یعنی روز ثبت یک تصمیم. این نمودار فقط ترتیب زمانی را نشان می‌دهد.',
  targetLine: 'هدف',
  noNumbers: 'هنوز عددی ثبت نشده.',
  quiet: 'مدتی است عددی ثبت نشده.',
  expectationsTitle: 'انتظار در برابر نتیجه',
  expectationsBody: 'برای هر تصمیم، آنچه انتظار داشتی کنار عددی که ثبت شده است.',
  reviewTitle: 'بازبینی تصمیم‌ها',
  reviewDueHint: 'موعد این انتظارها رسیده است.',
  verdictQuestion: 'نتیجه چه شد؟',
  proposedTitle: 'اعداد پیشنهادی از AI',
  proposedHint: 'تا تأیید نکنی در نمودار و بسته نمی‌آیند.',
  confirm: 'تأیید عدد',
  reject: 'حذف',
  expectationField: 'انتظار از یک شاخص (اختیاری)',
  expectationMetric: 'شاخص',
  expectationBy: 'تا تاریخ',
  expectationTarget: 'مقدار هدف (اختیاری)',
  expectationNone: 'بدون انتظار عددی',
  homeTitle: 'انتظار در برابر نتیجه',
} as const;

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
export const allMetricTexts = (): string[] => [...Object.values(MX), ...Object.values(DIRECTION_FA), ...Object.values(VERDICT_FA),
  afterSentence({ decision: 'x', before: '1', after: '2', unit: 'u' }), afterSentence({ decision: 'x' }), afterSentence({ decision: 'x', after: '2' }),
  expectationSentence({ metric: 'm', direction: 'up', target: '1', unit: 'u', by: 'd' }), expectationSentence({ metric: 'm', direction: 'down', by: 'd' })];
