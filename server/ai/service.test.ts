import test from 'node:test';
import assert from 'node:assert/strict';
import { AiService } from './service.ts';
import { SessionResolver, verifyModels } from './session.ts';
import { BlockStreamParser, parseBlocks } from './blocks.ts';
import { buildPrompt } from './context.ts';
import { AiError, toAiError } from './errors.ts';
import { validateAnswers } from './decision.ts';
import { loadModelsConfig } from './config.ts';
import { MockProvider, block, answerChecks, isCheckCall } from './testing/mockProvider.ts';
import type { AiStreamEvent } from '../../src/types/ai.ts';

const cfg = loadModelsConfig();
const KEY = 'AIzaSy' + 'x'.repeat(30);

function serviceWith(p: MockProvider, opts: { managed?: boolean } = {}) {
  p.models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];
  const sessions = new SessionResolver({ managedEnabled: opts.managed ?? true, managedKey: KEY, cfg, factory: () => p });
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

test('managed AI disabled: no user credential path exists and no generation occurs', async () => {
  const p = new MockProvider(() => ({ blocks: [block('b1', 'x')] }));
  const { service, sessions } = serviceWith(p, { managed: false });
  const ev = await collect((emit) => service.chat('user-12345678', { message: 'سلام', contextList: [], mode: 'auto' }, emit));
  assert.equal((ev[0] as Extract<AiStreamEvent, { type: 'error' }>).error.kind, 'disabled');
  assert.equal(p.calls.length, 0);
  const st = await sessions.status('user-12345678');
  assert.equal(st.available, false);
  assert.equal(st.unavailable?.kind, 'disabled');
});

test('generate: previewed plan is honoured (credits shown = credits charged) and its decision tokens are in the ledger', async () => {
  const p = new MockProvider((c) => (isCheckCall(c) ? answerChecks(c) : isDecision(c) ? decide('medium', 'drafting') : { blocks: [block('b1', 'متن خروجی')] }));
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
  // lineage = exactly what was injected: the Confirmed object and the (labelled) Proposed one, with their versions
  assert.deepEqual(done.result.usedContext, [{ id: 'c1', version: 1 }, { id: 'c2', version: 1 }]);
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
  const a = { id: 'a', type: 'Fact', status: 'Confirmed', title: 'الف', content: '۱', nodeId: 'brand', nodeRank: 1 };
  const b = { id: 'b', type: 'Decision', status: 'Confirmed', title: 'ب', content: '۲', nodeId: 'business', nodeRank: 0 };
  const c = { id: 'c', type: 'Fact', status: 'Proposed', title: 'پیشنهاد', content: '۳', nodeId: 'business' };
  const d = { id: 'd', type: 'Fact', status: 'Superseded', title: 'قدیمی', content: '۴', nodeId: 'business' };
  const p1 = buildPrompt({ contexts: [a, b, c, d], task: 'T1' });
  const p2 = buildPrompt({ contexts: [d, c, b, a], task: 'T2' });
  assert.equal(p1.prefix, p2.prefix);
  assert.equal(p1.system, p2.system);
  assert.ok(p1.prefix!.indexOf('ب') < p1.prefix!.indexOf('الف'), 'the node that comes first in the tree comes first');
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
  assert.equal(toAiError({ status: 403, message: 'x' }).kind, 'provider');
  assert.equal(toAiError({ status: 429, message: 'RESOURCE_EXHAUSTED quota' }).kind, 'quota');
  assert.equal(toAiError({ status: 503 }).retryable, true);
  assert.equal(toAiError({ name: 'AbortError' }).kind, 'aborted');
  const q = [{ id: 'd', question: '', options: ['easy', 'hard'] }];
  assert.deepEqual(validateAnswers({ answers: [{ id: 'd', choice: 'easy', probability: 1.7 }] }, q), [{ id: 'd', choice: 'easy', probability: 1 }]);
  assert.throws(() => validateAnswers({ answers: [{ id: 'd', choice: 'weird', probability: 0.5 }] }, q));
  assert.throws(() => validateAnswers({}, q));
});

const NODES = ['business', 'u1', 'u2'];

