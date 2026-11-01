/**
 * Parser for the answer of an OUTSIDE AI (pasted back into Mabda). The Context pack asks for level-2 headings
 * («## Decision: …», «## Asset: …»); this is the deterministic first pass. When it finds none, the server falls
 * back to the cheap decision layer (see AiService.parseExternal) — the shape of both results is the same.
 */

export type ParsedKind = 'decision' | 'fact' | 'constraint' | 'asset' | 'question' | 'paragraph';

export interface ParsedBlock {
  id: string;
  kind: ParsedKind;
  /** short title (heading text, or the first line when the heading had none) */
  title: string;
  /** Markdown body (without the heading) */
  markdown: string;
  method: 'headings' | 'ai' | 'raw';
}

const KINDS: Record<string, ParsedKind> = {
  decision: 'decision', fact: 'fact', constraint: 'constraint', asset: 'asset', question: 'question',
  'تصمیم': 'decision', 'واقعیت': 'fact', 'محدودیت': 'constraint', 'دارایی': 'asset', 'خروجی': 'asset', 'سؤال': 'question', 'سوال': 'question',
};

const HEADING = /^##(?!#)\s*(Decision|Fact|Constraint|Asset|Question|تصمیم|واقعیت|محدودیت|دارایی|خروجی|سؤال|سوال)\s*(?:[:：\-—–]\s*(.*))?$/i;

const plain = (s: string) => s.replace(/^[#>*\-\s`]+/, '').replace(/[*_`]/g, '').trim();
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** an answer that is one big code fence is unwrapped (some chat UIs do that) */
export function unwrapFence(text: string): string {
  const m = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return m ? m[1] : text;
}

/** null when the text has no recognised heading at all (caller falls back to the AI parser) */
export function parseByHeadings(input: string): ParsedBlock[] | null {
  const lines = unwrapFence(input).replace(/\r\n?/g, '\n').split('\n');
  type Draft = { kind: ParsedKind; title: string; body: string[] };
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  const pre: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = inFence ? null : line.match(HEADING);
    if (m) {
      cur = { kind: KINDS[m[1].toLowerCase()] ?? KINDS[m[1]], title: (m[2] ?? '').trim(), body: [] };
      drafts.push(cur);
    } else if (cur) cur.body.push(line);
    else pre.push(line);
  }
  if (!drafts.length) return null;
  const out: ParsedBlock[] = [];
  // the pack marker is bookkeeping, not part of the answer
  const preText = pre.join('\n').replace(/<!--\s*mabda-pack:[A-Za-z0-9_-]+\s*-->/g, '').trim();
  if (preText) out.push({ id: 'p0', kind: 'paragraph', title: clip(plain(preText.split('\n')[0])), markdown: preText, method: 'headings' });
  drafts.forEach((d, i) => {
    const body = d.body.join('\n').trim();
    if (!body && !d.title) return;
    const title = d.title || clip(plain(body.split('\n').find((l) => l.trim()) ?? ''));
    out.push({ id: `b${i + 1}`, kind: d.kind, title, markdown: body || d.title, method: 'headings' });
  });
  return out;
}

/** Context proposals live in the Context tree; the rest are assets / questions / plain text */
export const isContextKind = (k: ParsedKind): k is 'decision' | 'fact' | 'constraint' => k === 'decision' || k === 'fact' || k === 'constraint';
export const contextTypeOf = (k: 'decision' | 'fact' | 'constraint'): 'Decision' | 'Fact' | 'Constraint' => (k === 'decision' ? 'Decision' : k === 'fact' ? 'Fact' : 'Constraint');
