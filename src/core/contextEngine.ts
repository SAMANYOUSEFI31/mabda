/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { blockedPairs } from './pairBlocking';
import {  ContextObject,
  ContextRelationship,
  Contradiction,
  GapItem,
  ReadinessResult,
  TreeNode,
  WorkstreamSpec,
} from '../types';
import { isValidKnowledge } from './validity';
import { governanceOf } from './coGoverning';
import type { GovernanceInput } from './coGoverning';
import { DEFAULT_RULE_PACK, doesIt } from './contradictionRules';
import type { RulePack } from './contradictionRules';

/**
 * Returns parent chain for a node to resolve context inheritance:
 * e.g. a node → [node, its parent, … its root] (the tree is the workspace's own)
 */
export function getAncestorNodeIds(nodeId: string, nodes: TreeNode[]): string[] {
  const result: string[] = [nodeId];
  let current = nodes.find((n) => n.id === nodeId);
  while (current && current.parentId) {
    result.push(current.parentId);
    current = nodes.find((n) => n.id === current?.parentId);
  }
  return result;
}


/** What the decision layer said about one object version: is it too vague to build on? */
export interface AmbiguityJudgment {
  version: number;
  ambiguous: boolean;
  reason: string;
}
export type AmbiguityMap = Record<string, AmbiguityJudgment>;

// one definition of valid knowledge (validity.ts): an expired item never fills a gap or makes a workstream ready
const activeOf = (objects: ContextObject[], now: Date | string | number = Date.now()) => objects.filter((o) => isValidKnowledge(o, now));

/** Persian-aware normalisation for title matching: ی/ک variants, ZWNJ, diacritics, case, spacing. */
export function normalizeFa(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u0654]/g, '') // harakat + hamza-above (حوزهٔ -> حوزه)
    .replace(/\u200c/g, ' ') // ZWNJ
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // «۵۰۰» and «500» are the same number
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** «مخاطب اصلی» -> «مخاطب اصلی» : the part of a label a human would actually type as a title. */
const labelCore = (label: string) => normalizeFa(label.replace(/\([^)]*\)/g, ''));

/**
 * Does this object fill that required/suggested item?
 *  1. an object with an explicit `slotKey` fills exactly the item whose `key` equals it — and no other (the binding the
 *     Gap answer flow and proposal writes);
 *  2. only an object WITHOUT a slotKey (legacy data) is matched by TITLE (the item's label core).
 * Living in the same node, or mentioning the item's key in the text, never counts.
 */
export function fillsItem(req: { key?: string; label: string }, o: ContextObject): boolean {
  if (o.content.trim().length === 0) return false;
  if (o.slotKey) return !!req.key && o.slotKey === req.key;
  const title = normalizeFa(o.title);
  const core = labelCore(req.label);
  if (core.length === 0) return false;
  return title.includes(core) || normalizeFa(req.label) === title;
}

/** The object that fills a required item, if any (same matching rule the readiness uses). Confirmed wins over Proposed; an explicit slot wins over a title match. */
export function findForRequired(req: { key?: string; label: string }, objects: ContextObject[], now: Date | string | number = Date.now()): ContextObject | undefined {
  const rank = (o: ContextObject) => (o.status === 'Confirmed' && !o.assumption ? 0 : o.status === 'Confirmed' || o.status === 'Proposed' ? 1 : 2); // an assumption never counts as established
  return activeOf(objects, now)
    .filter((o) => fillsItem(req, o))
    .sort((a, b) => Number(!!b.slotKey) - Number(!!a.slotKey) || rank(a) - rank(b))[0];
}

/** Objects whose ambiguity is worth judging for this spec: the ones that fill required items. */
export function objectsToJudge(spec: WorkstreamSpec, objects: ContextObject[]): ContextObject[] {
  const seen = new Map<string, ContextObject>();
  for (const req of spec.requiredContext) {
    const f = findForRequired(req, objects);
    if (f) seen.set(f.id, f);
  }
  return [...seen.values()];
}

