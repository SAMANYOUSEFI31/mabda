import type { EvalResult, Task } from './evaluators.ts';

export interface Bars {
  related: { recallAt5: number; precisionAt5: number; hardNegativeAt5: number };
  judge: { accuracy: number };
  placement: { accuracy: number; wrongAssignment: number };
  duplicates: { f1Duplicate: number };
  contradictions: { accuracy: number; falseAlarm: number };
  asr: { wer: number };
}

export interface ReportMeta {
  date: string;
  datasetCases: number;
  corpusItems: number;
  userCases: number;
  models: Record<string, { id: string; kind: string }>;
  tokenCalibration: Record<string, { ratio: number | null; samples: number; worst: number | null; charsPerToken?: number }>;
  asrFiles: number;
  skipped: string[];
  bars: Bars;
  thresholdPrecision: { strong: number; weak: number };
}

const pct = (x: number | null | undefined, d = 0): string => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(d)}٪`.replace(/\d/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'[+c])));
const num = (x: number | null | undefined, d = 2): string => (x === null || x === undefined ? '—' : x.toFixed(d).replace(/\d/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'[+c])));
const fa = (x: number): string => String(x).replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c]);
const usd = (x: number | null): string => (x === null ? 'نامعلوم' : `$${x < 0.01 ? x.toPrecision(2) : x.toFixed(3)}`);
const ms = (x: number | null): string => (x === null ? '—' : `${fa(Math.round(x))}ms`);
const ci = (x: unknown): string => (Array.isArray(x) ? `${pct(x[0])}–${pct(x[1])}` : '—');
const errs = (r: EvalResult): string => (r.errors ? `${fa(r.errors)} (${Object.entries(r.errorKinds).map(([k, v]) => `${k}:${fa(v)}`).join('، ')})` : '۰');

const table = (head: string[], rows: string[][]): string => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const by = (rs: EvalResult[], task: Task): EvalResult[] => rs.filter((r) => r.task === task);

/** بهترین با اولویت کیفیت: کلیدهای مرتب‌سازی به ترتیب؛ پیکان ↓ یعنی بیشتر بهتر است، ↑ یعنی کمتر بهتر است */
function rank(rs: EvalResult[], keys: Array<[string, 'desc' | 'asc']>): EvalResult[] {
  const v = (r: EvalResult, k: string) => r.metrics[k] ?? (keys.find(([kk]) => kk === k)?.[1] === 'desc' ? -Infinity : Infinity);
  return [...rs].filter((r) => r.n > 0).sort((a, b) => {
    for (const [k, dir] of keys) { const d = v(a, k) - v(b, k); if (d !== 0 && Number.isFinite(d)) return dir === 'desc' ? -d : d; }
    const ca = a.costPer1000Usd ?? Infinity, cb = b.costPer1000Usd ?? Infinity;
    return ca - cb; // کیفیت برابر → ارزان‌تر (هزینه فقط شکستن تساوی است)
  });
}

const noteNear = (rs: EvalResult[], best: EvalResult, key: string, eps: number): string => {
  const near = rs.filter((r) => r !== best && r.n > 0 && (best.metrics[key] ?? 0) - (r.metrics[key] ?? 0) <= eps && (r.costPer1000Usd ?? Infinity) < (best.costPer1000Usd ?? Infinity));
  return near.length ? `\n> ارزان‌تر با کیفیتِ نزدیک (اختلاف ≤ ${pct(eps)}؛ با این حجم داده معمولاً کمتر از خطای اندازه‌گیری است): ${near.map((r) => `«${r.name}»`).join('، ')}. اولویت کیفیت است، پس این‌ها فقط گزارش می‌شوند.\n` : '';
};

export function renderReport(results: EvalResult[], meta: ReportMeta): string {
  const out: string[] = [];
  const bad: string[] = [];
  out.push(`# گزارش آزمون کیفیت لایهٔ هوش (فارسی)\n`);
  out.push(`تاریخ اجرا: ${meta.date} · ${fa(meta.datasetCases)} مورد آزمون، پیکرهٔ ${fa(meta.corpusItems)} موردی${meta.userCases ? `، شامل ${fa(meta.userCases)} مورد کاربر` : ''} · ${fa(meta.asrFiles)} فایل صدا\n`);
  out.push(`> این گزارش را \`bun run eval:intelligence\` می‌سازد؛ دستی ویرایش نکن. **اولویت کیفیت و درستی است؛ هزینه فقط تساوی را می‌شکند.** با این حجم داده اختلاف‌های کوچک‌تر از بازهٔ اطمینان معنا ندارند؛ جاهایی که «۹۵٪ بازه» آمده برای همین است.\n`);
  if (meta.skipped.length) out.push(`**اجرا نشد:** ${meta.skipped.join('؛ ')}\n`);

  out.push(`## مدل‌ها و سنجش توکن\n`);
  out.push(table(['کلید', 'نوع', 'شناسه'], Object.entries(meta.models).map(([k, m]) => [k, m.kind, `\`${m.id}\``])));
  const cal = Object.entries(meta.tokenCalibration);
  if (cal.length) {
    out.push(`\nنسبت «توکن واقعی ÷ تخمین ما» (تخمین ما = نویسه ÷ charsPerToken، گرد به بالا): بالاتر از ۱ یعنی تخمین کم‌شماری می‌کند و تکه‌ها ممکن است از سقف مدل بگذرند؛ آن‌وقت \`charsPerToken\` در models.json را کمتر کن.\n`);
    out.push(table(['مدل', 'charsPerToken', 'نمونه', 'نسبت میانگین', 'بدترین نسبت', 'نتیجه'], cal.map(([k, c]) => [k, num(c.charsPerToken, 1), fa(c.samples), num(c.ratio), num(c.worst), c.worst === null ? 'نامعلوم' : c.worst > 1 ? '⚠ کم‌شماری' : 'محافظه‌کارانه ✓'])));
  }

  // ── مرتبط‌ها
  const rel = by(results, 'related');
  if (rel.length) {
    out.push(`\n## ۱. «مرتبط‌ها را پیدا کن» (یابنده + مرتب‌کننده)\n`);
    out.push(`دقت (precision) و بازیابی (recall) در k؛ «اتصال غلط@۵» = سهم نتیجه‌های ۵تای اول که مرتبط نبودند؛ «هم‌موضوع‌ولی‌نامرتبط@۵» = سهم آن‌ها که دقیقاً از دام «هم‌موضوع ولی متفاوت» بودند. هزینه برای هر ۱۰۰۰ پرس‌وجو، بدون هزینهٔ یک‌بارهٔ embedding پیکره.\n`);
    out.push(table(['ترکیب', 'P@۳', 'P@۵', 'P@۱۰', 'R@۳', 'R@۵', 'R@۱۰', 'nDCG@۵', 'اتصال غلط@۵', 'هم‌موضوع@۵', 'p50', 'p95', 'هزینه/۱۰۰۰', 'نمایه‌سازی', 'خطا'],
      rel.map((r) => [r.name, pct(r.metrics.p3), pct(r.metrics.p5), pct(r.metrics.p10), pct(r.metrics.r3), pct(r.metrics.r5), pct(r.metrics.r10), num(r.metrics.ndcg5), pct(r.metrics.wrong5), pct(r.metrics.hardNeg5), ms(r.latency.p50), ms(r.latency.p95), usd(r.costPer1000Usd), usd(r.indexingCostUsd), errs(r)])));
    const ranked = rank(rel, [['ndcg5', 'desc'], ['r5', 'desc']]);
    if (ranked[0]) {
      const b = ranked[0];
      out.push(`\n**بهترین (کیفیت اول): «${b.name}»** — nDCG@۵ = ${num(b.metrics.ndcg5)}، R@۵ = ${pct(b.metrics.r5)}، P@۵ = ${pct(b.metrics.p5)}.${noteNear(rel, b, 'ndcg5', 0.02)}`);
      if ((b.metrics.r5 ?? 0) < meta.bars.related.recallAt5 || (b.metrics.p5 ?? 0) < meta.bars.related.precisionAt5 || (b.metrics.hardNeg5 ?? 1) > meta.bars.related.hardNegativeAt5)
        bad.push(`**مرتبط‌ها:** بهترین ترکیب («${b.name}») به حد پذیرش نرسید (R@۵ ≥ ${pct(meta.bars.related.recallAt5)}، P@۵ ≥ ${pct(meta.bars.related.precisionAt5)}، هم‌موضوع@۵ ≤ ${pct(meta.bars.related.hardNegativeAt5)}؛ به‌دست‌آمده: ${pct(b.metrics.r5)}، ${pct(b.metrics.p5)}، ${pct(b.metrics.hardNeg5)}). تا بهتر شدن، رابط بعدی باید این نتیجه را «پیشنهاد کم‌اطمینان» نشان دهد.`);
    }
    const thr = rel.filter((r) => r.extras.suggestedStrong !== undefined);
    if (thr.length) {
      out.push(`\n**آستانهٔ درجه‌ها از روی امتیاز مرتب‌کننده** (پایین‌ترین امتیازی که دقت ≥ ${pct(meta.thresholdPrecision.strong)} برای «مرتبط» و ≥ ${pct(meta.thresholdPrecision.weak)} برای «کمتر مرتبط» می‌دهد؛ روی همین داده انتخاب شده و خوش‌بینانه است؛ پیش از گذاشتن در \`recipes.json\` با نمونهٔ کاربر بسنج):\n`);
      out.push(table(['ترکیب', 'strong', 'weak'], thr.map((r) => [r.name, num(r.extras.suggestedStrong as number | null, 3), num(r.extras.suggestedWeak as number | null, 3)])));
    }
    const tagRows = rel.filter((r) => Object.keys(r.byTag).length);
    if (tagRows.length) {
      const tags = [...new Set(tagRows.flatMap((r) => Object.keys(r.byTag)))];
      out.push(`\nR@۵ به‌تفکیک متن سخت:\n`);
      out.push(table(['ترکیب', ...tags.map((t) => `${t} (n)`)], tagRows.map((r) => [r.name, ...tags.map((t) => (r.byTag[t] ? `${pct(r.byTag[t].metrics.r5)} (${fa(r.byTag[t].n)})` : '—'))])));
    }
  }

  // ── داور
  const jd = by(results, 'judge');
  if (jd.length) {
    out.push(`\n## ۲. «این چیست؟» (داور با سؤال‌های بسته)\n`);
    out.push(table(['مدل', 'نوع فکر', 'نوع دانش', 'قطعی/با تردید', 'میانگین', '۹۵٪ بازهٔ فکر', 'پوشش (مطمئن)', 'دقت وقتی مطمئن', 'p50', 'خطا'],
      jd.map((r) => [r.name, pct(r.metrics['thoughtKind.accuracy']), pct(r.metrics['knowledgeType.accuracy']), pct(r.metrics['certainty.accuracy']), pct(r.metrics.accuracy), ci(r.extras['thoughtKind.ci95']), pct(r.metrics.coverage), pct(r.metrics.accuracyWhenAnswered), ms(r.latency.p50), errs(r)])));
    for (const r of jd) {
      const c = r.extras.calibrationAll as { bins: Array<{ from: number; to: number; count: number; accuracy: number | null }>; withoutConfidence: number; ece: number | null } | undefined;
      if (c) out.push(`\n«${r.name}» — کالیبراسیون (اطمینان گزارش‌شده در برابر دقت واقعی): ${c.bins.filter((b) => b.count).map((b) => `[${num(b.from, 1)}–${num(Math.min(b.to, 1), 1)}) n=${fa(b.count)} دقت ${pct(b.accuracy)}`).join(' · ') || 'سرویس اطمینان نداد'}${c.withoutConfidence ? ` · بدون اطمینان: ${fa(c.withoutConfidence)}` : ''}${c.ece !== null ? ` · ECE=${num(c.ece, 3)}` : ''}`);
    }
    const ranked = rank(jd, [['accuracy', 'desc']]);
    if (ranked[0]) {
      out.push(`\n**بهترین (کیفیت اول): «${ranked[0].name}»** — دقت میانگین ${pct(ranked[0].metrics.accuracy)}.`);
      for (const r of jd) for (const k of ['thoughtKind', 'knowledgeType', 'certainty'] as const) if ((r.metrics[`${k}.accuracy`] ?? 1) < meta.bars.judge.accuracy) bad.push(`**این چیست؟ (${k}، ${r.name}):** دقت ${pct(r.metrics[`${k}.accuracy`])} < حد ${pct(meta.bars.judge.accuracy)}.`);
    }
  }

  // ── کجا برود
  const pl = by(results, 'placement');
  if (pl.length) {
    out.push(`\n## ۳. «کجا برود؟» (مرتبط‌ها ← داور)\n`);
    out.push(`«انتساب غلط» = جایی گذاشت که درست نبود (یا برای متنِ بی‌بخش، بخشی را برگزید). «هیچ‌کدام درست» = سهم متن‌های بی‌بخش که درست «هیچ‌کدام» شدند.\n`);
    out.push(table(['ترکیب', 'دقت', '۹۵٪ بازه', 'انتساب غلط', 'هیچ‌کدام درست', 'مطمئن‌نبود', 'دقت وقتی مطمئن', 'p50', 'p95', 'هزینه/۱۰۰۰', 'خطا'],
      pl.map((r) => [r.name, pct(r.metrics.accuracy), ci(r.extras.ci95), pct(r.metrics.wrongAssignment), pct(r.metrics.none), pct(r.metrics.unsure), pct(r.metrics.accuracyWhenAnswered), ms(r.latency.p50), ms(r.latency.p95), usd(r.costPer1000Usd), errs(r)])));
    const ranked = rank(pl, [['accuracy', 'desc'], ['wrongAssignment', 'asc']]);
    if (ranked[0]) {
      out.push(`\n**بهترین (کیفیت اول): «${ranked[0].name}»** — دقت ${pct(ranked[0].metrics.accuracy)}، انتساب غلط ${pct(ranked[0].metrics.wrongAssignment)}.${noteNear(pl, ranked[0], 'accuracy', 0.03)}`);
      if ((ranked[0].metrics.accuracy ?? 0) < meta.bars.placement.accuracy || (ranked[0].metrics.wrongAssignment ?? 1) > meta.bars.placement.wrongAssignment) bad.push(`**کجا برود؟:** بهترین ترکیب («${ranked[0].name}») به حد پذیرش نرسید (دقت ≥ ${pct(meta.bars.placement.accuracy)}، انتساب غلط ≤ ${pct(meta.bars.placement.wrongAssignment)}).`);
    }
    const tags = [...new Set(pl.flatMap((r) => Object.keys(r.byTag)))];
    if (tags.length) { out.push(`\nدقت به‌تفکیک متن سخت:\n`); out.push(table(['ترکیب', ...tags.map((t) => `${t} (n)`)], pl.map((r) => [r.name, ...tags.map((t) => (r.byTag[t] ? `${pct(r.byTag[t].metrics.accuracy)} (${fa(r.byTag[t].n)})` : '—'))]))); }
  }

  // ── تکراری
  const du = by(results, 'duplicates');
  if (du.length) {
    out.push(`\n## ۴. تکراری در برابر «هم‌موضوع ولی متفاوت»\n`);
    out.push(`روش‌های امتیازی با آستانهٔ دو-بخشی سنجیده شدند (آستانه روی نیمهٔ زوج انتخاب و روی نیمهٔ فرد سنجیده می‌شود و برعکس)، نه روی همان داده.\n`);
    out.push(table(['روش', 'F1 تکراری', 'دقت', 'بازیابی', 'F1 تکراری+نزدیک', 'F1 تکراری در برابر هم‌موضوع', 'هزینه/۱۰۰۰', 'خطا'],
      du.map((r) => [r.name, num(r.metrics.f1Duplicate), pct(r.metrics.precisionDuplicate), pct(r.metrics.recallDuplicate), num(r.metrics.f1DupOrNear), num(r.metrics.f1DupVsSameTopic), usd(r.costPer1000Usd), errs(r)])));
    const ranked = rank(du, [['f1Duplicate', 'desc']]);
    if (ranked[0]) {
      out.push(`\n**بهترین (کیفیت اول): «${ranked[0].name}»** — F1 تکراری ${num(ranked[0].metrics.f1Duplicate)}.`);
      if ((ranked[0].metrics.f1Duplicate ?? 0) < meta.bars.duplicates.f1Duplicate) bad.push(`**تکراری:** بهترین روش («${ranked[0].name}») به F1 ≥ ${num(meta.bars.duplicates.f1Duplicate)} نرسید.`);
    }
  }

  // ── تناقض
  const co = by(results, 'contradictions');
  if (co.length) {
    out.push(`\n## ۵. تناقض با خط قرمز (داور)\n`);
    out.push(table(['مدل', 'دقت', '۹۵٪ بازه', 'بازیابی «تناقض»', 'دقت «تناقض»', 'هشدار کاذب', 'مطمئن‌نبود', 'p50', 'هزینه/۱۰۰۰', 'خطا'],
      co.map((r) => [r.name, pct(r.metrics.accuracy), ci(r.extras.ci95), pct(r.metrics.recallContradicts), pct(r.metrics.precisionContradicts), pct(r.metrics.falseAlarm), pct(r.metrics.unsureRate), ms(r.latency.p50), usd(r.costPer1000Usd), errs(r)])));
    const ranked = rank(co, [['accuracy', 'desc'], ['falseAlarm', 'asc']]);
    if (ranked[0]) {
      out.push(`\n**بهترین (کیفیت اول): «${ranked[0].name}»**.`);
      if ((ranked[0].metrics.accuracy ?? 0) < meta.bars.contradictions.accuracy || (ranked[0].metrics.falseAlarm ?? 1) > meta.bars.contradictions.falseAlarm) bad.push(`**تناقض:** بهترین داور («${ranked[0].name}») به حد پذیرش نرسید (دقت ≥ ${pct(meta.bars.contradictions.accuracy)}، هشدار کاذب ≤ ${pct(meta.bars.contradictions.falseAlarm)}). تناقض معنایی همچنان باید پیشنهاد کم‌اطمینان بماند و موتور قطعی (\`contradictionCandidates\`) جایش را نگیرد.`);
    }
  }

  // ── گفتار
  const asr = by(results, 'asr');
  if (asr.length) {
    out.push(`\n## ۶. گفتار به متن (روی صدای کاربر)\n`);
    out.push(table(['مدل', 'CER', 'WER', 'فایل', 'p50', 'هزینهٔ هر دقیقه', 'خطا'], asr.map((r) => [r.name, pct(r.metrics.cer, 1), pct(r.metrics.wer, 1), fa(r.n), ms(r.latency.p50), usd((r.extras.costPerAudioMinuteUsd as number | null) ?? null), errs(r)])));
    const ranked = rank(asr, [['wer', 'asc'], ['cer', 'asc']]);
    if (ranked[0]) {
      out.push(`\n**بهترین (کیفیت اول): «${ranked[0].name}»** — WER ${pct(ranked[0].metrics.wer, 1)}.`);
      if ((ranked[0].metrics.wer ?? 1) > meta.bars.asr.wer) bad.push(`**گفتار به متن:** بهترین مدل («${ranked[0].name}») WER ${pct(ranked[0].metrics.wer, 1)} دارد، بالاتر از حد ${pct(meta.bars.asr.wer)}.`);
    }
  } else out.push(`\n## ۶. گفتار به متن\n\nفایل صدایی نبود: چند فایل کوتاه فارسی با متن درستش در \`scripts/eval-intelligence/audio/\` بگذار (راهنما در همان پوشه).\n`);

  out.push(`\n## جاهایی که هیچ ترکیبی به‌اندازهٔ کافی خوب نیست\n`);
  out.push(bad.length ? bad.map((b) => `- ${b}`).join('\n') : 'با حدهای پذیرش این اجرا، موردی نبود (یا دسته‌ای اجرا نشد؛ بخش «اجرا نشد» را ببین).');
  out.push(`\nحدهای پذیرش (فرض‌اند، نه سنجش؛ در \`scripts/eval-intelligence/combos.json → bars\` قابل‌تغییرند): \`${JSON.stringify(meta.bars)}\``);
  out.push(`\n## محدودیت‌های این سنجش\n\n- حجم داده کوچک است (چند ده مورد در هر دسته)؛ اختلاف‌های کمتر از بازهٔ اطمینان معنا ندارند.\n- داده نوشتهٔ ما از نمونهٔ قهوه است، نه نوشتهٔ کاربران واقعی؛ نمونه‌های کسب‌وکار خودت را در \`dataset.json → userSection\` اضافه کن و دوباره اجرا کن.\n- زمان‌ها از یک اجرا در یک شبکه‌اند و نوسان دارند.\n- هزینه از شمارش واقعی ارائه‌دهنده و قیمت‌های models.json است؛ «نامعلوم» یعنی قیمت یا شمارش واقعی نبود، نه صفر.\n`);
  return out.join('\n');
}
