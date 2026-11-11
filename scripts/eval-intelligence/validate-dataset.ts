/**
 * اعتبارسنج `dataset.json`: `tsx scripts/eval-intelligence/validate-dataset.ts [مسیر]`
 * با `validateDataset(d)` فهرست مشکل‌ها را برمی‌گرداند (اسکریپت اصلی آزمون هم از همین استفاده می‌کند).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Dataset, HardTag } from './datasetTypes.ts';

const THOUGHT_KINDS = ['idea', 'question', 'assumption', 'open_decision'];
const KNOWLEDGE_TYPES = ['Fact', 'Decision', 'Constraint'];
const CERTAINTY = ['certain', 'uncertain'];
const DUP_LABELS = ['duplicate', 'near_duplicate', 'same_topic_different', 'unrelated'];
const CONTRA = ['contradicts', 'consistent'];
const TAGS: HardTag[] = ['long', 'unordered', 'no_headings', 'multi_topic', 'mixed_lang', 'names_numbers'];
const CORPUS_KINDS = ['thought', 'knowledge', 'note'];
const TASK_NAMES = ['thoughtKind', 'knowledgeType', 'certainty', 'placement', 'related', 'duplicates', 'contradictions'] as const;
const MIN_TOTAL = 150;
const MIN_PER_TAG = 6;

type AnyCase = { id?: string; tags?: string[] } & Record<string, unknown>;

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** فهرست مشکل‌ها؛ خالی = معتبر. ضوابط شمار (کل ≥۱۵۰، هر برچسب ≥۶) فقط برای بخش اصلی است. */
export function validateDataset(d: Dataset): string[] {
  const p: string[] = [];
  if (!d || typeof d !== 'object') return ['فایل شیء نیست'];
  if (typeof d.version !== 'number') p.push('version عدد نیست');
  if (!nonEmpty(d.description)) p.push('description خالی است');
  if (!d.tasks || typeof d.tasks !== 'object') return [...p, 'tasks نیست'];

  const check = (scope: string, sections: Dataset['sections'], corpus: Dataset['corpus'], tasks: Partial<Dataset['tasks']>, prefix: string, outer?: { sectionIds: Set<string>; corpusIds: Set<string>; corpusKinds: Map<string, string> }) => {
    const sectionIds = new Set<string>(outer?.sectionIds ?? []);
    const seen = new Set<string>();
    for (const s of sections ?? []) {
      if (!nonEmpty(s.id) || !nonEmpty(s.label)) p.push(`${scope}: بخش بدون id/label`);
      if (sectionIds.has(s.id)) p.push(`${scope}: شناسهٔ بخش تکراری ${s.id}`);
      sectionIds.add(s.id);
    }
    for (const s of sections ?? []) if (s.parentId !== null && !sectionIds.has(s.parentId)) p.push(`${scope}: parentId ناموجود برای بخش ${s.id}: ${s.parentId}`);
    const corpusIds = new Set<string>(outer?.corpusIds ?? []);
    const corpusKinds = new Map<string, string>(outer?.corpusKinds ?? []);
    for (const c of corpus ?? []) {
      if (!nonEmpty(c.id)) { p.push(`${scope}: مورد corpus بدون id`); continue; }
      if (corpusIds.has(c.id)) p.push(`${scope}: شناسهٔ corpus تکراری ${c.id}`);
      corpusIds.add(c.id); corpusKinds.set(c.id, c.kind);
      if (prefix && !c.id.startsWith(prefix)) p.push(`${scope}: شناسهٔ ${c.id} باید با ${prefix} شروع شود`);
      if (!CORPUS_KINDS.includes(c.kind)) p.push(`corpus ${c.id}: kind نامعتبر ${String(c.kind)}`);
      if (!sectionIds.has(c.nodeId)) p.push(`corpus ${c.id}: nodeId ناموجود ${c.nodeId}`);
      if (!nonEmpty(c.text)) p.push(`corpus ${c.id}: متن خالی`);
      if (c.kind === 'thought' && !THOUGHT_KINDS.includes(c.thoughtKind as string)) p.push(`corpus ${c.id}: thoughtKind نامعتبر`);
      if (c.kind === 'knowledge' && !KNOWLEDGE_TYPES.includes(c.knowledgeType as string)) p.push(`corpus ${c.id}: knowledgeType نامعتبر`);
    }
    const ids = new Set<string>();
    const base = (name: string, x: AnyCase) => {
      const where = `${scope}/${name}/${x.id ?? '؟'}`;
      if (!nonEmpty(x.id)) p.push(`${where}: بدون id`);
      else {
        if (ids.has(x.id)) p.push(`${where}: id تکراری`);
        ids.add(x.id);
        if (prefix && !x.id.startsWith(prefix)) p.push(`${where}: id باید با ${prefix} شروع شود`);
      }
      for (const t of (x.tags ?? []) as string[]) if (!TAGS.includes(t as HardTag)) p.push(`${where}: tag نامعتبر ${t}`);
      return where;
    };
    const t = (tasks ?? {}) as Record<string, AnyCase[] | undefined>;
    for (const x of t.thoughtKind ?? []) { const w = base('thoughtKind', x); if (!nonEmpty(x.text)) p.push(`${w}: text خالی`); if (!THOUGHT_KINDS.includes(x.expected as string)) p.push(`${w}: expected نامعتبر`); }
    for (const x of t.knowledgeType ?? []) { const w = base('knowledgeType', x); if (!nonEmpty(x.text)) p.push(`${w}: text خالی`); if (!KNOWLEDGE_TYPES.includes(x.expected as string)) p.push(`${w}: expected نامعتبر`); }
    for (const x of t.certainty ?? []) { const w = base('certainty', x); if (!nonEmpty(x.text)) p.push(`${w}: text خالی`); if (!CERTAINTY.includes(x.expected as string)) p.push(`${w}: expected نامعتبر`); }
    for (const x of t.placement ?? []) {
      const w = base('placement', x);
      if (!nonEmpty(x.text)) p.push(`${w}: text خالی`);
      const exp = x.expectedNodeIds as string[] | undefined;
      if (!Array.isArray(exp)) { p.push(`${w}: expectedNodeIds آرایه نیست`); continue; }
      if (x.expectNone === true && exp.length > 0) p.push(`${w}: expectNone با expectedNodeIds ناسازگار است`);
      if (x.expectNone !== true && exp.length === 0) p.push(`${w}: expectedNodeIds خالی بدون expectNone`);
      for (const id of [...exp, ...((x.acceptableNodeIds as string[] | undefined) ?? [])]) if (!sectionIds.has(id)) p.push(`${w}: بخش ناموجود ${id}`);
      for (const id of (x.acceptableNodeIds as string[] | undefined) ?? []) if (exp.includes(id)) p.push(`${w}: ${id} هم expected هم acceptable است`);
      if ((x.tags ?? []).includes('multi_topic') && exp.length < 2) p.push(`${w}: multi_topic ولی کمتر از دو بخش`);
    }
    for (const x of t.related ?? []) {
      const w = base('related', x);
      if (!nonEmpty(x.query)) p.push(`${w}: query خالی`);
      const rel = (x.relevant as Array<{ id: string; grade: number }> | undefined) ?? [];
      if (rel.length === 0) p.push(`${w}: relevant خالی`);
      const hnIds = (x.hardNegativeIds as string[] | undefined) ?? [];
      if (hnIds.length < 2) p.push(`${w}: hardNegativeIds کمتر از ۲`);
      for (const r of rel) { if (!corpusIds.has(r.id)) p.push(`${w}: relevant ناموجود ${r.id}`); if (r.grade !== 1 && r.grade !== 2) p.push(`${w}: grade نامعتبر`); }
      for (const id of hnIds) { if (!corpusIds.has(id)) p.push(`${w}: hardNegative ناموجود ${id}`); if (rel.some((r) => r.id === id)) p.push(`${w}: ${id} هم relevant هم hardNegative است`); }
      const qc = x.queryCorpusId as string | undefined;
      if (qc !== undefined) {
        if (!corpusIds.has(qc)) p.push(`${w}: queryCorpusId ناموجود ${qc}`);
        if (rel.some((r) => r.id === qc) || hnIds.includes(qc)) p.push(`${w}: مورد خودِ پرس‌وجو در نتیجه است`);
      }
      if (new Set(rel.map((r) => r.id)).size !== rel.length) p.push(`${w}: relevant تکراری`);
    }
    for (const x of t.duplicates ?? []) { const w = base('duplicates', x); if (!nonEmpty(x.a) || !nonEmpty(x.b)) p.push(`${w}: a/b خالی`); if (!DUP_LABELS.includes(x.label as string)) p.push(`${w}: label نامعتبر`); }
    for (const x of t.contradictions ?? []) {
      const w = base('contradictions', x);
      const rl = x.redline as { id?: string; text?: string } | undefined;
      if (!rl || !nonEmpty(rl.id) || !nonEmpty(rl.text)) p.push(`${w}: redline ناقص`);
      if (!nonEmpty(x.statement)) p.push(`${w}: statement خالی`);
      if (!CONTRA.includes(x.label as string)) p.push(`${w}: label نامعتبر`);
    }
    return { sectionIds, corpusIds, corpusKinds };
  };

  const main = check('main', d.sections, d.corpus, d.tasks, '');

  // ضوابط شمار (بخش اصلی)
  const tasks = d.tasks as unknown as Record<string, AnyCase[]>;
  for (const n of TASK_NAMES) if (!Array.isArray(tasks[n])) p.push(`tasks.${n} آرایه نیست`);
  const total = TASK_NAMES.reduce((s, n) => s + (tasks[n]?.length ?? 0), 0);
  if (total < MIN_TOTAL) p.push(`جمع موردها ${total} است؛ دست‌کم ${MIN_TOTAL} لازم است`);
  if ((d.corpus?.length ?? 0) < 60) p.push(`corpus ${d.corpus?.length ?? 0} مورد دارد؛ دست‌کم ۶۰ لازم است`);
  for (const tag of TAGS) {
    const k = TASK_NAMES.reduce((s, n) => s + (tasks[n] ?? []).filter((x) => (x.tags ?? []).includes(tag)).length, 0);
    if (k < MIN_PER_TAG) p.push(`برچسب ${tag}: ${k} مورد؛ دست‌کم ${MIN_PER_TAG} لازم است`);
  }
  const expectNone = (d.tasks.placement ?? []).filter((x) => x.expectNone).length;
  if (expectNone < 4) p.push(`expectNone ${expectNone} مورد؛ دست‌کم ۴ لازم است`);
  // موردهای long واقعاً بلند باشند
  for (const n of TASK_NAMES) for (const x of tasks[n] ?? []) {
    if (!(x.tags ?? []).includes('long')) continue;
    const text = (x.text ?? x.query ?? x.a ?? x.statement) as string | undefined;
    if (typeof text === 'string' && text.length < 1200) p.push(`${n}/${x.id}: برچسب long ولی فقط ${text.length} نویسه`);
  }
  // مورد long
  const nLong = TASK_NAMES.reduce((s, n) => s + (tasks[n] ?? []).filter((x) => (x.tags ?? []).includes('long')).length, 0);
  if (nLong < 5) p.push(`long: ${nLong}؛ دست‌کم ۵ لازم است`);

  // بخش کاربر: خالی یا معتبر، شناسه‌ها با user_
  const u = d.userSection;
  if (!u || typeof u !== 'object') p.push('userSection نیست');
  else {
    if (!nonEmpty(u._help)) p.push('userSection._help خالی است');
    if (!Array.isArray(u.sections) || !Array.isArray(u.corpus) || typeof u.tasks !== 'object' || u.tasks === null) p.push('userSection شکل نامعتبر دارد');
    else check('user', u.sections, u.corpus, u.tasks, 'user_', main);
  }
  return p;
}