test('usedContext records the exact versions that were injected (Superseded/Archived are not injected, so not recorded)', async () => {
  const p = new MockProvider((c) => (isCheckCall(c) ? answerChecks(c) : isDecision(c) ? decide('medium', 'drafting') : { blocks: [block('b1', 'x')] }));
  const { service } = serviceWith(p);
  const ev = await collect((emit) => service.generate('user-12345678', {
    deliverableId: 'd', deliverableTitle: 't', deliverableType: 'Deliverable', acceptanceCriteria: ['م'], userMode: 'auto',
    contextObjects: [
      { id: 'a', type: 'Decision', status: 'Confirmed', title: 'مخاطب', content: 'x', nodeId: 'business', version: 3 },
      { id: 'old', type: 'Decision', status: 'Superseded', title: 'قدیمی', content: 'x', nodeId: 'business', version: 2 },
    ],
    contextList: [{ id: 'k', type: 'Constraint', status: 'Confirmed', title: 'بدون تخفیف', content: 'x', nodeId: 'offer', version: 2 }, { id: 'noise', type: 'Fact', status: 'Confirmed', title: 'نامرتبط', content: 'x', nodeId: 'offer', version: 1 }],
  }, emit));
  const done = ev.at(-1) as Extract<AiStreamEvent, { type: 'done' }>;
  assert.deepEqual(done.result.usedContext, [{ id: 'a', version: 3 }, { id: 'k', version: 2 }]);
  const prompt = JSON.stringify(p.calls.filter((c) => c.kind !== 'structured' || !isDecision(c)).map((c) => c.prompt));
  assert.ok(!prompt.includes('نامرتبط'), 'unrelated context is not injected, hence not recorded');
});

test('node chat: proposals outside the scope are clamped into it; file excerpts are labelled unconfirmed; notes never appear', async () => {
  const reply = { blocks: [{ id: 'b1', kind: 'decision', markdown: 'ok', proposal: { type: 'Decision', title: 'پیشنهاد', content: 'متن', nodeId: 'business' } }, { id: 'b2', kind: 'decision', markdown: 'ok2', proposal: { type: 'Fact', title: 'داخل', content: 'متن', nodeId: 'u2' } }] };
  const p = new MockProvider((c) => (c.kind === 'stream' ? reply : decisions));
  const { service } = serviceWith(p);
  const ev = await collect((emit) => service.chat('user-12345678', {
    message: 'قیمت را عوض کنیم؟', contextList: [], mode: 'auto', allowedNodeIds: ['u1', 'u2'], scopeNodeId: 'u1', nodeLabels: { u1: 'کمپین', u2: 'اینستاگرام' },
    excerpts: [{ fileId: 'f1', fileName: 'brief.pdf', index: 2, text: 'متن مرتبط فایل' }],
  }, emit));
  const done = ev.at(-1) as Extract<AiStreamEvent, { type: 'done' }>;
  assert.equal(done.result.blocks[0].proposal?.nodeId, 'u1', 'clamped to the scope node');
  assert.equal(done.result.blocks[1].proposal?.nodeId, 'u2', 'inside the sub-tree: kept');
  assert.deepEqual(done.result.usedFileChunks, [{ fileId: 'f1', index: 2 }]);
  const chat = p.calls.find((c) => c.kind === 'stream')!;
  assert.match(chat.prompt.user, /تأییدنشده؛ واقعیت قطعی نیست[\s\S]*brief\.pdf · بخش 3/);
  assert.ok(!chat.prompt.prefix?.includes('متن مرتبط فایل'), 'excerpts never enter the stable prefix');
  void NODES;
});

test('extract runs once on the cheap tier and returns sanitised Proposed candidates (no routing call)', async () => {
  const p = new MockProvider((c) => (c.kind === 'structured' ? { summary: 'خلاصه', objects: [
    { type: 'Decision', title: 'مخاطب', content: 'فریلنسرها', nodeId: 'u2' },
    { type: 'Weird', title: 'x', content: 'y' },
    { type: 'Fact', title: 'بی‌گره', content: 'z', nodeId: 'unknown' },
    { type: 'Fact', title: '', content: 'z' },
  ] } : null));
  const { service } = serviceWith(p);
  const r = await service.extract('user-12345678', { kind: 'file', text: 'متن', nodeId: 'u1', nodes: [{ id: 'u1', label: 'الف' }, { id: 'u2', label: 'ب' }], wantSummary: true });
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].spec.tier.provider, 'gemini');
  assert.deepEqual(r.objects.map((o) => [o.title, o.nodeId]), [['مخاطب', 'u2'], ['بی‌گره', 'u1']]);
  assert.equal(r.summary, 'خلاصه');
  assert.equal(r.truncated, false);
  assert.equal(r.usage.stages[0].stage, 'extract');
  assert.equal(r.usage.stages[0].tier, 'cheap');
  const long = await service.extract('user-12345678', { kind: 'file', text: 'کلمه '.repeat(40000), nodeId: 'u1', nodes: [{ id: 'u1', label: 'الف' }] });
  assert.equal(long.truncated, true);
});

