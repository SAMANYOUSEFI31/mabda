/**
 * آزمون کیفیت فارسی لایهٔ هوش: `bun run eval:intelligence`
 *   --only=related,judge,placement,duplicates,contradictions,asr   فقط این دسته‌ها
 *   --limit=N                                                      فقط N مورد اول هر دسته (آزمون سریع)
 *   --dry                                                          فقط برنامه را نشان بده، فراخوانی نکن
 *   --out=docs/eval/نام.md                                         مسیر گزارش
 * کلید لازم است (LIARA_BASE_URL و LIARA_API_KEY)؛ نبودش خطا نیست: روشن می‌گوید چه لازم است و با کد ۰ تمام می‌شود.
 */
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryCallLog } from '../../server/intelligence/callLog.ts';
import { loadIntelligenceConfig } from '../../server/intelligence/config.ts';
import { MemoryEmbeddingStore } from '../../server/intelligence/embeddingStore.ts';
import { createLiaraSpecialists, readLiaraEnv } from '../../server/intelligence/providers/liara.ts';
import type { Env, Item } from '../../server/intelligence/recipes.ts';
import type { JudgmentQuestion } from '../../server/intelligence/types.ts';
import type { Dataset } from './datasetTypes.ts';
import { calibrateTokens, evalAsr, evalContradictions, evalDuplicatesJudge, evalDuplicatesScore, evalJudge, evalPlacement, evalRelated, loadAudio, type Ctx, type EvalResult, type PlacementCombo, type RelatedCombo, type ScoreMethod, type Task } from './evaluators.ts';
import { renderReport, type Bars } from './report.ts';
import { validateDataset } from './validate-dataset.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

interface Combos {
  bars: Bars;
  thresholdPrecision: { strong: number; weak: number };
  related: RelatedCombo[];
  judge: string[];
  placement: PlacementCombo[];
  duplicates: { scoreMethods: ScoreMethod[]; judges: string[] };
  contradictions: { judges: string[] };
  asr: { models: 'all' | string[] };
}

const ALL: Task[] = ['related', 'judge', 'placement', 'duplicates', 'contradictions', 'asr'];

function mergeUserSection(d: Dataset): { dataset: Dataset; userCases: number } {
  const u = d.userSection;
  let userCases = 0;
  const merged: Dataset = structuredClone(d);
  merged.sections.push(...u.sections);
  merged.corpus.push(...u.corpus);
  for (const [k, v] of Object.entries(u.tasks)) { const arr = (v ?? []) as unknown[]; userCases += arr.length; (merged.tasks as unknown as Record<string, unknown[]>)[k].push(...arr); }
  return { dataset: merged, userCases };
}

