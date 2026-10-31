import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiService } from './service.ts';
import { SessionResolver, verifyModels } from './session.ts';
import { ByokVault } from './byok.ts';
import { BlockStreamParser, parseBlocks } from './blocks.ts';
import { buildPrompt } from './context.ts';
import { AiError, toAiError } from './errors.ts';
import { validateAnswers } from './decision.ts';
import { loadModelsConfig } from './config.ts';
import { MockProvider, block, verdict } from './testing/mockProvider.ts';
import type { AiStreamEvent } from '../../src/types/ai.ts';

const cfg = loadModelsConfig();
const vault = () => new ByokVault(mkdtempSync(join(tmpdir(), 'mabda-')), 'test-secret');
const KEY = 'AIzaSy' + 'x'.repeat(30);

function serviceWith(p: MockProvider, opts: { managed?: boolean; v?: ByokVault } = {}) {
  p.models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];
  const sessions = new SessionResolver({ vault: opts.v ?? vault(), managedEnabled: opts.managed ?? true, managedKey: KEY, cfg, factory: () => p });
  return { sessions, service: new AiService({ sessions, cfg }) };
}
const collect = async (run: (emit: (e: AiStreamEvent) => void) => Promise<void>) => {
  const events: AiStreamEvent[] = [];
  await run((e) => events.push(e));
  return events;
};
const decide = (difficulty: string, task = 'chat') => ({ answers: [{ id: 'taskKind', choice: task, probability: 0.9 }, { id: 'difficulty', choice: difficulty, probability: 0.9 }, { id: 'importance', choice: 'low', probability: 0.9 }] });
const decisions = decide('easy');
const isDecision = (c: { schema?: unknown }) => JSON.stringify(c.schema).includes('probability');

test('chat streams blocks as they complete, then a final result with ledger stages', async () => {
  const reply = { blocks: [block('b1', 'سلام، چه کمکی می‌خواهی؟'), { id: 'b2', kind: 'decision', markdown: 'تصمیم: بدون تخفیف', proposal: { type: 'Constraint', title: 'بدون تخفیف', content: 'تخفیف نداریم', nodeId: 'offer' } }] };
  const p = new MockProvider((c) => (c.kind === 'stream' ? reply : decisions));
  const { service } = serviceWith(p);
  const ev = await collect((emit) => service.chat('user-12345678', { message: 'سلام', contextList: [], mode: 'auto' }, emit));
  assert.deepEqual(ev.map((e) => e.type), ['plan', 'stage', 'block', 'block', 'done']);
  const done = ev.at(-1) as Extract<AiStreamEvent, { type: 'done' }>;
  assert.equal(done.result.blocks[1].proposal?.nodeId, 'offer');
  assert.deepEqual(done.result.usage.stages.map((s) => s.stage), ['decision', 'chat']);
  assert.equal(done.result.usage.byok, false);
  assert.ok(done.result.usage.totals.costUsd > 0);
  assert.equal(done.result.plan.tier, 'cheap');
});

test('a provider failure becomes a structured error event — never a canned reply', async () => {
  const p = new MockProvider((c) => (c.kind === 'stream' ? Object.assign(new Error('quota'), { status: 429 }) : decisions));
  const { service } = serviceWith(p);
  const ev = await collect((emit) => service.chat('user-12345678', { message: 'سلام', contextList: [], mode: 'auto' }, emit));
  const last = ev.at(-1) as Extract<AiStreamEvent, { type: 'error' }>;
  assert.equal(last.type, 'error');
  assert.equal(last.error.retryable, true);
  assert.ok(['quota', 'rate_limit'].includes(last.error.kind));
  assert.ok(!ev.some((e) => e.type === 'done'));
});