test('generate: spec guardrails + Confirmed Constraints are both checked; each criterion/guardrail gets pass/fail + reason; band + dependency outputs are honoured', async () => {
  const p = new MockProvider((c) => (isCheckCall(c) ? answerChecks(c, ['g0']) : isDecision(c) ? decide('medium', 'drafting') : { blocks: [block('b1', 'خروجی')] }));
  const { service } = serviceWith(p);
  const ev = await collect((emit) => service.generate('user-12345678', {
    deliverableId: 'd', deliverableTitle: 'کتابچه', deliverableType: 'Deliverable', acceptanceCriteria: ['معیار الف', 'معیار ب'], userMode: 'fast',
    specTarget: 'ساخت کتابچهٔ برند', specGuardrails: ['از واژهٔ «ارزان» استفاده نکن'], outputBand: 'long',
    dependencyOutputs: [{ title: 'جمله موقعیت‌یابی', markdown: 'متن قبلی ما' }],
    contextObjects: [{ id: 'k', type: 'Constraint', status: 'Confirmed', title: 'بدون تخفیف', content: 'تخفیف نداریم', nodeId: 'offer', version: 1 }],
  }, emit));
  assert.equal(ev.find((e) => e.type === 'plan') && (ev.find((e) => e.type === 'plan') as Extract<AiStreamEvent, { type: 'plan' }>).plan.outputBand.maxWords, 2000);
  const done = ev.at(-1) as Extract<AiStreamEvent, { type: 'done' }>;
  // fast = single → no validator; use auto to validate
  assert.equal(done.result.checks, undefined);
  const ev2 = await collect((emit) => service.generate('user-12345678', {
    deliverableId: 'd', deliverableTitle: 'کتابچه', deliverableType: 'Deliverable', acceptanceCriteria: ['معیار الف', 'معیار ب'], userMode: 'auto',
    specGuardrails: ['از واژهٔ «ارزان» استفاده نکن'],
    contextObjects: [{ id: 'k', type: 'Constraint', status: 'Confirmed', title: 'بدون تخفیف', content: 'تخفیف نداریم', nodeId: 'offer', version: 1 }],
  }, emit));
  const r = (ev2.at(-1) as Extract<AiStreamEvent, { type: 'done' }>).result;
  assert.deepEqual(r.checks?.map((k) => [k.kind, k.text, k.passed]), [
    ['criterion', 'معیار الف', true], ['criterion', 'معیار ب', true],
    ['guardrail', 'از واژهٔ «ارزان» استفاده نکن', false], ['guardrail', 'بدون تخفیف: تخفیف نداریم', true],
    ['consistency', 'سازگاری با دانش تأییدشدهٔ کسب‌وکار', true],
  ]);
  assert.equal(r.checks![2].reason, 'دلیل رد g0');
  assert.equal(r.validationFailed, true);
  const draft = p.calls.find((c) => c.kind === 'structured' && JSON.stringify(c.schema).includes('blocks'))!;
  assert.match(draft.prompt.user, /هدف جریان کار: ساخت کتابچهٔ برند/);
  assert.match(draft.prompt.user, /جمله موقعیت‌یابی[\s\S]*متن قبلی ما/);
});

test('gap: ambiguity is one batched decision call, judged by meaning, with a reason per object', async () => {
  const p = new MockProvider((c) => (isCheckCall(c) ? answerChecks(c, ['o1']) : null));
  const { service } = serviceWith(p);
  const r = await service.judgeAmbiguity('user-12345678', [{ id: 'a', title: 'مخاطب', content: 'فریلنسرهای ارشد طراحی' }, { id: 'b', title: 'هدف', content: 'رشد خوب' }]);
  assert.equal(p.calls.length, 1);
  assert.deepEqual([r.judgments.a.ambiguous, r.judgments.b.ambiguous], [false, true]);
  assert.equal(r.judgments.b.reason, 'دلیل رد o1');
  assert.equal(r.usage?.stages[0].tier, 'cheap');
  assert.deepEqual((await service.judgeAmbiguity('user-12345678', [])).judgments, {});
});

test('Context Coach: balanced tier, questions + ambiguities + PROPOSALS only (clamped to known nodes), nothing is saved by it', async () => {
  const p = new MockProvider((c) => (c.kind === 'structured' && JSON.stringify(c.schema).includes('ambiguities') ? {
    questions: ['مخاطب دقیقاً کیست؟', 'q2', 'q3', 'q4', 'q5'], ambiguities: [{ quote: 'مشتری خوب', why: 'معیار ندارد' }, { quote: '', why: 'x' }],
    proposals: [{ type: 'Decision', title: 'مخاطب', content: 'فریلنسرها', nodeId: 'ghost' }, { type: 'Nope', title: 'x', content: 'y' }],
  } : null));
  const { service } = serviceWith(p);
  const r = await service.coach('user-12345678', { scope: 'node', text: 'مشتری خوب می‌خواهیم', nodeId: 'u1', nodeLabel: 'کمپین', nodes: [{ id: 'u1', label: 'کمپین' }] });
  assert.equal(p.calls.length, 1);
  assert.equal(r.usage.stages[0].tier, 'balanced');
  assert.equal(r.usage.stages[0].stage, 'coach');
  assert.equal(r.questions.length, 4);
  assert.deepEqual(r.ambiguities, [{ quote: 'مشتری خوب', why: 'معیار ندارد' }]);
  assert.deepEqual(r.proposals.map((o) => [o.title, o.nodeId]), [['مخاطب', 'u1']]);
  assert.match(p.calls[0].prompt.user, /کمپین/);
});

