/**
 * Global search («جستجوی سراسری», Ctrl/⌘+K): keyword search over objects, nodes, assets and notes, ranked with the same
 * BM25 as file retrieval (`retrieval.ts`) after Persian normalisation (`normalizeFa`: ي/ك, ZWNJ, hamza, digits).
 * The last typed letters count as a PREFIX («قیم» finds «قیمت»), so a thing is found after a few letters.
 *
 * Notes are searched for DISPLAY only: this module feeds the palette and nothing else — notes never reach an AI
 * (docs/spine.md: «یادداشت … هرگز تزریق نمی‌شود»). Examples (samples), archived and superseded objects are not searched.
 * Pure.
 */

import type { ContextObject, Note, TreeNode } from '../types';
import { normalizeFa } from './contextEngine';
import { ancestorIds } from './nodeTree';
import { tokenize } from './retrieval';

export type SearchKind = 'command' | 'node' | 'object' | 'asset' | 'note';
export const SEARCH_GROUP_LABEL: Record<SearchKind, string> = { command: 'فرمان‌ها', node: 'گره‌ها', object: 'دانش', asset: 'دارایی‌ها', note: 'یادداشت‌ها' };
export const SEARCH_GROUP_ORDER: SearchKind[] = ['command', 'node', 'object', 'asset', 'note'];

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** where it lives (node path) or a short type · status line */
  subtitle?: string;
  /** a piece of the text around the match, when the match is not in the title */
  snippet?: string;
  score: number;
  /** how many of the typed words this hit contains (the first sort key) */
  covered?: number;
}
export type SearchGroups = Record<SearchKind, SearchHit[]>;

export interface SearchCommand { id: string; title: string; keywords?: string[] }
/** the shortcuts of the palette; the UI binds each id to an action */
export const COMMANDS: SearchCommand[] = [
  { id: 'thought', title: 'فکر تازه', keywords: ['ایده', 'سؤال', 'فرض', 'تصمیم باز', 'یادداشت', 'فکر خام'] },
  { id: 'go-thinking', title: 'رفتن به فضای فکر', keywords: ['فکرها', 'پیشنهاد', 'منتظر', 'ایده', 'سؤال'] },
  { id: 'record', title: 'ثبت دانش', keywords: ['افزودن', 'تازه', 'جدید', 'واقعیت', 'تصمیم', 'قید'] },
  { id: 'ai-request', title: 'درخواست برای AI', keywords: ['پرامپت', 'ممیزی', 'سؤال', 'کپی'] },
  { id: 'go-home', title: 'رفتن به خانه', keywords: ['خانه', 'شروع'] },
  { id: 'go-context', title: 'رفتن به منبع حقیقت', keywords: ['دانش', 'درخت', 'ساختار'] },
  { id: 'go-doc', title: 'رفتن به سند', keywords: ['خواندن', 'متن'] },
  { id: 'go-canvas', title: 'رفتن به بوم', keywords: ['نقشه', 'تابلو', 'رابطه'] },
  { id: 'go-assets', title: 'رفتن به دارایی‌ها', keywords: ['خروجی'] },
  { id: 'go-workstreams', title: 'رفتن به جریان‌های کار', keywords: ['خروجی', 'ساخت'] },
  { id: 'metrics', title: 'شاخص‌ها و اعداد', keywords: ['نتیجه', 'عدد', 'نمودار'] },
  { id: 'packs', title: 'بسته‌های دانش', keywords: ['کپی', 'بسته'] },
  { id: 'import', title: 'وارد کردن پاسخ AI', keywords: ['چسباندن', 'پاسخ'] },
];

interface Doc { kind: Exclude<SearchKind, 'command'>; id: string; title: string; text: string; subtitle?: string; content: string; tf: Map<string, number>; len: number }
export interface SearchIndex { docs: Doc[]; vocab: string[]; df: Map<string, number>; avg: number }

/** Okapi BM25 (same formula and constants as `retrieval.bm25Rank`) over the pre-counted words of the index, so a keystroke does not re-read every text */
const K1 = 1.5, B = 0.75;

const STATUS_FA: Partial<Record<ContextObject['status'], string>> = { Proposed: 'پیشنهادی', 'Needs Review': 'نیازمند بازبینی' };
const TYPE_FA: Record<ContextObject['type'], string> = { Fact: 'واقعیت', Decision: 'تصمیم', Constraint: 'قید' };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

export function buildSearchIndex(input: {
  nodes: TreeNode[];
  objects: ContextObject[];
  deliverables?: Array<{ id: string; title: string; content: string }>;
  notes?: Array<Pick<Note, 'id' | 'nodeId' | 'content'>>;
}): SearchIndex {
  const label = (id: string) => input.nodes.find((n) => n.id === id)?.label ?? id;
  const path = (id: string) => ancestorIds(input.nodes, id).reverse().map(label).join(' ‹ ');
  const docs: Doc[] = [];
  type Raw = Omit<Doc, 'tf' | 'len'>;
  const raw: Raw[] = [];
  for (const n of input.nodes) raw.push({ kind: 'node', id: n.id, title: n.label, content: n.description, text: `${n.label} ${n.label} ${n.label} ${n.description}`, subtitle: path(n.id) });
  for (const o of input.objects) {
    if (o.sample || o.status === 'Archived' || o.status === 'Superseded') continue;
    const sub = [TYPE_FA[o.type], STATUS_FA[o.status], path(o.nodeId)].filter(Boolean).join(' · ');
    raw.push({ kind: 'object', id: o.id, title: o.title, content: o.content, text: `${o.title} ${o.title} ${o.title} ${o.content} ${(o.facets ?? []).join(' ')} ${path(o.nodeId)}`, subtitle: sub });
  }
  for (const d of input.deliverables ?? []) raw.push({ kind: 'asset', id: d.id, title: d.title, content: d.content, text: `${d.title} ${d.title} ${d.title} ${d.content}` });
  for (const n of input.notes ?? []) {
    const title = clip(firstLine(n.content), 70);
    raw.push({ kind: 'note', id: n.id, title, content: n.content, text: `${title} ${n.content}`, subtitle: path(n.nodeId) });
  }
  const df = new Map<string, number>();
  for (const r of raw) {
    const toks = tokenize(r.text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    docs.push({ ...r, tf, len: toks.length });
  }
  const avg = docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1) || 1;
  return { docs, vocab: [...df.keys()], df, avg };
}

