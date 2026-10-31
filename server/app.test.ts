import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';
import { createApp } from './app.ts';
import { migrate } from './db/migrations.ts';
import { SessionResolver } from './ai/session.ts';
import { ByokVault } from './ai/byok.ts';
import { loadModelsConfig } from './ai/config.ts';
import { AiService } from './ai/service.ts';
import { MockProvider, block, answerChecks, isCheckCall } from './ai/testing/mockProvider.ts';

const cfg = loadModelsConfig();
const KEY = 'AIzaSy' + 'x'.repeat(30);
const AI_USER = 'user-12345678';

async function boot(script: (c: { kind: string; schema?: unknown; prompt: { user: string; prefix?: string } }) => unknown) {
  const db = new Database(':memory:'); migrate(db);
  const p = new MockProvider((c) => script(c as never));
  p.models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];
  const sessions = new SessionResolver({ vault: new ByokVault(mkdtempSync(join(tmpdir(), 'mabda-')), 't'), managedEnabled: true, managedKey: KEY, cfg, factory: () => p });
  const service = new AiService({ sessions, cfg });
  const { app } = createApp(db, { sessions, service });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-mabda-user': AI_USER }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json() as any };
  };
  const ndjson = async (path: string, body: unknown) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mabda-user': AI_USER }, body: JSON.stringify(body) });
    return (await r.text()).trim().split('\n').map((l) => JSON.parse(l)) as any[];
  };
  return { p, call, ndjson, base, close: () => server.close() };
}
const isDecision = (c: { schema?: unknown }) => JSON.stringify(c.schema ?? '').includes('probability');
const decide = { answers: [{ id: 'taskKind', choice: 'chat', probability: 0.9 }, { id: 'difficulty', choice: 'easy', probability: 0.9 }, { id: 'importance', choice: 'low', probability: 0.9 }] };

test('scenario: change the audience → assets become stale with a reason → rebuild path (API level)', async () => {
  const t = await boot((c) => (c.kind === 'stream' ? { blocks: [block('b1', 'ok')] } : isCheckCall(c) ? answerChecks(c) : isDecision(c) ? decide : { blocks: [block('b1', 'متن تازه')] }));
  try {
    const boot1 = await t.call('POST', '/bootstrap', {});
    assert.equal(boot1.json.workspaces.length, 2, 'first run seeds the sample workspaces');
    assert.equal((await t.call('POST', '/bootstrap', {})).json.imported, null, 'bootstrap/import happens once');

    const st = (await t.call('GET', '/workspaces/ws_studio/state')).json;
    assert.equal(st.stale.length, 0);
    assert.equal(st.nodes.length, 5);
    const audience = st.objects.find((o: any) => o.id === 'ctx_audience');
    assert.equal(audience.version, 1);

    // generate through the gateway: the server reads the context itself and records exact versions
    const ev = await t.ndjson('/ai/generate', { workspaceId: 'ws_studio', deliverableId: 'x', deliverableTitle: 'پروفایل مشتری', deliverableType: 'Asset', acceptanceCriteria: ['معیار'], userMode: 'auto', targetNodeId: 'content' });
    const done = ev.at(-1);
    assert.equal(done.type, 'done');
    const used = done.result.usedContext as Array<{ id: string; version: number }>;
    assert.ok(used.some((u) => u.id === 'ctx_audience' && u.version === 1));
    const asset = { id: 'del_new', workspaceId: 'ws_studio', workstreamId: 'main_positioning', deliverableId: 'x', title: 'پروفایل مشتری', content: done.result.markdown, executionMode: 'auto', creditCost: 2, usedContext: used, rebuildCount: 0, createdAt: new Date().toISOString() };
    const saved = await t.call('PUT', '/workspaces/ws_studio/deliverables/del_new', asset);
    assert.equal(saved.json.stale.length, 0);

    // the user changes the audience
    const edit = await t.call('PATCH', '/workspaces/ws_studio/objects/ctx_audience', { content: 'مدیران محصول استارتاپ‌ها' });
    assert.equal(edit.json.object.version, 2);
    assert.ok(edit.json.impact.count >= 2, 'the seeded asset and the new one both used the audience');
    const ids = edit.json.stale.map((s: any) => s.deliverableId);
    assert.ok(ids.includes('del_new') && ids.includes('del_inst_1'));
    assert.match(edit.json.stale.find((s: any) => s.deliverableId === 'del_new').reasons[0].message, /«مخاطب اصلی \(ICP\)» از نسخهٔ ۱ به ۲ تغییر کرد/);

    // rebuild: a new generation records version 2 → asset is fresh again
    const ev2 = await t.ndjson('/ai/generate', { workspaceId: 'ws_studio', deliverableId: 'x', deliverableTitle: 'پروفایل مشتری', deliverableType: 'Asset', acceptanceCriteria: ['معیار'], userMode: 'auto', targetNodeId: 'content' });
    const used2 = ev2.at(-1).result.usedContext as Array<{ id: string; version: number }>;
    assert.equal(used2.find((u) => u.id === 'ctx_audience')!.version, 2);
    const rebuilt = await t.call('PUT', '/workspaces/ws_studio/deliverables/del_new', { ...asset, usedContext: used2, rebuildCount: 1, halfPriceUsedFor: 'sig' });
    assert.ok(!rebuilt.json.stale.some((s: any) => s.deliverableId === 'del_new'));
    assert.ok(rebuilt.json.stale.some((s: any) => s.deliverableId === 'del_inst_1'), 'the other asset is still stale');
  } finally { t.close(); }
});

