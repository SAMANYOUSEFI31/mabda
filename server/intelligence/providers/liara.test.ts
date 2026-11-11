import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntelligenceError } from '../errors.ts';
import type { IntelligenceConfig } from '../config.ts';
import { createLiaraSpecialists, readLiaraEnv } from './liara.ts';

const KEY = 'sk-secret-key-123';
const BASE = 'https://liara.test/api/x/v1';
const USER_TEXT = 'متن-خصوصی-کاربر';

const cfg: IntelligenceConfig = {
  liara: { baseUrlEnv: 'T_BASE', apiKeyEnv: 'T_KEY', timeoutsMs: { embedding: 1000, rerank: 1000, judgment: 1000, transcription: 1000 } },
  models: {
    emb: { key: 'emb', kind: 'embedding', id: 'test/embed', maxInputTokens: 512, dimensions: 3, inputPrefix: { query: 'q: ', passage: 'p: ' }, limits: { maxTexts: 4 } },
    embPlain: { key: 'embPlain', kind: 'embedding', id: 'test/embed-plain', maxInputTokens: 512 },
    rr: { key: 'rr', kind: 'rerank', id: 'test/rerank' },
    jv: { key: 'jv', kind: 'judgment', id: 'test/judge', limits: { maxQuestions: 5 } },
    st: { key: 'st', kind: 'transcription', id: 'test/stt' },
    stLang: { key: 'stLang', kind: 'transcription', id: 'test/stt-lang', sendLanguage: true },
  },
  recipes: {},
};

interface Rec { url: string; init: RequestInit }
function fake(script: Array<(init: RequestInit) => Response | Promise<Response>>, timeouts?: Partial<IntelligenceConfig['liara']['timeoutsMs']>) {
  const calls: Rec[] = [];
  let i = 0;
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const step = script[Math.min(i++, script.length - 1)];
    return step(init ?? {});
  }) as typeof fetch;
  const c: IntelligenceConfig = timeouts ? { ...cfg, liara: { ...cfg.liara, timeoutsMs: { ...cfg.liara.timeoutsMs, ...timeouts } } } : cfg;
  return { calls, sp: createLiaraSpecialists(c, { baseUrl: BASE + '/', apiKey: KEY, fetch: f }) };
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = (body: string, status = 200) => () => new Response(body, { status });
const bodyOf = (r: Rec) => JSON.parse(r.init.body as string);
const hdr = (r: Rec, k: string) => (r.init.headers as Record<string, string>)[k];
const waitAbort = (init: RequestInit) => new Promise<Response>((_, rej) => {
  init.signal!.addEventListener('abort', () => rej(init.signal!.reason), { once: true });
});

async function rejects(p: Promise<unknown>, kind: string, status?: number): Promise<IntelligenceError> {
  try { await p; } catch (e) {
    assert.ok(e instanceof IntelligenceError, `IntelligenceError expected, got ${String(e)}`);
    assert.equal(e.kind, kind);
    if (status !== undefined) assert.equal(e.status, status);
    const blob = `${e.message} ${e.detail ?? ''}`;
    assert.ok(!blob.includes(KEY), 'key leaked');
    assert.ok(!blob.includes(USER_TEXT), 'user text leaked');
    return e;
  }
  throw new Error('should have thrown');
}

// ───────── readLiaraEnv ─────────
test('readLiaraEnv: both set, trailing slashes stripped', () => {
  assert.deepEqual(readLiaraEnv(cfg, { T_BASE: ' https://a/b/v1// ', T_KEY: ' k ' }), { baseUrl: 'https://a/b/v1', apiKey: 'k' });
});
test('readLiaraEnv: missing or blank -> null', () => {
  assert.equal(readLiaraEnv(cfg, { T_BASE: 'https://a' }), null);
  assert.equal(readLiaraEnv(cfg, { T_KEY: 'k' }), null);
  assert.equal(readLiaraEnv(cfg, { T_BASE: '  ', T_KEY: 'k' }), null);
  assert.equal(readLiaraEnv(cfg, { T_BASE: 'https://a', T_KEY: '' }), null);
  assert.equal(readLiaraEnv(cfg, {}), null);
});

// ───────── model keys ─────────
test('missing or wrong-kind model key -> bad_request', () => {
  const { sp } = fake([json({})]);
  for (const f of [() => sp.embedding('nope'), () => sp.embedding('rr'), () => sp.rerank('emb'), () => sp.judgment('st'), () => sp.transcription('jv')]) {
    assert.throws(f, (e: unknown) => e instanceof IntelligenceError && e.kind === 'bad_request');
  }
});

