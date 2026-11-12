/**
 * Global search («جستجوی سراسری», Ctrl/⌘+K): ONE keyword search over knowledge, sections, thoughts, notes, outputs and files, ranked
 * with the same BM25 as file retrieval (`retrieval.ts`) after Persian normalisation (`fold`: ي/ك, ZWNJ, harakat, digits).
 * No fixed ceiling: every hit is kept, best first; the palette discloses them progressively (`FIRST_SHOWN` / `MORE_STEP`).
 * The last typed letters count as a PREFIX («قیم» finds «قیمت»), so a thing is found after a few letters.
 *
 * Notes are searched for DISPLAY only: this module feeds the palette and nothing else — notes never reach an AI
 * (docs/spine.md: «یادداشت … هرگز تزریق نمی‌شود»). Examples (samples), archived and superseded objects are not searched.
 * Pure.
 */

import type { ContextObject, Note, TreeNode } from '../types';
import type { StoredFile, Thought } from '../types';
import { ancestorIds } from './nodeTree';
import { normalizeText, tokenize } from './retrieval';

export type SearchKind = 'command' | 'node' | 'object' | 'thought' | 'note' | 'asset' | 'file';
export const SEARCH_GROUP_LABEL: Record<SearchKind, string> = { command: 'فرمان‌ها', node: 'گره‌ها', object: 'دانش', thought: 'فکرها', note: 'یادداشت‌ها', asset: 'دارایی‌ها', file: 'فایل‌ها' };
export const SEARCH_GROUP_ORDER: SearchKind[] = ['command', 'node', 'object', 'thought', 'note', 'asset', 'file'];

/**
 * One folding for everything in this module (index, query, title bonus, snippet): the retrieval normaliser — Arabic ي/ك → ی/ک,
 * ZWNJ → space, harakat and tatweel out, Persian/Arabic-Indic digits → Latin, lower-case — then collapsed spaces.
 */
const fold = (s: string): string => normalizeText(s).replace(/\s+/g, ' ').trim();

export type HitState = 'truth' | 'proposed' | 'stale' | 'thought' | 'past';
export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** where it lives (node path) or a short type · status line */
  subtitle?: string;
  /** knowledge state of an object or thought: the result row shows its dot (plan 2.2) */
  state?: HitState;
  /** a piece of the text around the match, when the match is not in the title */
  snippet?: string;
  score: number;
  /** the match is not in the title, so a snippet belongs under it (cut with `snippetFor` when not already present) */
  wantsSnippet?: boolean;
  /** how many of the typed words this hit contains (the first sort key) */
  covered?: number;
}
export type SearchGroups = Record<SearchKind, SearchHit[]>;

export interface SearchCommand { id: string; title: string; keywords?: string[]; /** a command registered from outside (`registerPaletteCommand`) carries its own action */ run?: () => void }
/** the shortcuts of the palette; the UI binds each id to an action */
export const COMMANDS: SearchCommand[] = [
  { id: 'compare', title: 'مقایسهٔ منبع در دو لحظه', keywords: ['چه عوض شد', 'تغییر', 'هفتهٔ پیش', 'قبل و بعد', 'اگر تأیید کنم'] },
  { id: 'thought', title: 'فکر تازه', keywords: ['ایده', 'سؤال', 'فرض', 'تصمیم باز', 'یادداشت', 'فکر خام'] },
  { id: 'go-thinking', title: 'رفتن به فکر', keywords: ['فضای فکر', 'فکرها', 'پیشنهاد', 'منتظر', 'ایده', 'سؤال'] },
  { id: 'go-thinking-canvas', title: 'رفتن به بوم فکر', keywords: ['فکر', 'بوم', 'آزاد', 'تابلو', 'چیدن'] },
  { id: 'batch-knowledge', title: 'چند دانش با هم', keywords: ['چندتایی', 'لیست', 'بچسبان', 'پیشنهاد'] },
  { id: 'record', title: 'ثبت دانش', keywords: ['افزودن', 'تازه', 'جدید', 'واقعیت', 'تصمیم', 'خط قرمز', 'قید'] },
  { id: 'ai-request', title: 'آماده‌سازی درخواست', keywords: ['پرامپت', 'ممیزی', 'سؤال', 'کپی', 'ابزار'] },
  { id: 'go-archive', title: 'رفتن به بایگانی', keywords: ['بایگانی', 'حذف', 'برگرداندن', 'حذف دائمی', 'سطل'] },
  { id: 'go-home', title: 'رفتن به خانه', keywords: ['خانه', 'شروع'] },
  { id: 'go-context', title: 'رفتن به منبع حقیقت', keywords: ['دانش', 'درخت', 'ساختار'] },
  { id: 'go-doc', title: 'رفتن به سند', keywords: ['خواندن', 'متن'] },
  { id: 'go-canvas', title: 'رفتن به نمای کلی حقیقت', keywords: ['نمای کلی', 'نقشه', 'رابطه', 'وابستگی', 'بوم'] },
  { id: 'go-assets', title: 'رفتن به خروجی‌ها', keywords: ['دارایی', 'خروجی', 'قدیمی'] },
  { id: 'go-workstreams', title: 'ساخت خروجی (جریان‌های کار)', keywords: ['جریان', 'ساخت', 'بساز'] },
  { id: 'metrics', title: 'شاخص‌ها و اعداد', keywords: ['نتیجه', 'عدد', 'نمودار'] },
  { id: 'packs', title: 'بسته‌های دانش', keywords: ['کپی', 'بسته'] },
  { id: 'import', title: 'وارد کردن متن آماده', keywords: ['چسباندن', 'پاسخ', 'ابزار'] },
];