test('node chat: context = sub-tree + ancestors, proposals clamped to the sub-tree, notes never injected, files excerpted', async () => {
  const t = await boot((c) => (c.kind === 'stream' ? { blocks: [{ id: 'b1', kind: 'decision', markdown: 'x', proposal: { type: 'Decision', title: 'پیشنهاد', content: 'متن', nodeId: 'offer' } }] } : JSON.stringify(c.schema ?? '').includes('"objects"') ? { summary: 'بودجه', objects: [{ type: 'Fact', title: 'بودجه', content: 'پنجاه میلیون', nodeId: 'unknown' }] } : decide));
  try {
    await t.call('POST', '/bootstrap', {});
    const node = (await t.call('POST', '/workspaces/ws_studio/nodes', { parentId: 'content', label: 'کمپین پاییز' })).json.node;
    const inside = (await t.call('POST', '/workspaces/ws_studio/objects', { type: 'Fact', provenance: 'User Input', title: 'هدف کمپین', content: 'جذب هزار کاربر', nodeId: node.id })).json.object;
    await t.call('POST', '/workspaces/ws_studio/notes', { nodeId: node.id, content: 'یادداشت خصوصی: رمز-محرمانه-۴۲' });
    const form = new FormData();
    form.set('file', new Blob([Buffer.from('بودجهٔ کمپین پاییز پنجاه میلیون تومان است. '.repeat(200))], { type: 'text/plain' }), 'budget.txt');
    form.set('nodeId', node.id);
    const up = await (await fetch(`${t.base}/workspaces/ws_studio/files`, { method: 'POST', body: form })).json() as any;
    assert.equal(up.file.status, 'uploaded');

    const ev = await t.ndjson('/ai/chat', { workspaceId: 'ws_studio', scopeNodeId: node.id, message: 'بودجهٔ کمپین چقدر است؟', mode: 'auto' });
    const done = ev.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.result.blocks[0].proposal.nodeId, node.id, 'proposal for `offer` (outside the sub-tree) is clamped to the scope node');
    const chatCall = t.p.calls.find((c) => c.kind === 'stream')!;
    const all = `${chatCall.prompt.prefix}\n${chatCall.prompt.user}`;
    assert.ok(all.includes('هدف کمپین'), 'objects in the scope are injected');
    assert.ok(!all.includes('رمز-محرمانه'), 'notes are never injected');
    assert.ok(!all.includes('بودجهٔ کمپین پاییز پنجاه'), 'file not processed yet → no excerpts');
    assert.ok(done.result.usedContext.some((u: any) => u.id === inside.id && u.version === 1));
    assert.ok(!done.result.usedContext.some((u: any) => u.id === 'ctx_pricing' || u.id === 'ctx_price_constraint'), 'offer-branch context is outside the scope chain');

    // process the file (cheap extraction), then the same question gets excerpts
    const proc = await t.call('POST', `/workspaces/ws_studio/files/${up.file.id}/process`, {});
    assert.equal(proc.status, 200);
    assert.equal(proc.json.file.status, 'ready');
    assert.deepEqual(proc.json.created.map((o: any) => [o.status, o.provenance, o.nodeId]), [['Proposed', 'Imported', node.id]], 'unknown node from the model falls back to the file node');
    t.p.calls.length = 0;
    const ev2 = await t.ndjson('/ai/chat', { workspaceId: 'ws_studio', scopeNodeId: node.id, message: 'بودجهٔ کمپین چقدر است؟', mode: 'auto' });
    assert.equal(ev2.at(-1).type, 'done');
    const c2 = t.p.calls.find((c) => c.kind === 'stream')!;
    assert.match(c2.prompt.user, /گزیده‌های فایل‌های بارگذاری‌شده[\s\S]*budget\.txt · بخش \d[\s\S]*بودجهٔ کمپین پاییز پنجاه/);
    assert.ok(!(c2.prompt.prefix ?? '').includes('پنجاه میلیون تومان'), 'excerpts are never part of the stable prefix');
    assert.ok(ev2.at(-1).result.usedFileChunks.length >= 1);
    // the object extracted from the file is Proposed: it is labelled unconfirmed and not a fact
    assert.match(c2.prompt.user, /بودجه: پنجاه میلیون[^\n]*«پیشنهادی»/);
  } finally { t.close(); }
});