/**
 * Analyzes gaps and calculates readiness for a specific Workstream spec.
 * «مبهم» is a semantic judgement: it comes from the decision layer (`ambiguity`, per object version) or from the
 * user's own «Needs Review» status — never from how long the text is.
 */
export function calculateReadinessAndGaps(
  spec: WorkstreamSpec,
  objects: ContextObject[],
  _relationships: ContextRelationship[] = [],
  ambiguity: AmbiguityMap = {},
  now: Date | string | number = Date.now()
): ReadinessResult {
  const activeObjects = activeOf(objects, now);

  const gaps: GapItem[] = [];
  let confirmedRequiredCount = 0;

  // 1. Check Required Contexts
  for (const req of spec.requiredContext) {
    const found = findForRequired(req, objects, now);
    const judged = found && ambiguity[found.id]?.version === found.version ? ambiguity[found.id] : undefined;

    if (!found) {
      gaps.push({
        key: req.key,
        label: req.label,
        importance: 'required',
        nodeId: req.nodeId,
        status: 'missing',
        question: `هنوز «${req.label}» ثبت نشده است. ${req.description} را مشخص می‌کنی؟`,
        suggestedAnswers: [],
        dependsOn: req.dependsOn,
      });
    } else if (found.status === 'Needs Review' || judged?.ambiguous) {
      gaps.push({
        key: req.key,
        label: req.label,
        importance: 'required',
        nodeId: req.nodeId,
        status: 'ambiguous',
        question: `مورد «${found.title}» مبهم است${judged?.reason ? `: ${judged.reason}` : ' و نیاز به بازبینی دارد.'} می‌خواهی دقیق‌ترش کنی؟`,
        suggestedAnswers: [],
        dependsOn: req.dependsOn,
      });
      if (found.status === 'Confirmed' && !found.assumption) {
        confirmedRequiredCount += 0.5;
      }
    } else if (found.status === 'Confirmed' && !found.assumption) {
      confirmedRequiredCount += 1;
    } else {
      // Proposed
      confirmedRequiredCount += 0.7;
    }
  }

  // 2. Check Suggested Contexts
  for (const sug of spec.suggestedContext) {
    const found = findForRequired(sug, activeObjects);
    if (!found) {
      gaps.push({
        key: sug.key,
        label: sug.label,
        importance: 'suggested',
        nodeId: sug.nodeId,
        status: 'missing',
        question: `برای بهبود کیفیت، پیشنهاد می‌شود «${sug.label}» را هم مشخص کنی: ${sug.description}`,
        suggestedAnswers: [],
      });
    }
  }

  // Sort gaps by dependencies (items with dependsOn come after prerequisites)
  gaps.sort((a, b) => {
    if (a.importance === 'required' && b.importance !== 'required') return -1;
    if (a.importance !== 'required' && b.importance === 'required') return 1;
    if (a.dependsOn?.includes(b.key)) return 1;
    if (b.dependsOn?.includes(a.key)) return -1;
    return 0;
  });

  const totalRequired = spec.requiredContext.length;
  const score = totalRequired > 0 ? Math.min(100, Math.round((confirmedRequiredCount / totalRequired) * 100)) : 100;

  let status: ReadinessResult['status'] = 'ready';
  if (score < 50) {
    status = 'blocked';
  } else if (score < 85) {
    status = 'needs_work';
  }

  const missingReqCount = gaps.filter((g) => g.importance === 'required' && g.status === 'missing').length;
  const summary =
    status === 'ready'
      ? `آمادگی کامل: تمام ${totalRequired} مؤلفه اصلی تأیید شده‌اند. خروجی با حداکثر انسجام تولید خواهد شد.`
      : status === 'needs_work'
      ? `آمادگی متوسط (${score}٪): ${totalRequired - missingReqCount} از ${totalRequired} مؤلفه الزامی آماده است. خروجی قابل تولید است اما با کیفیت کمتر.`
      : `نیاز به اطلاعات پایه: ${missingReqCount} مؤلفه حیاتی هنوز مشخص نشده است. توصیه می‌شود ابتدا به جاهای خالی پاسخ دهید.`;

  return {
    score,
    status,
    confirmedCount: Math.floor(confirmedRequiredCount),
    totalRequired,
    gaps,
    summary,
  };
}