// ───────── embedding ─────────
test('embedding: request shape, prefix, index ordering, usage', async () => {
  const { sp, calls } = fake([json({ data: [{ index: 1, embedding: [4, 5, 6] }, { index: 0, embedding: [1, 2, 3] }], usage: { prompt_tokens: 9, total_tokens: 12 } })]);
  const r = await sp.embedding('emb').embed(['a', 'b'], 'passage');
  assert.deepEqual(r.value, [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(r.usage, { units: 2, inputTokens: 9 });
  assert.equal(calls[0].url, `${BASE}/embeddings`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(hdr(calls[0], 'Authorization'), `Bearer ${KEY}`);
  assert.equal(hdr(calls[0], 'Content-Type'), 'application/json');
  assert.deepEqual(bodyOf(calls[0]), { model: 'test/embed', input: ['p: a', 'p: b'] });
  assert.ok(calls[0].init.signal);
});
test('embedding: query prefix, no-prefix model, total_tokens fallback', async () => {
  const { sp, calls } = fake([json({ data: [{ index: 0, embedding: [1] }], usage: { total_tokens: 3 } }), json({ data: [{ embedding: [1] }] })]);
  const r = await sp.embedding('embPlain').embed(['x'], 'query');
  assert.deepEqual(bodyOf(calls[0]).input, ['x']);
  assert.equal(r.usage.inputTokens, 3);
  const r2 = await sp.embedding('embPlain').embed(['x'], 'query');
  assert.equal(r2.usage.inputTokens, undefined);
  const { sp: sp2, calls: c2 } = fake([json({ data: [{ index: 0, embedding: [1, 2, 3] }] })]);
  await sp2.embedding('emb').embed(['x'], 'query');
  assert.deepEqual(bodyOf(c2[0]).input, ['q: x']);
});
test('embedding: maxTexts exceeded -> bad_request without calling', async () => {
  const { sp, calls } = fake([json({})]);
  await rejects(sp.embedding('emb').embed(['1', '2', '3', '4', '5'], 'passage'), 'bad_request');
  assert.equal(calls.length, 0);
});
test('embedding: count mismatch, wrong dimensions, bad vector -> bad_output', async () => {
  await rejects(fake([json({ data: [{ index: 0, embedding: [1, 2, 3] }] })]).sp.embedding('emb').embed(['a', 'b'], 'query'), 'bad_output');
  await rejects(fake([json({ data: [{ index: 0, embedding: [1, 2] }] })]).sp.embedding('emb').embed(['a'], 'query'), 'bad_output');
  await rejects(fake([json({ data: [{ index: 0, embedding: ['x'] }] })]).sp.embedding('embPlain').embed(['a'], 'query'), 'bad_output');
  await rejects(fake([json({ nodata: 1 })]).sp.embedding('embPlain').embed(['a'], 'query'), 'bad_output');
  await rejects(fake([json({ data: [{ index: 0, embedding: [1] }, { index: 0, embedding: [1] }] })]).sp.embedding('embPlain').embed(['a', 'b'], 'query'), 'bad_output');
});

// ───────── rerank ─────────
test('rerank: request shape, sorted best-first, usage', async () => {
  const { sp, calls } = fake([json({ results: [{ index: 1, relevance_score: 0.2 }, { index: 0, relevance_score: 0.9 }], meta: { billed_units: { input_tokens: 7 } } })]);
  const r = await sp.rerank('rr').rerank('q', ['d0', 'd1'], 2);
  assert.deepEqual(r.value, [{ index: 0, score: 0.9 }, { index: 1, score: 0.2 }]);
  assert.deepEqual(r.usage, { units: 2, inputTokens: 7 });
  assert.equal(calls[0].url, `${BASE}/rerank`);
  assert.deepEqual(bodyOf(calls[0]), { model: 'test/rerank', query: 'q', documents: ['d0', 'd1'], top_n: 2 });
});
test('rerank: no topN omitted; data/score variant', async () => {
  const { sp, calls } = fake([json({ data: [{ index: 0, score: 0.1 }, { index: 1, score: 0.8 }], usage: { total_tokens: 5 } })]);
  const r = await sp.rerank('rr').rerank('q', ['a', 'b']);
  assert.ok(!('top_n' in bodyOf(calls[0])));
  assert.deepEqual(r.value.map((x) => x.index), [1, 0]);
  assert.equal(r.usage.inputTokens, 5);
});
test('rerank: bad shapes -> bad_output', async () => {
  await rejects(fake([json({ results: [{ index: 5, relevance_score: 1 }] })]).sp.rerank('rr').rerank('q', ['a']), 'bad_output');
  await rejects(fake([json({ results: [{ index: 0 }] })]).sp.rerank('rr').rerank('q', ['a']), 'bad_output');
  await rejects(fake([json({ foo: [] })]).sp.rerank('rr').rerank('q', ['a']), 'bad_output');
});

// ───────── judgment ─────────
const Q = [
  { id: 'cat', type: 'choice' as const, instructions: 'which?', criteria: [{ id: 'billing', description: 'pay' }, { id: 'tech', description: 'bug' }] },
  { id: 'refund', type: 'noul' as const, instructions: 'refund?', criteria: ['true', 'false'] },
];
test('judgment: request uses object questions with criteria objects', async () => {
  const { sp, calls } = fake([json({ cat: 'billing', refund: 'true' })]);
  const r = await sp.judgment('jv').decide('state', Q);
  assert.equal(calls[0].url, `${BASE}/decisions`);
  assert.deepEqual(bodyOf(calls[0]), {
    model: 'test/judge',
    state: 'state',
    questions: {
      cat: { type: 'choice', instructions: 'which?', criteria: { billing: 'pay', tech: 'bug' } },
      refund: { type: 'noul', instructions: 'refund?', criteria: { true: 'true', false: 'false' } },
    },
  });
  assert.deepEqual(r.value.map((a) => a.choice), ['billing', 'true']);
  assert.equal(r.usage.units, 2);
  assert.equal(r.value[0].raw, 'billing');
});
test('judgment: object answer with probabilities -> confidence of chosen', async () => {
  const { sp } = fake([json({ answers: { cat: { choice: 'tech', probabilities: { billing: 0.2, tech: 0.8 } }, refund: { answer: true, confidence: 0.6 } } })]);
  const r = await sp.judgment('jv').decide('s', Q);
  assert.equal(r.value[0].choice, 'tech');
  assert.equal(r.value[0].confidence, 0.8);
  assert.deepEqual(r.value[0].probabilities, { billing: 0.2, tech: 0.8 });
  assert.equal(r.value[1].choice, 'true');
  assert.equal(r.value[1].confidence, 0.6);
  assert.deepEqual(r.value[1].raw, { answer: true, confidence: 0.6 });
});
test('judgment: probs/scores alias, results container, number-only distribution, null noul', async () => {
  const { sp } = fake([json({ results: { cat: { value: 'billing', probs: { billing: 0.7, tech: 0.3 } }, refund: null } })]);
  const r = await sp.judgment('jv').decide('s', Q);
  assert.equal(r.value[0].confidence, 0.7);
  assert.equal(r.value[1].choice, null);
  const { sp: sp2 } = fake([json({ data: { cat: { billing: 0.1, tech: 0.9 }, refund: { value: 'false', probability: 0.95 } } })]);
  const r2 = await sp2.judgment('jv').decide('s', Q);
  assert.equal(r2.value[0].choice, 'tech');
  assert.equal(r2.value[0].confidence, 0.9);
  assert.equal(r2.value[1].confidence, 0.95);
});
test('judgment: score type', async () => {
  const q = [{ id: 's', type: 'score' as const, instructions: 'rate', criteria: ['0', '1'] }];
  assert.equal((await fake([json({ s: 0.4 })]).sp.judgment('jv').decide('x', q)).value[0].score, 0.4);
  assert.equal((await fake([json({ s: { score: 2 } })]).sp.judgment('jv').decide('x', q)).value[0].score, 2);
  await rejects(fake([json({ s: 'high' })]).sp.judgment('jv').decide('x', q), 'bad_output');
});
test('judgment: missing question id or unknown shape -> bad_output; usage tokens only if reported', async () => {
  await rejects(fake([json({ cat: 'billing' })]).sp.judgment('jv').decide('s', Q), 'bad_output');
  await rejects(fake([json({ cat: { foo: 'x' }, refund: 'true' })]).sp.judgment('jv').decide('s', Q), 'bad_output');
  const r = await fake([json({ cat: 'billing', refund: 'true', usage: { total_tokens: 40 } })]).sp.judgment('jv').decide('s', Q);
  assert.equal(r.usage.inputTokens, 40);
});
test('judgment: too many questions -> bad_request', async () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, type: 'choice' as const, instructions: 'i', criteria: ['a'] }));
  const { sp, calls } = fake([json({})]);
  await rejects(sp.judgment('jv').decide('s', many), 'bad_request');
  assert.equal(calls.length, 0);
});