test('notes: extract creates Proposed objects (AI Suggested) from the note; unauthorised/missing workspace is a 404', async () => {
  const t = await boot((c) => (c.kind === 'structured' && JSON.stringify(c.schema).includes('objects') ? { objects: [{ type: 'Decision', title: 'مخاطب', content: 'فریلنسرها', nodeId: 'brand' }] } : decide));
  try {
    await t.call('POST', '/bootstrap', {});
    const note = (await t.call('POST', '/workspaces/ws_studio/notes', { nodeId: 'brand', content: 'فکر می‌کنم مخاطب ما فریلنسرها هستند' })).json.note;
    const r = await t.call('POST', `/workspaces/ws_studio/notes/${note.id}/extract`, {});
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.created.map((o: any) => [o.status, o.provenance, o.version]), [['Proposed', 'AI Suggested', 1]]);
    assert.equal(r.json.ledger.mode, 'note_extract');
    assert.equal((await t.call('GET', '/workspaces/nope/state')).status, 404);
    // Proposed objects from extraction are not facts: confirming is the user's explicit action
    assert.equal(r.json.created[0].status, 'Proposed');
  } finally { t.close(); }
});

test('files over the API: 25MB cap and type check', async () => {
  const t = await boot(() => decide);
  try {
    await t.call('POST', '/bootstrap', {});
    const bad = new FormData(); bad.set('file', new Blob(['x']), 'virus.exe');
    const r = await fetch(`${t.base}/workspaces/ws_studio/files`, { method: 'POST', body: bad });
    assert.equal(r.status, 422);
    const big = new FormData(); big.set('file', new Blob([Buffer.alloc(26 * 1024 * 1024, 65)]), 'big.txt');
    const r2 = await fetch(`${t.base}/workspaces/ws_studio/files`, { method: 'POST', body: big });
    assert.equal(r2.status, 413);
    assert.match(((await r2.json()) as any).error.message, /۲۵ مگابایت/);
  } finally { t.close(); }
});

const specOf = (id: string, deps: Array<[string, string[]]>) => ({
  id, title: 'جریان سفارشی', target: 'هدف', description: '', requiredContext: [], suggestedContext: [], optionalContext: [], guardrails: ['بدون وعدهٔ بی‌پشتوانه'],
  deliverables: deps.map(([did, dependsOn], i) => ({ id: did, title: `خروجی ${did}`, type: 'Asset', description: '', order: i + 1, dependsOn, outputBand: 'short', baseCreditCost: { fast: 1, auto: 2, critique: 10, sensitive: 20 }, acceptanceCriteria: ['معیار'] })),
});