/** each typed word → the words of the index it starts (or, failing that, contains); an unknown word stays as typed */
export function expandQuery(query: string, vocab: string[]): { terms: string[][]; typed: string[] } {
  const typed = [...new Set(tokenize(normalizeFa(query)))];
  const terms = typed.map((q) => {
    const starts = vocab.filter((t) => t.startsWith(q));
    if (starts.length) return starts;
    const has = q.length >= 3 ? vocab.filter((t) => t.includes(q)) : [];
    return has.length ? has : [q];
  });
  return { terms, typed };
}

function snippetOf(content: string, typed: string[]): string | undefined {
  const flat = content.replace(/\s+/g, ' ');
  const norm = normalizeFa(flat);
  let at = -1;
  for (const q of typed) { const i = norm.indexOf(q); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return undefined;
  const from = Math.max(0, at - 28);
  return `${from > 0 ? '…' : ''}${flat.slice(from, from + 96)}${from + 96 < flat.length ? '…' : ''}`;
}

export function searchIndex(index: SearchIndex, query: string, opts: { limitPerGroup?: number; commands?: SearchCommand[] } = {}): SearchGroups {
  const limit = opts.limitPerGroup ?? 6;
  const out: SearchGroups = { command: [], node: [], object: [], asset: [], note: [] };
  const q = normalizeFa(query);
  const commands = opts.commands ?? COMMANDS;
  if (!q) { out.command = commands.map((c, i) => ({ kind: 'command' as const, id: c.id, title: c.title, score: -i })).slice(0, limit * 2); return out; }
  const { terms, typed } = expandQuery(q, index.vocab);
  // commands: every typed word starts a word of the title or a keyword
  const words = (c: SearchCommand) => tokenize(normalizeFa(`${c.title} ${(c.keywords ?? []).join(' ')}`));
  out.command = commands
    .filter((c) => typed.length > 0 && typed.every((t) => words(c).some((w) => w.startsWith(t))))
    .map((c, i) => ({ kind: 'command' as const, id: c.id, title: c.title, score: 100 - i }))
    .slice(0, limit);
  if (!typed.length) return out;

  const N = index.docs.length;
  const queryTerms = [...new Set(terms.flat())];
  const scored: Array<{ d: Doc; covered: number; score: number }> = [];
  for (const d of index.docs) {
    let score = 0;
    for (const t of queryTerms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = index.df.get(t) ?? 0;
      score += Math.log(1 + (N - n + 0.5) / (n + 0.5)) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / index.avg)));
    }
    if (score <= 0) continue;
    const nt = normalizeFa(d.title);
    const covered = terms.filter((alts) => alts.some((a) => d.tf.has(a))).length;
    scored.push({ d, covered, score: score + (nt.startsWith(q) ? 6 : nt.includes(q) ? 3 : 0) });
  }
  scored.sort((a, b) => b.covered - a.covered || b.score - a.score || a.d.id.localeCompare(b.d.id));
  for (const { d, score, covered } of scored) {
    const g = out[d.kind];
    if (g.length >= limit) continue;
    const inTitle = typed.some((t) => normalizeFa(d.title).includes(t));
    g.push({ kind: d.kind, id: d.id, title: d.title, ...(d.subtitle ? { subtitle: d.subtitle } : {}), ...(!inTitle || d.kind === 'note' ? { snippet: snippetOf(d.content, typed) } : {}), score, covered });
  }
  return out;
}

/**
 * The order the palette shows the groups: commands first (a command you typed is what you want), then the other groups by how
 * good their best hit is — so the exact thing you named is the first row, whatever kind it is. Ties keep `SEARCH_GROUP_ORDER`.
 */
export function groupOrder(g: SearchGroups): SearchKind[] {
  const rest = SEARCH_GROUP_ORDER.filter((k) => k !== 'command' && g[k].length > 0);
  const best = (k: SearchKind) => g[k][0];
  rest.sort((a, b) => (best(b).covered ?? 0) - (best(a).covered ?? 0) || best(b).score - best(a).score || SEARCH_GROUP_ORDER.indexOf(a) - SEARCH_GROUP_ORDER.indexOf(b));
  return [...(g.command.length ? (['command'] as SearchKind[]) : []), ...rest];
}
/** one flat list in the order the palette shows it (`groupOrder`), for keyboard movement */
export const flattenGroups = (g: SearchGroups): SearchHit[] => groupOrder(g).flatMap((k) => g[k]);
export const totalHits = (g: SearchGroups): number => flattenGroups(g).length;