/** extra palette commands from other features («ثبت سریع» …): they register once and show up in the palette next to the built-in ones */
const extraCommands = new Map<string, SearchCommand>();
export function registerPaletteCommand(cmd: SearchCommand & { run: () => void }): () => void {
  extraCommands.set(cmd.id, cmd);
  return () => { if (extraCommands.get(cmd.id) === cmd) extraCommands.delete(cmd.id); };
}
export const allCommands = (): SearchCommand[] => [...COMMANDS, ...extraCommands.values()];
/** the action of a command registered from outside, if this id is one */
export const registeredCommand = (id: string): SearchCommand | undefined => extraCommands.get(id);

interface Doc { kind: Exclude<SearchKind, 'command'>; id: string; title: string; text: string; subtitle?: string; state?: HitState; content: string; ftitle: string; tf: Map<string, number>; len: number }
/** `postings`: word → [doc, count, doc, count …] — a keystroke only walks the lists of the words it matches, never every text */
export interface SearchIndex { docs: Doc[]; vocab: string[]; df: Map<string, number>; avg: number; postings: Map<string, number[]> }

/** Okapi BM25 (same formula and constants as `retrieval.bm25Rank`) over the pre-counted words of the index */
const K1 = 1.5, B = 0.75;

const STATUS_FA: Partial<Record<ContextObject['status'], string>> = { Proposed: 'پیشنهادی', 'Needs Review': 'نیازمند بازبینی' };
const TYPE_FA: Record<ContextObject['type'], string> = { Fact: 'واقعیت', Decision: 'تصمیم', Constraint: 'خط قرمز' };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

