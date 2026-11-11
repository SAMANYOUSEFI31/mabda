import test from 'node:test';
import assert from 'node:assert/strict';
import { costUsd, loadModelsConfig, nextTier, modelsConfig } from './config.ts';
import { usageOf } from './providers/gemini.ts';
import { sumUsage } from './runner.ts';

const cfg = loadModelsConfig();

test('costUsd: input, cached input and output(+thinking) are priced separately per 1M tokens', () => {
  const t = { ...cfg.tiers.balanced, pricing: { inputPerM: 2, cachedInputPerM: 0.5, outputPerM: 10 } };
  const usd = costUsd(t, { inputTokens: 1_000_000, cachedTokens: 2_000_000, outputTokens: 100_000, thinkingTokens: 400_000 });
  assert.equal(usd, 2 + 1 + 5);
  assert.equal(costUsd(t, { inputTokens: 0, cachedTokens: 0, outputTokens: 0, thinkingTokens: 0 }), 0);
});

test('usageOf splits cached tokens out of the prompt count and keeps thinking separate', () => {
  const u = usageOf({ usageMetadata: { promptTokenCount: 5000, cachedContentTokenCount: 3000, candidatesTokenCount: 400, thoughtsTokenCount: 700 } });
  assert.deepEqual(u, { inputTokens: 2000, cachedTokens: 3000, outputTokens: 400, thinkingTokens: 700 });
  assert.deepEqual(usageOf({}), { inputTokens: 0, cachedTokens: 0, outputTokens: 0, thinkingTokens: 0 });
  assert.equal(usageOf({ usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 99 } }).inputTokens, 0);
});

test('sumUsage adds every stage and rounds cost safely', () => {
  const s = (c: number) => ({ stage: 'draft' as const, tier: 'cheap' as const, provider: 'g', modelId: 'm', effort: 'low' as const, inputTokens: 10, cachedTokens: 5, outputTokens: 2, thinkingTokens: 1, costUsd: c, durationMs: 1 });
  const t = sumUsage([s(0.1), s(0.2)]);
  assert.deepEqual([t.inputTokens, t.cachedTokens, t.outputTokens, t.thinkingTokens, t.costUsd], [20, 10, 4, 2, 0.3]);
});

test('tier ladder and config sanity', () => {
  assert.equal(nextTier('cheap'), 'balanced');
  assert.equal(nextTier('balanced'), 'frontier');
  assert.equal(nextTier('frontier'), null);
  for (const t of ['cheap', 'balanced', 'frontier'] as const) {
    assert.ok(modelsConfig.tiers[t].pricing.outputPerM > modelsConfig.tiers[t].pricing.inputPerM);
    assert.ok(modelsConfig.tiers[t].pricing.cachedInputPerM < modelsConfig.tiers[t].pricing.inputPerM);
  }
});

test('model ids live only in config/models.json', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join, sep } = await import('node:path');
  const roots = ['server', 'src', 'server.ts'];
  const hits: string[] = [];
  const visit = (p: string) => {
    if (statSync(p).isDirectory()) { for (const n of readdirSync(p)) visit(join(p, n)); return; }
    const unix = p.split(sep).join('/'); // Windows joins paths with a backslash: compare in one spelling
    if (!/\.(ts|tsx|json)$/.test(unix) || unix.endsWith('models.json') || /\.test\.ts$/.test(unix) || unix.includes('/testing/')) return;
    if (/gemini-(\d|flash|pro)/i.test(readFileSync(p, 'utf8'))) hits.push(p);
  };
  roots.forEach(visit);
  assert.deepEqual(hits, []);
});

test('intelligence layer: its model ids live only in config/models.json (code, recipes and eval files hold aliases only)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join, sep } = await import('node:path');
  const { loadIntelligenceConfig } = await import('../intelligence/config.ts');
  const cfg = loadIntelligenceConfig();
  const ids = Object.values(cfg.models).map((m) => m.id);
  assert.ok(ids.length >= 8);
  const hits: string[] = [];
  const visit = (p: string) => {
    if (statSync(p).isDirectory()) { for (const n of readdirSync(p)) if (n !== 'node_modules' && n !== 'data') visit(join(p, n)); return; }
    const unix = p.split(sep).join('/');
    if (!/\.(ts|tsx|json|mjs|md)$/.test(unix) || unix.endsWith('ai/config/models.json') || /\.test\.ts$/.test(unix) || unix.includes('/testing/') || unix.endsWith('/audio/README.md')) return;
    const text = readFileSync(p, 'utf8');
    for (const id of ids) if (text.includes(id)) hits.push(`${unix}: ${id}`);
  };
  ['server', 'src', 'scripts', 'server.ts'].forEach(visit);
  assert.deepEqual(hits, []);
});