test('no key: managed flag off and no BYOK → no_key error, nothing is generated', async () => {
  const p = new MockProvider(() => ({ blocks: [block('b1', 'x')] }));
  const { service, sessions } = serviceWith(p, { managed: false });
  const ev = await collect((emit) => service.chat('user-12345678', { message: 'سلام', contextList: [], mode: 'auto' }, emit));
  assert.equal((ev[0] as Extract<AiStreamEvent, { type: 'error' }>).error.kind, 'no_key');
  assert.equal(p.calls.length, 0);
  const st = await sessions.status('user-12345678');
  assert.equal(st.available, false);
  assert.equal(st.unavailable?.kind, 'no_key');
});

test('BYOK: the user key wins, is marked byok in usage, and is encrypted at rest', async () => {
  const v = vault();
  v.set('user-12345678', KEY);
  const p = new MockProvider((c) => (c.kind === 'stream' ? { blocks: [block('b1', 'پاسخ')] } : decisions));
  const { service, sessions } = serviceWith(p, { managed: false, v });
  const ev = await collect((emit) => service.chat('user-12345678', { message: 'سلام', contextList: [], mode: 'auto' }, emit));
  assert.equal((ev.at(-1) as Extract<AiStreamEvent, { type: 'done' }>).result.usage.byok, true);
  assert.equal((await sessions.status('user-12345678')).source, 'byok');
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(join((v as unknown as { dir: string }).dir, 'byok.json'), 'utf8');
  assert.ok(!raw.includes(KEY));
  assert.equal(v.get('user-12345678'), KEY);
  assert.equal(v.last4('user-12345678'), KEY.slice(-4));
  assert.equal(new ByokVault((v as unknown as { dir: string }).dir, 'another-secret').get('user-12345678'), null);
});

test('generate: previewed plan is honoured (credits shown = credits charged) and its decision tokens are in the ledger', async () => {
  const p = new MockProvider((c) => (isDecision(c) ? decide('medium', 'drafting') : JSON.stringify(c.schema).includes('passedCriteria') ? verdict() : { blocks: [block('b1', 'متن خروجی')] }));
  const { service } = serviceWith(p);
  const preview = await service.previewPlan('user-12345678', { userMode: 'auto', jobKind: 'deliverable', text: 'جملهٔ موقعیت‌یابی', contextList: [] });
  assert.ok(preview.decisionUsage);
  const callsAfterPreview = p.calls.length;
  const ev = await collect((emit) => service.generate('user-12345678', {
    deliverableId: 'd1', deliverableTitle: 'جملهٔ موقعیت‌یابی', deliverableType: 'Deliverable', acceptanceCriteria: ['معیار ۱'],
    contextObjects: [{ id: 'c1', type: 'Fact', status: 'Confirmed', title: 't', content: 'c', nodeId: 'business' }, { id: 'c2', type: 'Fact', status: 'Proposed', title: 'p', content: 'q', nodeId: 'business' }],
    userMode: 'auto', plan: preview.plan, decisionUsage: preview.decisionUsage,
  }, emit));
  assert.equal(p.calls.length - callsAfterPreview, 2, 'no second routing call: draft + validate');
  const done = ev.at(-1) as Extract<AiStreamEvent, { type: 'done' }>;
  assert.deepEqual(done.result.plan, preview.plan);
  assert.equal(done.result.usage.stages[0].stage, 'decision');
  assert.deepEqual(done.result.usedContextIds, ['c1'], 'Proposed context is not reported as used');
  assert.ok(ev.some((e) => e.type === 'stage' && e.stage === 'validate'));
});

test('startup verification: picks the first available candidate and warns instead of guessing', async () => {
  const p = new MockProvider(() => null);
  p.models = ['gemini-2.5-flash', 'gemini-flash-lite-latest'];
  const v = await verifyModels(p, cfg);
  assert.equal(v.resolved.cheap, 'gemini-flash-lite-latest');
  assert.equal(v.resolved.balanced, 'gemini-2.5-flash');
  assert.equal(v.resolved.frontier, 'gemini-2.5-flash');
  assert.equal(v.verified.frontier, true);
  assert.ok(v.warnings.some((w) => w.includes('gemini-2.5-flash-lite')));
  p.models = ['something-else'];
  const none = await verifyModels(p, cfg);
  assert.equal(none.verified.cheap, false);
  assert.ok(none.warnings.some((w) => w.includes('هیچ‌یک')));
  p.listModels = async () => { throw new AiError('provider'); };
  const offline = await verifyModels(p, cfg);
  assert.equal(offline.listed, false);
});

