/**
 * What a pack / a request brings and why — ONE shape for the two (docs/spine.md → «دامنهٔ بسته»). Pure; built from the same
 * data as the text that is copied, so the explanation cannot drift from the text.
 */

import type { ContextObject } from '../types';
import type { LeftReason } from './packScope';

export type ExplainGroup = 'guardrail' | 'fact' | 'decision' | 'assumption' | 'unconfirmed';
export const GROUP_FA: Record<ExplainGroup, string> = {
  guardrail: 'قیدها (گاردریل؛ نباید نقض شوند)',
  fact: 'دانش تأییدشده',
  decision: 'تصمیم‌های تأییدشده',
  assumption: 'فرض‌ها (واقعیت نیست)',
  unconfirmed: 'تأییدنشده‌ها (واقعیت نیست)',
};
export const GROUP_ORDER: ExplainGroup[] = ['guardrail', 'fact', 'decision', 'assumption', 'unconfirmed'];

export interface ExplainItem {
  /** absent for a rule that comes from the workstream itself */
  id?: string;
  title: string;
  type?: ContextObject['type'];
  nodeLabel: string;
  group: ExplainGroup;
  /** «از "برند"، همه‌جا» — where it was written and why it reaches here */
  from: string;
  /** the object's own rule is editable (a Constraint): the link «این قید را ببین» uses it */
  editable?: boolean;
  /** a short note: «منقضی می‌شود …»، «بودجه: همیشه می‌آید» */
  note?: string;
}
export interface ExplainLeft {
  id: string;
  title: string;
  type: ContextObject['type'];
  nodeLabel: string;
  reason: LeftReason;
  why: string;
  /** a request lets her add it by hand */
  canAdd?: boolean;
}
export interface Explain {
  scope: { whole: boolean; pickedLabels: string[]; withChildren: boolean; sections: number };
  items: ExplainItem[];
  left: ExplainLeft[];
}

/** left-out lists are grouped by reason in this order (what she can fix first) */
export const LEFT_ORDER: LeftReason[] = ['child', 'status', 'assumption', 'facet', 'budget', 'unranked', 'kind', 'overridden', 'expired', 'scope'];

export function groupItems(items: ExplainItem[]): Array<[ExplainGroup, ExplainItem[]]> {
  return GROUP_ORDER.map((g): [ExplainGroup, ExplainItem[]] => [g, items.filter((i) => i.group === g)]).filter(([, l]) => l.length > 0);
}
export function groupLeft(left: ExplainLeft[]): Array<[LeftReason, ExplainLeft[]]> {
  return LEFT_ORDER.map((r): [LeftReason, ExplainLeft[]] => [r, left.filter((l) => l.reason === r)]).filter(([, l]) => l.length > 0);
}
