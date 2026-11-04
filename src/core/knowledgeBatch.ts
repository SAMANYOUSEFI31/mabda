/**
 * Several pieces of knowledge from a pasted text, WITHOUT an AI: one line = one proposal (always «Proposed», waiting in the
 * thinking space for a yes). The type comes from rules only — an explicit label ([واقعیت] [تصمیم] [قید]) wins, then the
 * wording rules of `guessType`; the user can change each line. Pure.
 */

import type { ContextType } from '../types';
import { guessTitle, guessType } from './knowledgeGuess';

export interface KnowledgeLine { id: number; title: string; content: string; type: ContextType; how: 'label' | 'rules' }

const LABELS: Array<[RegExp, ContextType]> = [[/^\[\s*(?:واقعیت|fact)\s*\]/i, 'Fact'], [/^\[\s*(?:تصمیم|decision)\s*\]/i, 'Decision'], [/^\[\s*(?:قید|خط\s*قرمز|constraint)\s*\]/i, 'Constraint']];
const BULLET = /^[\s‌‏]*(?:[-*•–—]|[\d۰-۹٠-٩]+[.)])\s+/;

export function parseKnowledgeBatch(text: string): KnowledgeLine[] {
  const out: KnowledgeLine[] = [];
  text.replace(/\r/g, '').split('\n').forEach((raw, id) => {
    let line = raw.trim();
    if (!line || line.startsWith('#')) return;
    line = line.replace(BULLET, '').trim();
    const lab = LABELS.find(([re]) => re.test(line));
    if (lab) line = line.replace(lab[0], '').replace(/^[\s:：\-–—]+/, '').trim();
    if (!line) return;
    out.push({ id, title: guessTitle(line), content: line, type: lab ? lab[1] : guessType(line), how: lab ? 'label' : 'rules' });
  });
  return out;
}