test('contradictions: ONE closed question per candidate pair, both claims quoted, binary answer + reason, no probability leaves the server', async () => {
  const asked: Array<{ id: string; question: string; options: string[] }> = [];
  const fake = { async decide(_s: unknown, qs: Array<{ id: string; question: string; options: string[] }>) {
    asked.push(...qs);
    return { answers: qs.map((q, i) => ({ id: q.id, choice: i === 0 ? 'conflict' : 'compatible', probability: 0.93, reason: i === 0 ? 'دو قیمت متفاوت' : 'دو بخش مختلف' })) };
  } };
  const p = new MockProvider(() => null);
  p.models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];
  const sessions = new SessionResolver({ managedEnabled: true, managedKey: KEY, cfg, factory: () => p });
  const service = new AiService({ sessions, cfg, decisionFactory: () => fake as never });
  const r = await service.judgeContradictions('user-12345678', [
    { key: 'a|b', a: { title: 'قیمت اشتراک', content: '۴ میلیون تومان' }, b: { title: 'قیمت', content: '۶ میلیون تومان' } },
    { key: 'c|d', a: { title: 'لحن', content: 'صریح' }, b: { title: 'لحن کانال', content: 'رسمی' } },
  ]);
  assert.equal(asked.length, 2, 'exactly one question per pair');
  assert.deepEqual(asked.map((q) => q.options), [['conflict', 'compatible'], ['conflict', 'compatible']]);
  assert.match(asked[0].question, /ادعای الف — «قیمت اشتراک»: ۴ میلیون تومان[\s\S]*ادعای ب — «قیمت»: ۶ میلیون تومان/);
  assert.deepEqual(r.results, { 'a|b': { conflict: true, reason: 'دو قیمت متفاوت' }, 'c|d': { conflict: false, reason: 'دو بخش مختلف' } });
  assert.ok(!JSON.stringify(r).includes('0.93'), 'no model confidence is exposed');
  assert.deepEqual((await service.judgeContradictions('user-12345678', [])).results, {});
});

test('generate: from a client-supplied list only global, unexpired Constraints join the guardrails (a position-only or expired one is neither validated nor recorded as lineage)', async () => {
  const p = new MockProvider((c) => (isCheckCall(c) ? answerChecks(c, ['g0', 'g1']) : isDecision(c) ? decide('medium', 'drafting') : { blocks: [block('b1', 'خروجی')] }));
  const { service } = serviceWith(p);
  const k = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'Constraint', status: 'Confirmed', title: id, content: `${id} متن`, nodeId: 'offer', version: 1, ...extra });
  const ev = await collect((emit) => service.generate('user-12345678', {
    deliverableId: 'd', deliverableTitle: 'کتابچه', deliverableType: 'Deliverable', acceptanceCriteria: ['معیار'], userMode: 'auto',
    contextObjects: [],
    contextList: [k('global'), k('legacy'), k('only-here', { reach: 'position' }), k('old', { validUntil: '2020-01-01' })],
  }, emit));
  const r = (ev.at(-1) as Extract<AiStreamEvent, { type: 'done' }>).result;
  assert.deepEqual(r.usedContext.map((u) => u.id).sort(), ['global', 'legacy']);
  assert.deepEqual(r.checks?.filter((c) => c.kind === 'guardrail').map((c) => c.text).sort(), ['global: global متن', 'legacy: legacy متن']);
});

test('prompt layout: the order is the REAL tree order — a user node placed first leads, no node name is known to the code', () => {
  const mine = { id: 'm', type: 'Fact', status: 'Confirmed', title: 'اولی', content: '۱', nodeId: 'nd_mine', nodeRank: 0 };
  const old = { id: 'o', type: 'Fact', status: 'Confirmed', title: 'دومی', content: '۲', nodeId: 'business', nodeRank: 5 };
  const p = buildPrompt({ contexts: [old, mine], task: 'T', nodeLabels: { nd_mine: 'بسته‌های خدمت', business: 'کسب‌وکار' } });
  assert.ok(p.prefix!.indexOf('اولی') < p.prefix!.indexOf('دومی'));
  assert.match(p.prefix!, /\(بسته‌های خدمت\)/, 'the label comes from the workspace, not from a table in the code');
});