test('custom specs: Pro and above only, cycles are refused with the cycle named', async () => {
  const t = await boot(() => decide);
  try {
    await t.call('POST', '/bootstrap', {});
    const ok = await t.call('PUT', '/workspaces/ws_studio/specs/s1', specOf('s1', [['a', []], ['b', ['a']]]));
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.spec.deliverables[1].dependsOn, ['a']);
    const cyc = await t.call('PUT', '/workspaces/ws_studio/specs/s2', specOf('s2', [['a', ['b']], ['b', ['a']]]));
    assert.equal(cyc.status, 400);
    assert.match(cyc.json.error.message, /چرخه‌ای/);
    const starter = await t.call('PUT', '/workspaces/ws_course/specs/s3', specOf('s3', [['a', []]]));
    assert.equal(starter.status, 403);
    assert.match(starter.json.error.message, /Pro/);
    assert.equal((await t.call('GET', '/workspaces/ws_studio/state')).json.specs.length, 1);
  } finally { t.close(); }
});

test('gap: ambiguity is judged once per object version and cached; editing the object asks again', async () => {
  const t = await boot((c) => (isCheckCall(c) ? answerChecks(c, ['o0']) : decide));
  try {
    await t.call('POST', '/bootstrap', {});
    const r1 = await t.call('POST', '/workspaces/ws_studio/gap/judge', { objectIds: ['ctx_audience'] });
    assert.deepEqual([r1.json.judgments.ctx_audience.ambiguous, r1.json.judgments.ctx_audience.version], [true, 1]);
    const calls = t.p.calls.length;
    await t.call('POST', '/workspaces/ws_studio/gap/judge', { objectIds: ['ctx_audience'] });
    assert.equal(t.p.calls.length, calls, 'cached: no second model call');
    assert.ok(r1.json.ledger.some((l: any) => l.mode === 'gap_judge' && l.creditCost === 0));
    await t.call('PATCH', '/workspaces/ws_studio/objects/ctx_audience', { content: 'مخاطب دقیق‌تر: طراحان فریلنسر ارشد' });
    await t.call('POST', '/workspaces/ws_studio/gap/judge', { objectIds: ['ctx_audience'] });
    assert.equal(t.p.calls.length, calls + 1);
    assert.equal((await t.call('GET', '/workspaces/ws_studio/state')).json.judgments.ctx_audience.version, 2);
  } finally { t.close(); }
});

test('Context Coach: separate daily cap per plan, counted only after a successful answer', async () => {
  let fail = false;
  const t = await boot((c) => (JSON.stringify(c.schema ?? '').includes('ambiguities') ? (fail ? Object.assign(new Error('x'), { status: 500 }) : { questions: ['چه کسی؟'], ambiguities: [], proposals: [{ type: 'Fact', title: 'الف', content: 'ب', nodeId: 'business' }] }) : decide));
  try {
    await t.call('POST', '/bootstrap', {});
    const q0 = (await t.call('GET', '/workspaces/ws_course/coach/quota')).json;
    assert.deepEqual([q0.limit, q0.used], [5, 0], 'starter: 5 per day');
    assert.equal((await t.call('GET', '/workspaces/ws_studio/coach/quota')).json.limit, 15, 'pro: 15 per day');
    fail = true;
    assert.notEqual((await t.call('POST', '/workspaces/ws_course/coach', { scope: 'node', nodeId: 'business', text: 'متن' })).status, 200);
    assert.equal((await t.call('GET', '/workspaces/ws_course/coach/quota')).json.used, 0, 'failed answers are not counted');
    fail = false;
    for (let i = 0; i < 5; i++) assert.equal((await t.call('POST', '/workspaces/ws_course/coach', { scope: 'node', nodeId: 'business', text: 'متن' })).status, 200);
    const sixth = await t.call('POST', '/workspaces/ws_course/coach', { scope: 'node', nodeId: 'business', text: 'متن' });
    assert.equal(sixth.status, 429);
    assert.match(sixth.json.error.message, /سقف روزانه/);
    // the coach only proposes: nothing was written to the tree
    const st = (await t.call('GET', '/workspaces/ws_course/state')).json;
    assert.equal(st.objects.length, 0);
    assert.ok(st.ledger.some((l: any) => l.mode === 'coach'));
    assert.equal((await t.call('POST', '/workspaces/ws_studio/coach', { scope: 'onboarding', nodeId: 'business', text: 'متن' })).status, 200, 'the other workspace has its own cap');
  } finally { t.close(); }
});
