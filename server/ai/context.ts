import type { Prompt } from './providers/provider.ts';
import { CORE_TEXT, SYSTEM_PROMPT } from './prompts.ts';
import { ASSUMPTION_RULE, REJECTED_RULE } from '../../src/core/assumptions.ts';

export interface ContextObjectLite {
  id: string;
  type: string;
  status: string;
  title: string;
  content: string;
  nodeId: string;
  /** version at the time of injection — stored in the asset as lineage */
  version?: number;
  createdAt?: string;
  /** only for clients that send their own list: lets the service drop a position-only / expired Constraint from the guardrails */
  reach?: string;
  validUntil?: string;
  /** a working assumption: never confirmed knowledge, shown in its own section */
  assumption?: boolean;
  /** options that were weighed and rejected (from a Decision's record) — the model must not propose them again */
  rejected?: Array<{ title: string; reason: string }>;
}

export interface FileExcerpt {
  fileId: string;
  fileName: string;
  index: number;
  text: string;
}

/** Exactly the objects a prompt built from `contexts` shows to the model (Superseded/Archived never are). */
export function injectedRefs(contexts: ContextObjectLite[]): Array<{ id: string; version: number }> {
  return contexts.filter((c) => !EXCLUDED.has(c.status)).sort(byStableOrder).map((c) => ({ id: c.id, version: c.version ?? 1 }));
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

const line = (c: ContextObjectLite, labels: Record<string, string> = NODE_LABELS) => `- [${c.type}] (${labels[c.nodeId] ?? NODE_LABELS[c.nodeId] ?? c.nodeId}) ${c.title}: ${c.content}`;

export interface BuildPromptInput {
  contexts: ContextObjectLite[];
  /** nodes the user wants the answer grounded in (empty = whole tree) */
  focusNodeIds?: string[];
  /** the job-specific instructions + user text (variable part) */
  task: string;
  /** node id → label for this workspace (user-created nodes included) */
  nodeLabels?: Record<string, string>;
  /** relevant chunks of uploaded files — always labelled as unconfirmed imported material */
  excerpts?: FileExcerpt[];
}

/**
 * Cache-friendly layout (see PRD «Cache»):
 *   system  = system prompt → Core                      (identical for every request)
 *   prefix  = Confirmed workspace context, fixed order   (identical until the knowledge changes)
 *   user    = proposed context (labelled) → focus → task (changes every request)
 * Proposed / Needs Review items are never placed in the stable prefix and are always labelled as unconfirmed.
 */
export function buildPrompt({ contexts, focusNodeIds = [], task, nodeLabels, excerpts = [] }: BuildPromptInput): Prompt {
  const labels = { ...NODE_LABELS, ...(nodeLabels ?? {}) };
  const live = contexts.filter((c) => !EXCLUDED.has(c.status));
  const assumptions = live.filter((c) => c.assumption).sort(byStableOrder);
  const confirmed = live.filter((c) => c.status === 'Confirmed' && !c.assumption).sort(byStableOrder);
  const unconfirmed = live.filter((c) => c.status !== 'Confirmed' && !c.assumption).sort(byStableOrder);
  const rejected = live.filter((c) => c.status === 'Confirmed' && !c.assumption).flatMap((c) => (c.rejected ?? []).map((r) => ({ ...r, of: c.title })));

  const prefix = confirmed.length
    ? `## دانش تأییدشدهٔ فضای کار (Confirmed — واقعیت)\n${confirmed.map((c) => line(c, labels)).join('\n')}`
    : '## دانش تأییدشدهٔ فضای کار (Confirmed — واقعیت)\nهنوز دانش تأییدشده‌ای ثبت نشده است.';

  const parts: string[] = [];
  if (unconfirmed.length) {
    parts.push(`## دانش پیشنهادی / نیازمند بررسی (تأییدنشده — واقعیت نیست)\n${unconfirmed.map((c) => `${line(c, labels)} «${c.status === 'Proposed' ? 'پیشنهادی' : 'نیازمند بررسی'}»`).join('\n')}`);
  }
  if (assumptions.length) {
    parts.push(`## فرض‌های فعال، تأییدنشده (واقعیت نیست)\n${ASSUMPTION_RULE}\n${assumptions.map((c) => line(c, labels)).join('\n')}`);
  }
  if (rejected.length) {
    parts.push(`## گزینه‌های بررسی‌شده و ردشده\n${REJECTED_RULE}\n${rejected.map((r) => `- «${r.title}» (در تصمیم «${r.of}»): ${r.reason}`).join('\n')}`);
  }
  if (excerpts.length) {
    parts.push(`## گزیده‌های فایل‌های بارگذاری‌شده (منبع واردشده — تأییدنشده؛ واقعیت قطعی نیست)\n${excerpts.map((e) => `[${e.fileName} · بخش ${e.index + 1}]\n${e.text}`).join('\n\n')}`);
  }
  if (focusNodeIds.length) parts.push(`## تمرکز این درخواست\nپاسخ را روی شاخه‌های ${focusNodeIds.map((n) => labels[n] ?? n).join('، ')} متمرکز کن.`);
  parts.push(task);

  return { system: `${SYSTEM_PROMPT}\n\n${CORE_TEXT}`, prefix, user: parts.join('\n\n') };
}

export { estimateTokens } from "../../src/core/tokens.ts";