const STOP = new Set(['و', 'در', 'به', 'از', 'برای', 'با', 'را', 'یا', 'که', 'این', 'آن', 'هر', 'یک']);
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toLatin = (t: string) => t.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
const toFa = (n: number) => String(n).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
export const titleTokens = (t: string) => new Set(normalizeFa(t).replace(/[^\p{L}\p{N} ]/gu, ' ').split(' ').filter((w) => w.length >= 2 && !STOP.has(w)));

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

interface Quantity { cls: string; value: number; text: string; /** the written unit (two durations in different units are compared with a tolerance) */ unit?: string }
const MULT: Record<string, number> = { 'هزار': 1e3, 'میلیون': 1e6, 'میلیارد': 1e9 };
const UNIT_CLASS: Record<string, { cls: string; scale: number }> = {
  'تومان': { cls: 'money', scale: 1 }, 'ریال': { cls: 'money', scale: 0.1 }, 'دلار': { cls: 'usd', scale: 1 },
  'درصد': { cls: 'percent', scale: 1 }, '%': { cls: 'percent', scale: 1 }, '٪': { cls: 'percent', scale: 1 },
  // one class for time, in hours: «۲۴ ساعت» and «۱ روز» are the same claim (a month is ~30 days, so across units a 10% tolerance)
  'ساعت': { cls: 'duration', scale: 1 }, 'روز': { cls: 'duration', scale: 24 }, 'هفته': { cls: 'duration', scale: 168 }, 'ماه': { cls: 'duration', scale: 720 },
  'نفر': { cls: 'person', scale: 1 }, 'جلسه': { cls: 'session', scale: 1 },
};

/** the same amount: equal, or (a duration written in two different units) within 10% — «۴ هفته» and «۱ ماه» say the same */
const sameQuantity = (x: Quantity, y: Quantity): boolean =>
  x.value === y.value || (x.cls === 'duration' && x.unit !== y.unit && Math.abs(x.value - y.value) <= 0.1 * Math.max(x.value, y.value));

/** Numbers that carry a unit (or a million/thousand multiplier = money): «۴ میلیون تومان», «۱۰٪», «۳۰ روز». */
export function extractQuantities(text: string): Quantity[] {
  const t = toLatin(normalizeFa(text)).replace(/(\d),(?=\d{3}\b)/g, '$1');
  const re = /(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|هزار)?\s*(تومان|ریال|دلار|درصد|%|٪|روز|هفته|ماه|نفر|ساعت|جلسه)?/g;
  const out: Quantity[] = [];
  for (const m of t.matchAll(re)) {
    const mult = m[2];
    const unit = m[3];
    if (!mult && !unit) continue;
    const u = unit ? UNIT_CLASS[unit] : { cls: 'money', scale: 1 };
    const value = Number(m[1]) * (mult ? MULT[mult] : 1) * u.scale;
    out.push({ cls: u.cls, value, text: m[0].trim(), ...(unit ? { unit } : {}) });
  }
  return out;
}

/**
 * Deterministic, high-precision contradiction detection (no model):
 *  1. same topic (near-identical titles) but different numbers in the same unit class (price, %, days…);
 *  2. a «no discount» constraint against an object that defines a discount.
 * Semantic contradictions (different words, same claim) are the decision layer's job — it receives only
 * candidate pairs and answers one closed question; this function never invents a conflict from keywords alone.
 */