// ───────── transcription ─────────
test('transcription: multipart model+file, no language by default, duration', async () => {
  const { sp, calls } = fake([json({ text: 'سلام', duration: 3.5 })]);
  const r = await sp.transcription('st').transcribe({ data: new Uint8Array([1, 2, 3]), fileName: 'a.mp3', mimeType: 'audio/mpeg', language: 'fa' });
  assert.deepEqual(r.value, { text: 'سلام' });
  assert.deepEqual(r.usage, { audioSeconds: 3.5 });
  assert.equal(calls[0].url, `${BASE}/audio/transcriptions`);
  assert.equal(hdr(calls[0], 'Authorization'), `Bearer ${KEY}`);
  assert.equal(hdr(calls[0], 'Content-Type'), undefined);
  const form = calls[0].init.body as FormData;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('model'), 'test/stt');
  assert.equal(form.has('language'), false);
  assert.equal(form.has('response_format'), false);
  const file = form.get('file') as File;
  assert.equal(file.name, 'a.mp3');
  assert.equal(file.type, 'audio/mpeg');
  assert.equal(file.size, 3);
});
test('transcription: language sent only when sendLanguage; no duration -> usage empty; missing text -> bad_output', async () => {
  const { sp, calls } = fake([json({ text: 'x' })]);
  const r = await sp.transcription('stLang').transcribe({ data: new Uint8Array([1]), fileName: 'a.wav', mimeType: 'audio/wav', language: 'fa' });
  assert.equal((calls[0].init.body as FormData).get('language'), 'fa');
  assert.deepEqual(r.usage, {});
  await rejects(fake([json({ nope: 1 })]).sp.transcription('st').transcribe({ data: new Uint8Array([1]), fileName: 'a', mimeType: 'audio/wav' }), 'bad_output');
});