test('prompt layout: stable prefix is order-independent; Proposed never enters the prefix', () => {
  const a = { id: 'a', type: 'Fact', status: 'Confirmed', title: 'الف', content: '۱', nodeId: 'brand' };
  const b = { id: 'b', type: 'Decision', status: 'Confirmed', title: 'ب', content: '۲', nodeId: 'business' };
  const c = { id: 'c', type: 'Fact', status: 'Proposed', title: 'پیشنهاد', content: '۳', nodeId: 'business' };
  const d = { id: 'd', type: 'Fact', status: 'Superseded', title: 'قدیمی', content: '۴', nodeId: 'business' };
  const p1 = buildPrompt({ contexts: [a, b, c, d], task: 'T1' });
  const p2 = buildPrompt({ contexts: [d, c, b, a], task: 'T2' });
  assert.equal(p1.prefix, p2.prefix);
  assert.equal(p1.system, p2.system);
  assert.ok(p1.prefix!.indexOf('ب') < p1.prefix!.indexOf('الف'), 'business before brand');
  assert.ok(!p1.prefix!.includes('پیشنهاد') && !p1.prefix!.includes('قدیمی'));
  assert.match(p1.user, /تأییدنشده/);
  assert.match(p1.user, /«پیشنهادی»/);
  assert.ok(!p1.user.includes('قدیمی'));
});

test('stream parser extracts complete blocks from arbitrary chunking, even with braces inside strings', () => {
  const full = JSON.stringify({ blocks: [{ id: 'b1', kind: 'paragraph', markdown: 'a } { "x" \\ b' }, { id: 'b2', kind: 'list', markdown: '- ۱\n- ۲' }] });
  for (const size of [1, 3, 7, 50, 1000]) {
    const parser = new BlockStreamParser();
    const got: unknown[] = [];
    for (let i = 0; i < full.length; i += size) got.push(...parser.push(full.slice(i, i + size)));
    assert.equal(got.length, 2, `chunk size ${size}`);
    assert.equal((got[0] as { markdown: string }).markdown, 'a } { "x" \\ b');
  }
  assert.equal(parseBlocks(JSON.parse(full)).length, 2);
  assert.throws(() => parseBlocks({ blocks: [{ kind: 'x', markdown: '  ' }] }), (e: { kind?: string }) => e.kind === 'bad_output');
  assert.equal(parseBlocks({ blocks: [{ id: 'z', markdown: 'm', kind: 'nonsense', proposal: { type: 'Fact', title: 't', content: 'c', nodeId: 'zzz' } }, { id: 'z', markdown: 'n' }] })[1].id !== 'z', true);
});

test('error mapping and decision-answer validation', () => {
  assert.equal(toAiError({ status: 403, message: 'x' }).kind, 'invalid_key');
  assert.equal(toAiError({ status: 429, message: 'RESOURCE_EXHAUSTED quota' }).kind, 'quota');
  assert.equal(toAiError({ status: 503 }).retryable, true);
  assert.equal(toAiError({ name: 'AbortError' }).kind, 'aborted');
  const q = [{ id: 'd', question: '', options: ['easy', 'hard'] }];
  assert.deepEqual(validateAnswers({ answers: [{ id: 'd', choice: 'easy', probability: 1.7 }] }, q), [{ id: 'd', choice: 'easy', probability: 1 }]);
  assert.throws(() => validateAnswers({ answers: [{ id: 'd', choice: 'weird', probability: 0.5 }] }, q));
  assert.throws(() => validateAnswers({}, q));
});