export interface ContradictionContext extends Omit<GovernanceInput, 'objects'> {
  /** the domain rules (contradictionRules.ts); default: the pricing pack */
  rules?: RulePack;
  /** a governance check already built for these objects (the caller shares one between engines) */
  governs?: (a: ContextObject, b: ContextObject) => boolean;
}

/**
 * Certain (rule-based) contradictions: same topic with different numbers, and the domain rules of a rule pack. A pair counts only
 * where both govern the same place now (coGoverning.ts: valid, same section or ancestor, «همه‌جا», exceptions). Without the tree
 * every valid pair may meet.
 */
export function detectContradictions(objects: ContextObject[], ctx: ContradictionContext = {}): Contradiction[] {
  const governs = ctx.governs ?? governanceOf({ objects, ...ctx });
  const rules = ctx.rules ?? DEFAULT_RULE_PACK;
  const now = ctx.now ?? Date.now();
  const active = objects.filter((o) => (o.status === 'Confirmed' || o.status === 'Proposed') && isValidKnowledge(o, now));
  const contradictions: Contradiction[] = [];
  const tokens = new Map(active.map((o) => [o.id, titleTokens(o.title)]));
  const quantities = new Map(active.map((o) => [o.id, extractQuantities(`${o.title} ${o.content}`)]));
  const text = new Map(active.map((o) => [o.id, toLatin(normalizeFa(o.content))]));

  // only pairs that share a title word can be «the same topic»; each domain rule pairs its two small groups
  const extra: Array<[number, number]> = [];
  for (const r of rules) {
    const says = active.map((o, i) => (r.says.test(text.get(o.id)!) ? i : -1)).filter((i) => i >= 0);
    const does = active.map((o, i) => (doesIt(r, text.get(o.id)!) ? i : -1)).filter((i) => i >= 0);
    for (const x of says) for (const y of does) if (x !== y) extra.push([Math.min(x, y), Math.max(x, y)]);
  }
  const pairs = blockedPairs(active.map((o) => tokens.get(o.id)!), { extra });
  {
    for (const [i, j] of pairs) {
      const a = active[i];
      const b = active[j];
      if (!governs(a, b)) continue;

      // 1) same topic, different numbers
      if (jaccard(tokens.get(a.id)!, tokens.get(b.id)!) >= 0.6) {
        const qa = quantities.get(a.id)!;
        const qb = quantities.get(b.id)!;
        const classes = new Set(qa.map((q) => q.cls).filter((c) => qb.some((q) => q.cls === c)));
        for (const cls of classes) {
          const va = qa.filter((q) => q.cls === cls);
          const vb = qb.filter((q) => q.cls === cls);
          if (va.some((x) => vb.some((y) => sameQuantity(x, y)))) continue;
          contradictions.push({
            id: `contra_${a.id}_${b.id}`,
            itemA: a,
            itemB: b,
            reason: `دو مورد دربارهٔ یک موضوع عدد متفاوت دارند: «${va[0].text.replace(/\d+(\.\d+)?/g, (n) => toFa(Number(n)))}» در برابر «${vb[0].text.replace(/\d+(\.\d+)?/g, (n) => toFa(Number(n)))}».`,
            suggestedResolution: 'کدام عدد درست است؟ یکی را تأیید کن و دیگری را «جایگزین‌شده» کن.',
          });
          break;
        }
      }

      // 2) the domain rules: one side forbids what the other does
      for (const r of rules) {
        for (const [x, y] of [[a, b], [b, a]] as const) {
          if (r.says.test(text.get(x.id)!) && doesIt(r, text.get(y.id)!) && !contradictions.some((c) => c.id === `contra_${x.id}_${y.id}`)) {
            contradictions.push({ id: `contra_${x.id}_${y.id}`, itemA: x, itemB: y, reason: r.reason, suggestedResolution: r.suggestedResolution });
          }
        }
      }
    }
  }

  return contradictions;
}