function count<T>(xs: T[], key: (x: T) => string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) { const k = key(x); if (k !== undefined) out[k] = (out[k] ?? 0) + 1; }
  return out;
}

function report(d: Dataset): void {
  const t = d.tasks as unknown as Record<string, AnyCase[]>;
  console.log('— شمار هر دسته —');
  let total = 0;
  for (const n of TASK_NAMES) { console.log(`  ${n}: ${t[n]?.length ?? 0}`); total += t[n]?.length ?? 0; }
  console.log(`  جمع: ${total} | corpus: ${d.corpus.length} | بخش‌ها: ${d.sections.length}`);
  console.log('— شمار هر برچسب (کل دسته‌ها) —');
  for (const tag of TAGS) {
    const per = TASK_NAMES.map((n) => `${n}=${(t[n] ?? []).filter((x) => (x.tags ?? []).includes(tag)).length}`).join(' ');
    const sum = TASK_NAMES.reduce((s, n) => s + (t[n] ?? []).filter((x) => (x.tags ?? []).includes(tag)).length, 0);
    console.log(`  ${tag}: ${sum}  (${per})`);
  }
  console.log('— شمار هر برچسب درست در هر دسته —');
  const show = (name: string, c: Record<string, number>) => console.log(`  ${name}: ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  show('thoughtKind', count(t.thoughtKind, (x) => x.expected as string));
  show('knowledgeType', count(t.knowledgeType, (x) => x.expected as string));
  show('certainty', count(t.certainty, (x) => x.expected as string));
  show('duplicates', count(t.duplicates, (x) => x.label as string));
  show('contradictions', count(t.contradictions, (x) => x.label as string));
  show('placement', { expectNone: t.placement.filter((x) => x.expectNone).length, multi: t.placement.filter((x) => (x.expectedNodeIds as string[]).length > 1).length, single: t.placement.filter((x) => (x.expectedNodeIds as string[]).length === 1).length });
  const pe: Record<string, number> = {};
  for (const x of t.placement) for (const id of x.expectedNodeIds as string[]) pe[id] = (pe[id] ?? 0) + 1;
  show('placement بر حسب بخش', pe);
  show('corpus', count(d.corpus, (c) => c.kind));
}

const thisFile = 'validate-dataset.ts';
if (process.argv[1]?.replace(/\\/g, '/').endsWith(thisFile)) {
  const path = process.argv[2] ?? fileURLToPath(new URL('./dataset.json', import.meta.url));
  let data: Dataset;
  try { data = JSON.parse(readFileSync(path, 'utf8')) as Dataset; }
  catch (e) { console.error(`dataset.json خوانده یا parse نشد: ${(e as Error).message}`); process.exit(1); }
  const problems = validateDataset(data);
  if (problems.length === 0) report(data);
  if (problems.length > 0) {
    console.error(`${problems.length} مشکل:`);
    for (const x of problems) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log('dataset.json معتبر است.');
}