async function main(): Promise<void> {
  const cfg = loadIntelligenceConfig();
  const raw = JSON.parse(readFileSync(path.join(here, 'dataset.json'), 'utf8')) as Dataset;
  const problems = validateDataset(raw);
  if (problems.length) { console.error(`dataset.json نامعتبر است:\n- ${problems.join('\n- ')}`); process.exitCode = 1; return; }
  const { dataset, userCases } = mergeUserSection(raw);
  const combos = JSON.parse(readFileSync(path.join(here, 'combos.json'), 'utf8')) as Combos;
  const questions = JSON.parse(readFileSync(path.join(here, 'questions.json'), 'utf8')) as { duplicates: JudgmentQuestion; contradictions: JudgmentQuestion };
  const only = (arg('only')?.split(',').filter(Boolean) as Task[] | undefined) ?? ALL;
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const audio = loadAudio(path.join(here, 'audio'));
  const caseCount = Object.values(dataset.tasks).reduce((n, a) => n + a.length, 0);

  const plan = [
    only.includes('related') && `مرتبط‌ها: ${combos.related.length} ترکیب × ${dataset.tasks.related.length} مورد`,
    only.includes('judge') && `این چیست؟: ${combos.judge.length} داور × (${dataset.tasks.thoughtKind.length}+${dataset.tasks.knowledgeType.length}+${dataset.tasks.certainty.length}) مورد`,
    only.includes('placement') && `کجا برود؟: ${combos.placement.length} ترکیب × ${dataset.tasks.placement.length} مورد`,
    only.includes('duplicates') && `تکراری: ${combos.duplicates.scoreMethods.length} روش امتیازی + ${combos.duplicates.judges.length} داور × ${dataset.tasks.duplicates.length} جفت`,
    only.includes('contradictions') && `تناقض: ${combos.contradictions.judges.length} داور × ${dataset.tasks.contradictions.length} مورد`,
    only.includes('asr') && `گفتار به متن: همهٔ مدل‌های گفتار × ${audio.length} فایل صدا`,
  ].filter(Boolean) as string[];

  const creds = readLiaraEnv(cfg, process.env);
  if (!creds || flag('dry')) {
    if (!creds) {
      console.log([
        'آزمون کیفیت لایهٔ هوش اجرا نشد چون کلید لیارا تنظیم نیست.',
        `لازم است در فایل .env (یا محیط) این دو را بگذاری:`,
        `  ${cfg.liara.baseUrlEnv}=نشانی سرویس لیارا شما (مثل https://ai.liara.ir/api/<شناسه>/v1)`,
        `  ${cfg.liara.apiKeyEnv}=کلید API لیارا`,
        'سپس دوباره: bun run eval:intelligence',
        audio.length ? '' : 'برای سنجش گفتار به متن چند فایل صوتی کوتاه فارسی با متن درستشان در scripts/eval-intelligence/audio/ بگذار (راهنما در همان پوشه).',
        '',
      ].filter((l) => l !== undefined).join('\n'));
    }
    console.log(`داده: ${caseCount} مورد (${userCases} مورد از بخش کاربر)، پیکرهٔ ${dataset.corpus.length} موردی؛ ${audio.length} فایل صدا.\nبرنامهٔ اجرا:\n- ${plan.join('\n- ')}`);
    return;
  }

  const log = new MemoryCallLog();
  const specialists = createLiaraSpecialists(cfg, creds);
  const store = new MemoryEmbeddingStore();
  const makeEnv = (c: typeof cfg): Env => ({ cfg: c, specialists, store, call: { log, recipe: 'eval' } });
  const corpus: Item[] = dataset.corpus.map((c) => ({ id: c.id, kind: c.kind === 'knowledge' ? 'object' : c.kind, text: c.title ? `${c.title}\n${c.text}` : c.text }));
  const itemSection = Object.fromEntries(dataset.corpus.map((c) => [c.id, c.nodeId]));
  const ctx: Ctx = { cfg, specialists, log, makeEnv, dataset, corpus, itemSection, limit };

  const results: EvalResult[] = [];
  const skipped: string[] = [];
  const run = async (label: string, fn: () => Promise<EvalResult>): Promise<void> => {
    process.stdout.write(`… ${label}`);
    try { const r = await fn(); results.push(r); console.log(` ✓ (${r.n} مورد، ${r.errors} خطا)`); }
    catch (e) { console.log(` ✗`); skipped.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
  };

  // سنجش توکن: نمونهٔ متن‌های دادهٔ خودمان در برابر شمارش واقعی سرویس
  const tokenCalibration: Record<string, { ratio: number | null; samples: number; worst: number | null; charsPerToken?: number }> = {};
  if (only.includes('related')) {
    const sample = dataset.corpus.map((c) => c.text).slice(0, 24);
    for (const m of Object.values(cfg.models).filter((m) => m.kind === 'embedding')) {
      process.stdout.write(`… سنجش توکن ${m.key}`);
      tokenCalibration[m.key] = { ...(await calibrateTokens(ctx, m.key, sample)), charsPerToken: m.charsPerToken };
      console.log(' ✓');
    }
  }

  if (only.includes('related')) for (const c of combos.related) await run(`مرتبط‌ها «${c.name}»`, () => evalRelated(ctx, c, combos.thresholdPrecision));
  if (only.includes('judge')) for (const j of combos.judge) await run(`این چیست؟ «${j}»`, () => evalJudge(ctx, j));
  if (only.includes('placement')) for (const c of combos.placement) await run(`کجا برود؟ «${c.name}»`, () => evalPlacement(ctx, c, combos.related));
  if (only.includes('duplicates')) {
    for (const m of combos.duplicates.scoreMethods) await run(`تکراری «${m.name}»`, () => evalDuplicatesScore(ctx, m));
    for (const j of combos.duplicates.judges) await run(`تکراری داور «${j}»`, () => evalDuplicatesJudge(ctx, j, questions.duplicates));
  }
  if (only.includes('contradictions')) for (const j of combos.contradictions.judges) await run(`تناقض «${j}»`, () => evalContradictions(ctx, j, questions.contradictions));
  if (only.includes('asr')) {
    if (!audio.length) skipped.push('گفتار به متن: فایل صدایی در scripts/eval-intelligence/audio/ نبود');
    else for (const m of Object.values(cfg.models).filter((x) => x.kind === 'transcription' && (combos.asr.models === 'all' || combos.asr.models.includes(x.key)))) await run(`گفتار «${m.key}»`, () => evalAsr(ctx, m.key, audio));
  }

  const date = new Date().toISOString().slice(0, 10);
  const md = renderReport(results, {
    date, datasetCases: caseCount, corpusItems: dataset.corpus.length, userCases, asrFiles: audio.length, skipped, bars: combos.bars, thresholdPrecision: combos.thresholdPrecision, tokenCalibration,
    models: Object.fromEntries(Object.values(cfg.models).map((m) => [m.key, { id: m.id, kind: m.kind }])),
  });
  const out = path.resolve(root, arg('out') ?? path.join('docs', 'eval', `${date}-intelligence.md`));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, md, 'utf8');
  // دادهٔ خام (بدون متن رونویسی‌شدهٔ صدای کاربر)
  const stripped = results.map((r) => (r.task === 'asr' ? { ...r, extras: { ...r.extras, perFile: (r.extras.perFile as Array<{ file: string; cer: number; wer: number }>).map(({ file, cer, wer }) => ({ file, cer, wer })) } } : r));
  writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify({ date, results: stripped, calls: log.records.length }, null, 2), 'utf8');
  console.log(`\nگزارش: ${path.relative(root, out)}${skipped.length ? `\nاجرا نشد: ${skipped.length} مورد (در گزارش آمده)` : ''}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