export function buildSearchIndex(input: {
  nodes: TreeNode[];
  objects: ContextObject[];
  deliverables?: Array<{ id: string; title: string; content: string }>;
  notes?: Array<Pick<Note, 'id' | 'nodeId' | 'content'>>;
  thoughts?: Array<Pick<Thought, 'id' | 'nodeId' | 'text' | 'status'>>;
  files?: Array<Pick<StoredFile, 'id' | 'name' | 'nodeId' | 'summary'>>;
}): SearchIndex {
  const labels = new Map(input.nodes.map((n) => [n.id, n.label]));
  const label = (id: string) => labels.get(id) ?? id;
  const paths = new Map<string, string>();
  const path = (id: string) => { let p = paths.get(id); if (p === undefined) { p = ancestorIds(input.nodes, id).reverse().map(label).join(' ‹ '); paths.set(id, p); } return p; };
  type Raw = Omit<Doc, 'tf' | 'len' | 'ftitle'>;
  const raw: Raw[] = [];
  for (const n of input.nodes) raw.push({ kind: 'node', id: n.id, title: n.label, content: n.description, text: `${n.label} ${n.label} ${n.label} ${n.description}`, subtitle: path(n.id) });
  for (const o of input.objects) {
    if (o.sample || o.status === 'Archived' || o.status === 'Superseded') continue;
    const sub = [TYPE_FA[o.type], STATUS_FA[o.status], path(o.nodeId)].filter(Boolean).join(' · ');
    raw.push({ kind: 'object', id: o.id, title: o.title, content: o.content, text: `${o.title} ${o.title} ${o.title} ${o.content} ${(o.facets ?? []).join(' ')} ${path(o.nodeId)}`, subtitle: sub, state: o.status === 'Confirmed' ? 'truth' : o.status === 'Proposed' ? 'proposed' : 'stale' });
  }
  for (const t of input.thoughts ?? []) {
    const title = clip(firstLine(t.text), 90);
    raw.push({ kind: 'thought', id: t.id, title, content: t.text, text: `${title} ${t.text}`, subtitle: [t.status === 'resolved' ? 'حل‌شده' : '', path(t.nodeId)].filter(Boolean).join(' · '), state: t.status === 'resolved' ? 'past' : 'thought' });
  }
  for (const d of input.deliverables ?? []) raw.push({ kind: 'asset', id: d.id, title: d.title, content: d.content, text: `${d.title} ${d.title} ${d.title} ${d.content}` });
  for (const f of input.files ?? []) raw.push({ kind: 'file', id: f.id, title: f.name, content: f.summary ?? '', text: `${f.name} ${f.name} ${f.name} ${f.summary ?? ''}`, ...(f.nodeId ? { subtitle: path(f.nodeId) } : {}) });
  for (const n of input.notes ?? []) {
    const title = clip(firstLine(n.content), 70);
    raw.push({ kind: 'note', id: n.id, title, content: n.content, text: `${title} ${n.content}`, subtitle: path(n.nodeId) });
  }
  const docs: Doc[] = [];
  const df = new Map<string, number>();
  const postings = new Map<string, number[]>();
  for (const r of raw) {
    const toks = tokenize(r.text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    const at = docs.length;
    for (const [t, f] of tf) {
      df.set(t, (df.get(t) ?? 0) + 1);
      const list = postings.get(t);
      if (list) list.push(at, f); else postings.set(t, [at, f]);
    }
    docs.push({ ...r, ftitle: fold(r.title), tf, len: toks.length });
  }
  const avg = docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1) || 1;
  return { docs, vocab: [...df.keys()], df, avg, postings };
}

/** each typed word → the words of the index it starts (or, failing that, contains); an unknown word stays as typed */
export function expandQuery(query: string, vocab: string[]): { terms: string[][]; typed: string[] } {
  const typed = [...new Set(tokenize(query))];
  const terms = typed.map((q) => {
    const starts = vocab.filter((t) => t.startsWith(q));
    if (starts.length) return starts;
    const has = q.length >= 3 ? vocab.filter((t) => t.includes(q)) : [];
    return has.length ? has : [q];
  });
  return { terms, typed };
}

/** `fold` that remembers where each kept character came from (only needed when the folding deletes characters, e.g. harakat) */
function foldWithMap(s: string): { text: string; at: (i: number) => number } {
  const whole = normalizeText(s);
  if (whole.length === s.length) return { text: whole, at: (i) => i }; // 1:1 — the common case
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = normalizeText(s[i]);
    text += c;
    for (let k = 0; k < c.length; k++) map.push(i);
  }
  return { text, at: (i) => map[i] };
}

