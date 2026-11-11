/**
 * Response time of the unified search on a synthetic workspace of 5000 items (deterministic: same data every run).
 *   npx tsx scripts/bench-search.ts            # prints a table; exits 1 if a query is slower than the budget
 *   BENCH_ITEMS=20000 npx tsx scripts/bench-search.ts
 * The items are split like a real workspace: knowledge, thoughts, notes, outputs, files and sections.
 * «response time» = what one keystroke costs: `searchIndex` over the ready index (the index itself is built once per data change).
 */
import { buildSearchIndex, searchIndex, totalHits } from '../src/core/globalSearch.ts';
import type { ContextObject, Note, StoredFile, Thought, TreeNode } from '../src/types/index.ts';

const TOTAL = Number(process.env.BENCH_ITEMS ?? 5000);
const BUDGET_MS = Number(process.env.BENCH_BUDGET_MS ?? 50);

let seed = 20260711;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

const SYL = ['قی', 'مت', 'مخا', 'طب', 'برن', 'د', 'لحن', 'اش', 'ترا', 'ک', 'ماه', 'انه', 'فروش', 'کانال', 'تلگ', 'رام', 'سفا', 'رش', 'مشت', 'ری', 'پشتی', 'بانی', 'ساع', 'ت', 'تخ', 'فیف', 'پایی', 'زی', 'طرا', 'حی', 'رقی', 'ب', 'هدف', 'بازار', 'محصول', 'بسته', 'کمپین', 'ایمیل', 'وب', 'سایت'];
const word = () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(SYL)).join('');
const WORDS = Array.from({ length: 1800 }, word);
const sentence = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
const fa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const nodes: TreeNode[] = [{ id: 'root', label: 'کسب‌وکار', description: '', order: 0 }];
for (let i = 0; i < 40; i++) nodes.push({ id: `n${i}`, label: `بخش ${pick(WORDS)} ${fa(i)}`, parentId: i < 8 ? 'root' : `n${i % 8}`, description: sentence(8), order: i });

const share = { objects: 0.45, thoughts: 0.2, notes: 0.15, assets: 0.12, files: 0.08 };
const count = (k: keyof typeof share) => Math.round(TOTAL * share[k]);
const at = () => pick(nodes).id;
const objects: ContextObject[] = Array.from({ length: count('objects') }, (_, i) => ({
  id: `o${i}`, workspaceId: 'w', type: pick(['Fact', 'Decision', 'Constraint'] as const), status: 'Confirmed', provenance: 'User Input',
  title: `${sentence(3)} ${fa(i)}`, content: sentence(40), nodeId: at(), version: 1, createdAt: '', updatedAt: '',
}));
const thoughts: Thought[] = Array.from({ length: count('thoughts') }, (_, i) => ({ id: `t${i}`, workspaceId: 'w', nodeId: at(), kind: null, text: sentence(14), status: i % 5 ? 'open' : 'resolved', createdAt: '', updatedAt: '' }));
const notes: Note[] = Array.from({ length: count('notes') }, (_, i) => ({ id: `m${i}`, workspaceId: 'w', nodeId: at(), content: `${sentence(5)}\n${sentence(60)}`, createdAt: '', updatedAt: '' }));
const deliverables = Array.from({ length: count('assets') }, (_, i) => ({ id: `d${i}`, title: sentence(3), content: sentence(150) }));
const files: StoredFile[] = Array.from({ length: count('files') }, (_, i) => ({ id: `f${i}`, workspaceId: 'w', nodeId: at(), name: `${pick(WORDS)}-${i}.pdf`, mime: 'application/pdf', sizeBytes: 1, status: 'ready', tokens: 1, chunkCount: 1, summary: sentence(30), createdAt: '' }));

const items = objects.length + thoughts.length + notes.length + deliverables.length + files.length;
const t0 = performance.now();
const index = buildSearchIndex({ nodes, objects, deliverables, notes, thoughts, files });
const buildMs = performance.now() - t0;

const [w1, w2, w3] = [WORDS[3], WORDS[40], WORDS[900]];
const queries: Array<[string, string]> = [
  ['۲ حرف (پیشوند پرشمار)', w1.slice(0, 2)],
  ['۳ حرف', w1.slice(0, 3)],
  ['یک واژه', w2],
  ['دو واژه', `${w2} ${w3}`],
  ['سه واژه', `${w1} ${w2} ${w3}`],
  ['رقم فارسی', fa(1234)],
  ['رقم لاتین', '1234'],
  ['بدون نتیجه', 'zzzzqqq'],
];

const RUNS = 40;
const pct = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log(`items: ${items} (sections ${nodes.length}) · index build: ${buildMs.toFixed(0)} ms · distinct words: ${index.vocab.length}`);
console.log('query'.padEnd(26), 'hits'.padStart(6), 'p50 ms'.padStart(8), 'p95 ms'.padStart(8), 'max ms'.padStart(8));
let worst = 0;
for (const [name, q] of queries) {
  searchIndex(index, q); // warm-up
  const ms: number[] = [];
  let hits = 0;
  for (let i = 0; i < RUNS; i++) { const s = performance.now(); const g = searchIndex(index, q); ms.push(performance.now() - s); hits = totalHits(g); }
  worst = Math.max(worst, pct(ms, 0.95));
  console.log(name.padEnd(26), String(hits).padStart(6), pct(ms, 0.5).toFixed(2).padStart(8), pct(ms, 0.95).toFixed(2).padStart(8), Math.max(...ms).toFixed(2).padStart(8));
}
console.log(`worst p95: ${worst.toFixed(2)} ms (budget ${BUDGET_MS} ms)`);
process.exit(worst > BUDGET_MS ? 1 : 0);
