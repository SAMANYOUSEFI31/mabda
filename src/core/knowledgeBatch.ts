/**
 * Several pieces of knowledge from a pasted text, WITHOUT an AI: one item per line (or one line plus the indented lines under it —
 * the same rule as «چند فکر», src/core/batchLines.ts); always «Proposed», waiting in the thinking space for a yes. The type comes
 * from rules only — an explicit label ([واقعیت] [تصمیم] [قید]) wins, then the wording rules of `guessType`; the user can change each
 * item. Pure.
 */

import type { ContextType } from '../types';
import { groupLines } from './batchLines';
import { guessTitle, guessType } from './knowledgeGuess';

export interface KnowledgeLine {
  /** the 0-based source line of the item's first line */
  id: number;
  title: string;
  content: string;
  type: ContextType;
  how: 'label' | 'rules';
  /** source lines of the continuation lines (to «جدا کن» one of them) */
  rest: number[];
}

const LABELS: Array<[RegExp, ContextType]> = [[/^\[\s*(?:واقعیت|fact)\s*\]/i, 'Fact'], [/^\[\s*(?:تصمیم|decision)\s*\]/i, 'Decision'], [/^\[\s*(?:قید|خط\s*قرمز|constraint)\s*\]/i, 'Constraint']];

export function parseKnowledgeBatch(text: string): KnowledgeLine[] {
  const out: KnowledgeLine[] = [];
  for (const g of groupLines(text)) {
    let first = g.first;
    const lab = LABELS.find(([re]) => re.test(first));
    if (lab) first = first.replace(lab[0], '').replace(/^[\s:：\-–—]+/, '').trim();
    const lines = [first, ...g.rest.map((r) => r.text)].filter(Boolean);
    if (!lines.length) continue;
    const content = lines.join('\n');
    out.push({ id: g.id, title: guessTitle(lines[0]), content, type: lab ? lab[1] : guessType(content), how: lab ? 'label' : 'rules', rest: g.rest.map((r) => r.index) });
  }
  return out;
}
