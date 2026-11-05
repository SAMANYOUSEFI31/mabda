/**
 * Examples of a red line: up to three short «right» / «wrong» texts that sit next to a Constraint (or a Decision that
 * reaches everywhere) and travel WITH it into the AI request, the Context pack and the validator prompt — so a model
 * sees what «following» and «breaking» the rule look like. Pure.
 *
 *  • order = the order the user wrote them (stable), never more than {@link EXAMPLE_LIMIT}
 *  • samples never carry examples into any AI text
 *  • an example is text only; it is not knowledge, it has no status and no version of its own
 */

import type { ContextObject, RedlineExample } from '../types';
import { reachOf } from './effectiveContext';

export const EXAMPLE_LIMIT = 3;
export const EXAMPLE_MAX_CHARS = 280;
export const EXAMPLE_FA: Record<RedlineExample['kind'], string> = { good: 'درست', bad: 'نادرست' };

/** only red lines can carry examples: a Constraint, or a Decision whose reach is «everywhere» */
export const canHaveExamples = (o: Pick<ContextObject, 'type' | 'reach'>): boolean =>
  o.type === 'Constraint' || (o.type === 'Decision' && reachOf(o) === 'global');

/** client input → valid examples only (a bad kind or an empty text is dropped; text is one line, clipped; at most three) */
export function cleanExamples(v: unknown): RedlineExample[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: RedlineExample[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const e = x as Record<string, unknown>;
    if ((e.kind !== 'good' && e.kind !== 'bad') || typeof e.text !== 'string') continue;
    const text = e.text.replace(/\s+/g, ' ').trim().slice(0, EXAMPLE_MAX_CHARS).trim();
    if (!text) continue;
    out.push({ kind: e.kind, text });
    if (out.length >= EXAMPLE_LIMIT) break;
  }
  return out.length ? out : undefined;
}

/** the examples that may reach a model: the object must be able to carry them and must not be a sample */
export const examplesOf = (o: Pick<ContextObject, 'type' | 'reach' | 'examples'> & { sample?: boolean }): RedlineExample[] =>
  !o.sample && canHaveExamples(o) ? (cleanExamples(o.examples) ?? []) : [];

/** one line per example, labelled: «مثال درست: …» / «مثال نادرست: …» */
export const exampleLines = (o: Parameters<typeof examplesOf>[0]): string[] => examplesOf(o).map((e) => `مثال ${EXAMPLE_FA[e.kind]}: ${e.text}`);

/** « (مثال درست: …؛ مثال نادرست: …)» for a list of already-valid examples; empty when there are none */
export const exampleSuffix = (list: readonly RedlineExample[] | undefined): string =>
  list?.length ? ` (${list.map((e) => `مثال ${EXAMPLE_FA[e.kind]}: ${e.text}`).join('؛ ')})` : '';

/** the guardrail string used by the pack and the validator: «عنوان: متن» followed by its examples */
export const guardrailText = (o: Pick<ContextObject, 'title' | 'content' | 'type' | 'reach' | 'examples'> & { sample?: boolean }): string => {
  const ex = exampleLines(o);
  return `${o.title}: ${o.content}${ex.length ? ` (${ex.join('؛ ')})` : ''}`;
};
