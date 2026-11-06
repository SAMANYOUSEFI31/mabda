/**
 * Heavy-use cost simulation: what each plan costs US when every daily cap and the whole file quota are used all month
 * (subscription-included judgements, Coach and file extraction run through platform AI, independent of user credentials).
 *   bun run scripts/cost-simulation.ts            → prints the table
 *   bun run scripts/cost-simulation.ts --write    → also writes docs/pricing-entitlements.md
 * Prices come from server/ai/config/models.json; token counts per call are ASSUMPTIONS [فرض] — calibrate in Alpha.
 */
import { writeFileSync } from 'node:fs';
import { modelsConfig } from '../server/ai/config.ts';
import { entitlementsOf, PLAN_IDS, COST_WARN_RATIO } from '../src/core/entitlements.ts';
import { heavyUseCost } from '../src/core/costReport.ts';
import type { HeavyUseAssumptions } from '../src/core/costReport.ts';

export const ASSUMPTIONS: HeavyUseAssumptions = {
  days: 30,
  judgmentCall: { inputTokens: 2_500, outputTokens: 400, judgmentsPerCall: 5 },
  coachCall: { inputTokens: 3_000, outputTokens: 2_000 },
  fileExtract: { avgFileTokens: 20_000, windowTokens: 30_000, outputTokens: 1_200 },
};

const cheap = modelsConfig.tiers.cheap.pricing;
const balanced = modelsConfig.tiers.balanced.pricing;
const usd = (n: number) => `$${n.toFixed(2)}`;
const fa = (n: number) => n.toLocaleString('fa-IR');
const pct = (r: number) => `${(r * 100).toFixed(1)}٪`;

const rows = PLAN_IDS.map((p) => ({ p, e: entitlementsOf(p), r: heavyUseCost(p, ASSUMPTIONS, cheap, balanced) }));

const ent = [
  '| | Starter | Pro | Max |', '| --- | --- | --- | --- |',
  `| قیمت ماهانه | ${rows.map(({ e }) => usd(e.priceMonthlyUsd)).join(' | ')} |`,
  `| Workspace | ${rows.map(({ e }) => fa(e.workspaces)).join(' | ')} |`,
  `| سقف Object فعال | ${rows.map(({ e }) => fa(e.maxObjects)).join(' | ')} |`,
  `| پردازش فایل در ماه (توکن) | ${rows.map(({ e }) => fa(e.fileTokensPerMonth)).join(' | ')} |`,
  `| اثر تغییر | ${rows.map(({ e }) => (e.engines.changeImpact ? '✓' : '—')).join(' | ')} |`,
  `| تناقض معنایی | ${rows.map(({ e }) => (e.engines.semanticContradiction ? '✓' : '—')).join(' | ')} |`,
  `| بستهٔ Context | ${rows.map(({ e }) => (e.contextPack ? '✓' : '—')).join(' | ')} |`,
  `| spec سفارشی | ${rows.map(({ e }) => (e.customSpecs ? '✓' : '—')).join(' | ')} |`,
  `| قضاوت لایهٔ تصمیم در روز | ${rows.map(({ e }) => fa(e.decisionJudgmentsPerDay)).join(' | ')} |`,
  `| Context Coach در روز | ${rows.map(({ e }) => fa(e.coachPerDay)).join(' | ')} |`,
].join('\n');

const cost = [
  '| | Starter | Pro | Max |', '| --- | --- | --- | --- |',
  `| قضاوت‌ها (۳۰ روز، سقف کامل) | ${rows.map(({ r }) => usd(r.judgmentsCostUsd)).join(' | ')} |`,
  `| Coach (۳۰ روز، سقف کامل) | ${rows.map(({ r }) => usd(r.coachCostUsd)).join(' | ')} |`,
  `| پردازش فایل (کل سهمیه) | ${rows.map(({ r }) => usd(r.filesCostUsd)).join(' | ')} |`,
  `| **هزینهٔ واقعی ما** | ${rows.map(({ r }) => `**${usd(r.totalUsd)}**`).join(' | ')} |`,
  `| سهم از قیمت پلن | ${rows.map(({ r }) => pct(r.ratio)).join(' | ')} |`,
  `| وضعیت (هشدار بالاتر از ${pct(COST_WARN_RATIO)}) | ${rows.map(({ r }) => (r.warn ? '⚠ هشدار' : 'در حد مجاز')).join(' | ')} |`,
].join('\n');

const assumptions = `- هر فراخوانی قضاوت دسته‌ای: ${fa(ASSUMPTIONS.judgmentCall.inputTokens)} توکن ورودی، ${fa(ASSUMPTIONS.judgmentCall.outputTokens)} خروجی، ${fa(ASSUMPTIONS.judgmentCall.judgmentsPerCall)} قضاوت در هر فراخوانی (سطح cheap: ورودی ${cheap.inputPerM}$ و خروجی ${cheap.outputPerM}$ به ازای هر میلیون توکن)
- هر جلسهٔ Coach: ${fa(ASSUMPTIONS.coachCall.inputTokens)} ورودی، ${fa(ASSUMPTIONS.coachCall.outputTokens)} خروجی با احتساب thinking سطح low (سطح balanced: ${balanced.inputPerM}$ و ${balanced.outputPerM}$)
- فایل‌ها به‌طور میانگین ${fa(ASSUMPTIONS.fileExtract.avgFileTokens)} توکن؛ استخراج یک‌باره حداکثر ${fa(ASSUMPTIONS.fileExtract.windowTokens)} توکن ابتدای فایل را می‌خواند و ${fa(ASSUMPTIONS.fileExtract.outputTokens)} توکن خروجی دارد (cheap)
- ${fa(ASSUMPTIONS.days)} روز با استفادهٔ کامل از همهٔ سقف‌ها؛ هزینهٔ پلتفرم با فرض مصرف AI مدیریت‌شده محاسبه شده است
- قیمت‌ها از \`server/ai/config/models.json\` (تاریخ ${modelsConfig.pricedAt}) و تأییدنشده با صورتحساب واقعی`;

const md = `# جدول پلن‌ها و هزینهٔ واقعی ما\n\nتولیدشده با \`bun run scripts/cost-simulation.ts --write\`. همهٔ عددها فرضی‌اند و فقط در \`src/core/entitlements.config.ts\` تغییر می‌کنند.\n\n## Entitlementها\n\n${ent}\n\n## سناریوی مصرف سنگین (هزینهٔ ما در ماه)\n\n${cost}\n\n### فرض‌ها\n\n${assumptions}\n`;
console.log(md);
if (process.argv.includes('--write')) writeFileSync('docs/pricing-entitlements.md', md);
