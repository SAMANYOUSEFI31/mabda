import type { Prompt } from './providers/provider.ts';
import { CORE_TEXT, SYSTEM_PROMPT } from './prompts.ts';

export interface ContextObjectLite {
  id: string;
  type: string;
  status: string;
  title: string;
  content: string;
  nodeId: string;
  createdAt?: string;
}

export const NODE_ORDER = ['business', 'brand', 'product', 'offer', 'content', 'asset'];
export const NODE_LABELS: Record<string, string> = {
  business: 'کسب‌وکار', brand: 'برند', product: 'محصول', offer: 'آفر', content: 'محتوا', asset: 'دارایی',
};

/** Statuses that are never shown to the model. */
const EXCLUDED = new Set(['Superseded', 'Archived']);

const byStableOrder = (a: ContextObjectLite, b: ContextObjectLite) =>
  (NODE_ORDER.indexOf(a.nodeId) + 1 || 99) - (NODE_ORDER.indexOf(b.nodeId) + 1 || 99) ||
  (a.createdAt ?? '').localeCompare(b.createdAt ?? '') ||
  a.id.localeCompare(b.id);

const line = (c: ContextObjectLite) => `- [${c.type}] (${NODE_LABELS[c.nodeId] ?? c.nodeId}) ${c.title}: ${c.content}`;

export interface BuildPromptInput {
  contexts: ContextObjectLite[];
  /** nodes the user wants the answer grounded in (empty = whole tree) */
  focusNodeIds?: string[];
  /** the job-specific instructions + user text (variable part) */
  task: string;
}

/**
 * Cache-friendly layout (see PRD «Cache»):
 *   system  = system prompt → Core                      (identical for every request)
 *   prefix  = Confirmed workspace context, fixed order   (identical until the knowledge changes)
 *   user    = proposed context (labelled) → focus → task (changes every request)
 * Proposed / Needs Review items are never placed in the stable prefix and are always labelled as unconfirmed.
 */
export function buildPrompt({ contexts, focusNodeIds = [], task }: BuildPromptInput): Prompt {
  const live = contexts.filter((c) => !EXCLUDED.has(c.status));
  const confirmed = live.filter((c) => c.status === 'Confirmed').sort(byStableOrder);
  const unconfirmed = live.filter((c) => c.status !== 'Confirmed').sort(byStableOrder);

  const prefix = confirmed.length
    ? `## دانش تأییدشدهٔ فضای کار (Confirmed — واقعیت)\n${confirmed.map(line).join('\n')}`
    : '## دانش تأییدشدهٔ فضای کار (Confirmed — واقعیت)\nهنوز دانش تأییدشده‌ای ثبت نشده است.';

  const parts: string[] = [];
  if (unconfirmed.length) {
    parts.push(`## دانش پیشنهادی / نیازمند بررسی (تأییدنشده — واقعیت نیست)\n${unconfirmed.map((c) => `${line(c)} «${c.status === 'Proposed' ? 'پیشنهادی' : 'نیازمند بررسی'}»`).join('\n')}`);
  }
  if (focusNodeIds.length) parts.push(`## تمرکز این درخواست\nپاسخ را روی شاخه‌های ${focusNodeIds.map((n) => NODE_LABELS[n] ?? n).join('، ')} متمرکز کن.`);
  parts.push(task);

  return { system: `${SYSTEM_PROMPT}\n\n${CORE_TEXT}`, prefix, user: parts.join('\n\n') };
}

/** Rough size for routing (Persian ≈ 2.5 tokens/word; 1 token ≈ 2.2 chars). Not billing — real usage comes from the provider. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.2);
}