/** the text around the first typed word, cut from the ORIGINAL text (the folding keeps a map back, so digits / ي / ZWNJ never shift the cut) */
function snippetOf(content: string, typed: string[]): string | undefined {
  if (!content) return undefined;
  const flat = content.replace(/\s+/g, ' ');
  const f = foldWithMap(flat);
  let at = -1;
  for (const q of typed) { const i = f.text.indexOf(q); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return undefined;
  const from = Math.max(0, f.at(at) - 28);
  return `${from > 0 ? '…' : ''}${flat.slice(from, from + 96)}${from + 96 < flat.length ? '…' : ''}`;
}

/** hits per group whose snippet is cut right away; the rest are cut when they are shown (`snippetFor`) — a keystroke never pays for thousands of snippets */
const EAGER_SNIPPETS = 30;
/** the snippet of one hit (for rows beyond the eager ones) */
export function snippetFor(index: SearchIndex, query: string, hit: SearchHit): string | undefined {
  const d = index.docs.find((x) => x.kind === hit.kind && x.id === hit.id);
  if (!d) return undefined;
  const typed = [...new Set(tokenize(query))];
  return snippetOf(d.content, typed);
}

export function searchIndex(index: SearchIndex, query: string, opts: { limitPerGroup?: number; commands?: SearchCommand[] } = {}): SearchGroups {
  const limit = opts.limitPerGroup ?? Infinity;
  const out: SearchGroups = { command: [], node: [], object: [], thought: [], note: [], asset: [], file: [] };
  const q = fold(query);
  const commands = opts.commands ?? allCommands();
  if (!q) { out.command = commands.map((c, i) => ({ kind: 'command' as const, id: c.id, title: c.title, score: -i })).slice(0, Number.isFinite(limit) ? limit * 2 : undefined); return out; }
  const { terms, typed } = expandQuery(q, index.vocab);
  // commands: every typed word starts a word of the title or a keyword
  const words = (c: SearchCommand) => tokenize(`${c.title} ${(c.keywords ?? []).join(' ')}`);
  out.command = commands
    .filter((c) => typed.length > 0 && typed.every((t) => words(c).some((w) => w.startsWith(t))))
    .map((c, i) => ({ kind: 'command' as const, id: c.id, title: c.title, score: 100 - i }))
    .slice(0, limit);
  if (!typed.length) return out;

  const N = index.docs.length;
  const score = new Float64Array(N);
  const covered = new Uint8Array(N);
  const stamp = new Int16Array(N);
  const hit: number[] = [];
  const done = new Set<string>();
  for (const t of terms.flat()) {
    if (done.has(t)) continue;
    done.add(t);
    const list = index.postings.get(t);
    if (!list) continue;
    const n = index.df.get(t) ?? 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    for (let k = 0; k < list.length; k += 2) {
      const d = list[k], f = list[k + 1];
      if (score[d] === 0) hit.push(d);
      score[d] += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.docs[d].len) / index.avg)));
    }
  }
  // how many of the typed words each document contains (each typed word counts once, however many words it expands to)
  terms.forEach((alts, ti) => {
    for (const a of alts) {
      const list = index.postings.get(a);
      if (!list) continue;
      for (let k = 0; k < list.length; k += 2) { const d = list[k]; if (stamp[d] !== ti + 1) { stamp[d] = ti + 1; covered[d]++; } }
    }
  });
  const scored = hit.map((d) => {
    const nt = index.docs[d].ftitle;
    return { d: index.docs[d], covered: covered[d], score: score[d] + (nt.startsWith(q) ? 6 : nt.includes(q) ? 3 : 0) };
  });
  scored.sort((a, b) => b.covered - a.covered || b.score - a.score || (a.d.id < b.d.id ? -1 : a.d.id > b.d.id ? 1 : 0));
  for (const { d, score: sc, covered: cv } of scored) {
    const g = out[d.kind];
    if (g.length >= limit) continue;
    const inTitle = typed.some((t) => d.ftitle.includes(t));
    const wantsSnippet = !inTitle || d.kind === 'note' || d.kind === 'thought';
    const snippet = wantsSnippet && g.length < EAGER_SNIPPETS ? snippetOf(d.content, typed) : undefined;
    g.push({ kind: d.kind, id: d.id, title: d.title, ...(d.subtitle ? { subtitle: d.subtitle } : {}), ...(d.state ? { state: d.state } : {}), ...(snippet ? { snippet } : {}), ...(wantsSnippet ? { wantsSnippet } : {}), score: sc, covered: cv });
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

/**
 * Progressive disclosure: every group shows its best `FIRST_SHOWN` hits; «نمایش بیشتر» reveals `MORE_STEP` more each time.
 * There is no fixed ceiling — a group keeps every hit and the person decides how far to read.
 */
export const FIRST_SHOWN = 5;
export const MORE_STEP = 10;
export const shownCount = (expanded: number | undefined): number => FIRST_SHOWN + (expanded ?? 0) * MORE_STEP;
