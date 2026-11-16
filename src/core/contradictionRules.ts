/**
 * CORE-07: domain rules for certain contradictions, kept apart from the engine (contextEngine.ts detectContradictions) and
 * configurable. The engine only knows «one side says X, the other says Y»; what X and Y are for pricing, delivery or anything
 * else lives in a rule pack. A workspace about something else can pass its own pack (or none) without touching the engine.
 *
 * A rule: `says` matches the claim that forbids, `contradictedBy` the claim that does it anyway. Both are read on the
 * normalised content (normalizeFa) with Latin digits, so «۲۰٪» and «20%» are the same.
 */
export interface ContradictionRule {
  id: string;
  says: RegExp;
  contradictedBy: RegExp;
  /** a sentence that matches `contradictedBy` but also this does NOT do it («حتی تخفیف ۱۰٪ هم نمی‌دهیم» refuses, it does not define) */
  unless?: RegExp;
  reason: string;
  suggestedResolution: string;
}
export type RulePack = readonly ContradictionRule[];

/** the pricing pack: «تخفیف نداریم» against a discount that is defined anyway */
export const PRICING_RULES: RulePack = [
  {
    id: 'no_discount',
    says: /تخفیف نداریم|بدون تخفیف|تخفیف نمی(‌|\s)?دهیم/,
    contradictedBy: /تخفیف\s*\d+\s*(٪|%|درصد)|آفر رایگان|تخفیف ویژه/,
    unless: /نمی(‌|\s)?(دهیم|دهم|کنیم|شود)|نداریم|ندارد|نیست|نخواهیم/,
    reason: 'تناقض با مرز قیمت‌گذاری: در خط قرمزها ذکر شده «تخفیف نداریم»، اما در مورد دیگری تخفیف تعریف شده است.',
    suggestedResolution: 'خط قرمز عدم تخفیف را اصلاح کن یا مورد تخفیف‌دار را از حالت تأییدشده خارج کن.',
  },
];

/** what the engine uses when no pack is given */
export const DEFAULT_RULE_PACK: RulePack = PRICING_RULES;

/** does this text do what the rule forbids? Sentence by sentence: a sentence that only mentions it to refuse it does not count */
export function doesIt(r: ContradictionRule, text: string): boolean {
  if (!r.unless) return r.contradictedBy.test(text);
  return text.split(/[.!؟?؛\n]+/).some((sentence) => r.contradictedBy.test(sentence) && !r.unless!.test(sentence));
}
