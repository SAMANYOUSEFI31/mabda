/**
 * گزینه‌های یک «تصمیم باز»: the options are the bullet lines right under the open-decision line of its note — the note text
 * stays the only record (nothing new is stored, no migration). An option may name what it rests on with `@«…»`. Conflicts with
 * the guardrails in force are found by the deterministic rule engine (`detectContradictions`), never by guessing. Choosing one
 * builds a PROPOSED Decision whose record keeps the other options WITH the reason each was set aside. Pure.
 */

import type { ContextObject, ContextRelationship, DecisionRecord, TreeNode } from '../types';
import { detectContradictions } from './contextEngine';
import { effectiveFor, inForce } from './effectiveContext';
import { aboutOf, stripAbout } from './thoughtAbout';

export interface DecisionOption { /** 0-based line of the note */ line: number; /** the sentence, without its @-names */ title: string; /** the whole line text (with @-names) */ text: string; restsOn: string[] }

const OPTION = /^[\s‌‏]*(?:[-*•–—]|گزینه\s*[\d۰-۹]*\s*[:：])\s*/;

/** the option lines directly under line `line` (stops at a blank line or the next non-option line) */
export function optionsOf(content: string, line: number, objects: ContextObject[], nodes: TreeNode[]): DecisionOption[] {
  const lines = content.split(/\r?\n/);
  const out: DecisionOption[] = [];
  // a question written over several lines (each ending with `\`) has its options after the LAST of them
  while (line < lines.length - 1 && /\\[ \t]*$/.test(lines[line])) line++;
  for (let i = line + 1; i < lines.length; i++) {
    const m = OPTION.exec(lines[i]);
    if (!m) break;
    const text = lines[i].slice(m[0].length).trim();
    if (!text) continue;
    out.push({ line: i, text, title: stripAbout(text), restsOn: aboutOf(text, objects, nodes).objectIds });
  }
  return out;
}

/** the note text with one more option under the decision (after its last option) */
export function addOption(content: string, line: number, text: string, objects: ContextObject[], nodes: TreeNode[]): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return content;
  const lines = content.split('\n');
  const last = optionsOf(content, line, objects, nodes).reduce((m, o) => Math.max(m, o.line), line);
  lines.splice(last + 1, 0, `- ${t}`);
  return lines.join('\n');
}

export function removeOption(content: string, optionLine: number): string {
  const lines = content.split('\n');
  if (optionLine < 0 || optionLine >= lines.length) return content;
  lines.splice(optionLine, 1);
  return lines.join('\n');
}

export interface OptionConflict { constraint: ContextObject; reason: string }

/** the guardrails in force at the decision's section that the option's text contradicts by the deterministic rules */
export function optionConflicts(option: Pick<DecisionOption, 'title' | 'text'>, nodeId: string, objects: ContextObject[], nodes: TreeNode[], relationships: ContextRelationship[], now: Date | string | number): OptionConflict[] {
  const guardrails = inForce(effectiveFor(nodeId, objects.filter((o) => o.status === 'Confirmed' && !o.sample), nodes, relationships, now)).map((i) => i.object).filter((o) => o.type === 'Constraint');
  if (!guardrails.length) return [];
  const probe = { id: '__option__', workspaceId: '', type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: option.title, content: option.title, nodeId, version: 1, createdAt: '', updatedAt: '' } as ContextObject;
  const hits = detectContradictions([probe, ...guardrails]).filter((c) => c.itemA.id === '__option__' || c.itemB.id === '__option__');
  const seen = new Set<string>();
  const out: OptionConflict[] = [];
  for (const c of hits) {
    const other = c.itemA.id === '__option__' ? c.itemB : c.itemA;
    if (!seen.has(other.id)) { seen.add(other.id); out.push({ constraint: other, reason: c.reason }); }
  }
  return out;
}

/** the Decision record of a choice: the chosen option has no reason; each other one keeps the reason it was set aside */
export function recordOfChoice(question: string, chosen: string, others: Array<{ title: string; reason: string }>): DecisionRecord {
  return { question, options: [{ title: chosen }, ...others.map((o) => ({ title: o.title, rejectedReason: o.reason.trim() }))] };
}

/** the text sent to an AI by «از AI نظر بخواه»: written for the person to read and edit first — thoughts never go to a model by themselves */
export function askText(question: string, options: Array<Pick<DecisionOption, 'title'>>): string {
  return `${question.trim()}\nگزینه‌ها:\n${options.map((o, i) => `${i + 1}. ${o.title}`).join('\n')}\nکدام را پیشنهاد می‌کنی و چرا؟`;
}