// ───────── error mapping ─────────
test('HTTP status mapping, detail has service body only and no key', async () => {
  const cases: Array<[number, string]> = [[401, 'auth'], [403, 'auth'], [429, 'rate_limit'], [500, 'provider'], [502, 'provider'], [400, 'bad_request'], [422, 'bad_request']];
  for (const [status, kind] of cases) {
    const e = await rejects(fake([text(`oops ${KEY} ${'x'.repeat(600)}`, status)]).sp.embedding('embPlain').embed([USER_TEXT], 'query'), kind, status);
    assert.ok(e.detail!.startsWith(`HTTP ${status}: oops ***`));
    assert.ok(e.detail!.length <= 400);
  }
});
test('invalid JSON / HTML body -> bad_output for every specialist', async () => {
  const { sp } = fake([text('<html>')]);
  await rejects(sp.embedding('embPlain').embed([USER_TEXT], 'query'), 'bad_output');
  await rejects(sp.rerank('rr').rerank(USER_TEXT, ['a']), 'bad_output');
  await rejects(sp.judgment('jv').decide(USER_TEXT, Q), 'bad_output');
  await rejects(sp.transcription('st').transcribe({ data: new Uint8Array([1]), fileName: 'a', mimeType: 'audio/wav' }), 'bad_output');
});
test('network failure -> provider, key scrubbed', async () => {
  const { sp } = fake([() => { throw new TypeError(`fetch failed for ${KEY}`); }]);
  const e = await rejects(sp.embedding('embPlain').embed([USER_TEXT], 'query'), 'provider');
  assert.equal(e.specialist, 'embedding');
  assert.equal(e.modelKey, 'embPlain');
});
test('caller abort -> aborted', async () => {
  const { sp } = fake([waitAbort]);
  const ac = new AbortController();
  const p = sp.rerank('rr').rerank('q', ['a'], undefined, { signal: ac.signal });
  ac.abort();
  await rejects(p, 'aborted');
});
test('timeout -> timeout', async () => {
  const { sp } = fake([waitAbort], { embedding: 20 });
  // AbortSignal.timeout does not keep the event loop alive; without a ref'd timer node:test cancels the pending test
  const keepAlive = setTimeout(() => {}, 1000);
  try { await rejects(sp.embedding('embPlain').embed(['a'], 'query'), 'timeout'); } finally { clearTimeout(keepAlive); }
});
test('no retry: a failing call is made exactly once', async () => {
  const { sp, calls } = fake([text('x', 500), json({ data: [{ index: 0, embedding: [1] }] })]);
  await rejects(sp.embedding('embPlain').embed(['a'], 'query'), 'provider');
  assert.equal(calls.length, 1);
});
