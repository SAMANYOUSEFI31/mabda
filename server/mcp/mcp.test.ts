import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../app.ts';
import { migrate } from '../db/migrations.ts';
import { Repo } from '../db/repo.ts';

async function boot() {
  const db = new Database(':memory:'); migrate(db);
  const { app, repo } = createApp(db);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as any };
  };
  await api('POST', '/bootstrap', {});
  const connect = async (token: string, via: 'header' | 'query' = 'header') => {
    const url = new URL(`${base}/mcp${via === 'query' ? `?token=${token}` : ''}`);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(url, via === 'header' ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined));
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    return { isError: Boolean(r.isError), data: (r.structuredContent ?? {}) as any, text: String((r.content as Array<{ text?: string }>)[0]?.text ?? '') };
  };
  const token = async (wid = 'ws_studio', label = 'Claude') => (await api('POST', `/workspaces/${wid}/mcp/tokens`, { label })).json;
  return { api, connect, call, token, repo: repo as Repo, base, close: () => server.close() };
}

test('server instructions tell the AI the rules; all tools are listed', async () => {
  const t = await boot();
  try {
    const tok = await t.token();
    const c = await t.connect(tok.token);
    const tools = (await c.listTools()).tools.map((x) => x.name).sort();
    assert.deepEqual(tools, ['check_impact', 'get_asset', 'get_changes', 'get_context', 'get_gaps', 'get_readiness', 'get_workspace_overview', 'list_assets', 'propose_context_updates', 'save_asset']);
    const ins = c.getInstructions() ?? '';
    assert.match(ins, /get_gaps/);
    assert.match(ins, /propose_context_updates/);
    assert.match(ins, /Confirmed/);
    assert.match(ins, /save_asset/);
    await c.close();
  } finally { t.close(); }
});

test('auth: token per workspace; wrong, revoked and header-less requests are refused; ?token= works; every plan can create a token', async () => {
  const t = await boot();
  try {
    const none = await fetch(`${t.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
    assert.equal(none.status, 401);
    await assert.rejects(t.connect('mbd_wrong'));
    const tok = await t.token();
    assert.match(tok.token, /^mbd_/);
    assert.ok(!JSON.stringify(t.repo.listMcpTokens({ userId: 'local', workspaceId: 'ws_studio' })).includes(tok.token), 'only a hash is stored; listing never shows the token');
    const viaQuery = await t.connect(tok.token, 'query');
    assert.equal((await t.call(viaQuery, 'get_workspace_overview')).data.workspace.id, 'ws_studio');
    await viaQuery.close();
    // a token speaks for ITS workspace only
    const other = await t.api('PUT', '/workspaces/ws_second', { id: 'ws_second', name: 'دوم', slug: 's', description: '', planId: 'pro', creditsRemaining: 1, todayChatCount: 0, createdAt: new Date().toISOString() });
    assert.equal(other.status, 200);
    const tok2 = await t.token('ws_second', 'Cursor');
    const c2 = await t.connect(tok2.token);
    const ov2 = (await t.call(c2, 'get_workspace_overview')).data;
    assert.equal(ov2.workspace.id, 'ws_second');
    assert.equal(ov2.counts.confirmed, 0, 'no data of the other workspace is visible');
    await c2.close();
    // revoke
    const list = (await t.api('GET', '/workspaces/ws_studio/mcp/tokens')).json.tokens;
    await t.api('DELETE', `/workspaces/ws_studio/mcp/tokens/${list[0].id}`);
    await assert.rejects(t.connect(tok.token));
    // MCP is open on every plan (it is how the user's own AI reaches the Context)
    const starter = await t.api('POST', '/workspaces/ws_course/mcp/tokens', { label: 'x' });
    assert.equal(starter.status, 200);
  } finally { t.close(); }
});

test('get_context: only Confirmed is fact; Proposed / Needs Review come separately; filters and search work', async () => {
  const t = await boot();
  try {
    const c = await t.connect((await t.token()).token);
    const all = await t.call(c, 'get_context');
    assert.ok(all.data.facts.length >= 5 && all.data.facts.every((f: any) => f.status === 'Confirmed'));
    assert.ok(all.data.unconfirmed.length >= 1 && all.data.unconfirmed.every((f: any) => f.status !== 'Confirmed'));
    assert.match(all.text, /## واقعیت‌ها \(Confirmed\)[\s\S]*## تأییدنشده[\s\S]*واقعیت نیست/);
    assert.ok(all.data.facts[0].version >= 1 && all.data.facts[0].nodePath);
    const branch = await t.call(c, 'get_context', { nodeId: 'offer' });
    assert.ok(branch.data.facts.every((f: any) => f.nodeId === 'offer'));
    const found = await t.call(c, 'get_context', { query: 'قیمت‌گذاری تخفیف', statuses: ['Confirmed'] });
    assert.ok(found.data.facts.length >= 1 && found.data.unconfirmed.length === 0);
    assert.ok(found.data.facts[0].content.includes('قیمت'));
    const types = await t.call(c, 'get_context', { types: ['Constraint'] });
    assert.ok(types.data.facts.every((f: any) => f.type === 'Constraint'));
    assert.equal((await t.call(c, 'get_context', { nodeId: 'ghost' })).isError, true);
    await c.close();
  } finally { t.close(); }
});

test('get_gaps / get_readiness for a spec and an output (criteria, guardrails, lock)', async () => {
  const t = await boot();
  try {
    const c = await t.connect((await t.token()).token);
    const g = await t.call(c, 'get_gaps', { specId: 'main_positioning', deliverableId: 'del_icp_profile' });
    assert.ok(Array.isArray(g.data.gaps));
    assert.equal(g.data.deliverable.id, 'del_icp_profile');
    assert.ok(g.data.deliverable.acceptanceCriteria.length > 0);
    assert.ok(g.data.guardrails.some((x: string) => /تخفیف|قیمت/.test(x)), 'Confirmed Constraints are guardrails automatically');
    const r = await t.call(c, 'get_readiness', { specId: 'main_positioning' });
    assert.equal(typeof r.data.score, 'number');
    assert.ok(['ready', 'needs_work', 'blocked'].includes(r.data.status));
    assert.equal((await t.call(c, 'get_gaps', { specId: 'nope' })).isError, true);
    await c.close();
  } finally { t.close(); }
});

test('propose_context_updates NEVER creates Confirmed knowledge (even when the client tries), lands in the inbox with its source, dedupes, respects the object cap', async () => {
  const t = await boot();
  try {
    const c = await t.connect((await t.token('ws_studio', 'Claude Desktop')).token);
    const sneaky = { type: 'Decision', title: 'تمرکز روی طراحان', content: 'مخاطب اصلی طراحان فریلنسر هستند.', nodeId: 'business', reason: 'کاربر در گفتگو گفت', status: 'Confirmed', provenance: 'User Input' };
    const r = await t.call(c, 'propose_context_updates', { updates: [sneaky, { type: 'Fact', title: 'گره ناشناخته', content: 'متن', nodeId: 'ghost' }] });
    assert.equal(r.isError, false);
    assert.deepEqual(r.data.results.map((x: any) => [x.ok, x.status]), [[true, 'Proposed'], [true, 'Proposed']]);
    const saved = t.repo.listObjects({ userId: 'local', workspaceId: 'ws_studio' }).filter((o) => o.title === 'تمرکز روی طراحان');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].status, 'Proposed');
    assert.equal(saved[0].provenance, 'AI Suggested');
    assert.deepEqual([saved[0].source?.kind, saved[0].source?.label, saved[0].source?.reason], ['mcp', 'Claude Desktop', 'کاربر در گفتگو گفت']);
    assert.equal(t.repo.listObjects({ userId: 'local', workspaceId: 'ws_studio' }).find((o) => o.title === 'گره ناشناخته')!.nodeId, 'business');
    // nothing the tool does ever produces a Confirmed object
    const before = t.repo.listObjects({ userId: 'local', workspaceId: 'ws_studio' }).filter((o) => o.status === 'Confirmed').length;
    await t.call(c, 'propose_context_updates', { updates: [sneaky] });
    const after = t.repo.listObjects({ userId: 'local', workspaceId: 'ws_studio' });
    assert.equal(after.filter((o) => o.status === 'Confirmed').length, before);
    assert.equal(after.filter((o) => o.title === 'تمرکز روی طراحان').length, 1, 'same suggestion is not duplicated');
    // it shows up as unconfirmed, never as fact, when read back
    const ctx = await t.call(c, 'get_context', { query: 'طراحان فریلنسر' });
    assert.ok(ctx.data.unconfirmed.some((x: any) => x.title === 'تمرکز روی طراحان'));
    assert.ok(!ctx.data.facts.some((x: any) => x.title === 'تمرکز روی طراحان'));
    await c.close();
  } finally { t.close(); }
});

test('full external-AI scenario: gaps → read context → save_asset with lineage → Context changes → check_impact → asset shows what changed', async () => {
  const t = await boot();
  try {
    const c = await t.connect((await t.token('ws_studio', 'Claude')).token);
    const ov = await t.call(c, 'get_workspace_overview');
    assert.ok(ov.data.specs.some((s: any) => s.id === 'main_positioning'));
    const gaps = await t.call(c, 'get_gaps', { specId: 'main_positioning', deliverableId: 'del_positioning_statement' });
    assert.equal(gaps.data.deliverable.locked, false);
    const ctx = await t.call(c, 'get_context', { statuses: ['Confirmed'] });
    const audience = ctx.data.facts.find((f: any) => f.id === 'ctx_audience');
    assert.ok(audience);

    // unknown ids are refused (lineage must be real)
    assert.equal((await t.call(c, 'save_asset', { title: 'x', markdown: 'y', usedContext: [{ id: 'ghost' }] })).isError, true);

    const saved = await t.call(c, 'save_asset', {
      title: 'جملهٔ موقعیت‌یابی (ساخته‌شده بیرون از Mabda)', markdown: 'برای فریلنسرها …', deliverableId: 'del_positioning_statement',
      usedContext: [{ id: 'ctx_audience', version: audience.version }], usedContextIds: ['ctx_domain'],
    });
    assert.equal(saved.isError, false);
    assert.deepEqual(saved.data.usedContext.map((u: any) => [u.id, u.version]).sort(), [['ctx_audience', audience.version], ['ctx_domain', 1]]);
    assert.equal(saved.data.workstreamId, 'main_positioning');
    const stored = t.repo.getDeliverable({ userId: 'local', workspaceId: 'ws_studio' }, saved.data.assetId)!;
    assert.deepEqual(stored.source?.kind, 'mcp');
    assert.equal((await t.call(c, 'check_impact', { assetId: saved.data.assetId })).data.staleCount, 0);

    // the user edits the audience in Mabda
    const edit = await t.api('PATCH', '/workspaces/ws_studio/objects/ctx_audience', { content: 'مدیران محصول استارتاپ‌ها' });
    assert.equal(edit.json.object.version, audience.version + 1);

    const impact = await t.call(c, 'check_impact', { assetId: saved.data.assetId });
    assert.equal(impact.data.staleCount, 1);
    assert.match(impact.data.stale[0].reasons[0].message, /از نسخهٔ ۱ به ۲ تغییر کرد/);
    assert.match(impact.text, /قدیمی/);
    const asset = await t.call(c, 'get_asset', { id: saved.data.assetId });
    assert.equal(asset.data.stale, true);
    assert.deepEqual(asset.data.usedContext.find((u: any) => u.id === 'ctx_audience'), { id: 'ctx_audience', version: 1, title: asset.data.usedContext.find((u: any) => u.id === 'ctx_audience').title, currentVersion: 2, changed: true });
    assert.equal((await t.call(c, 'list_assets', { staleOnly: true })).data.assets.some((a: any) => a.id === saved.data.assetId), true);
    assert.ok(asset.data.content.includes('برای فریلنسرها'));
    assert.equal((await t.call(c, 'get_asset', { id: 'ghost' })).isError, true);
    await c.close();
  } finally { t.close(); }
});

test('propose_context_updates with slotKey fills the Gap once confirmed (Proposed alone is not a fact); unknown slots are ignored with a note', async () => {
  const t = await boot();
  try {
    const c = await t.connect((await t.token()).token);
    const before = await t.call(c, 'get_gaps', { specId: 'main_positioning' });
    const gap = before.data.gaps.find((g: any) => g.status === 'missing' && g.importance === 'required');
    assert.ok(gap, 'the sample workspace has a missing required item');
    const r = await t.call(c, 'propose_context_updates', { updates: [
      { type: 'Fact', title: 'عنوان دلخواه که ربطی به برچسب ندارد', content: 'مسئلهٔ اصلی مشتری: توضیح دوبارهٔ کسب‌وکار به هر AI', slotKey: gap.key },
      { type: 'Fact', title: 'ناشناخته', content: 'متن', slotKey: 'not_a_slot' },
    ] });
    assert.match(r.data.results[1].note, /هیچ شکافی نیست/);
    const saved = t.repo.listObjects({ userId: 'local', workspaceId: 'ws_studio' });
    const mine = saved.find((o) => o.title.startsWith('عنوان دلخواه'))!;
    assert.equal(mine.slotKey, gap.key);
    assert.equal(mine.status, 'Proposed');
    assert.equal(saved.find((o) => o.title === 'ناشناخته')!.slotKey, undefined);
    const afterProposed = await t.call(c, 'get_gaps', { specId: 'main_positioning' });
    assert.equal(afterProposed.data.gaps.find((g: any) => g.key === gap.key)?.status !== 'missing', true, 'a Proposed object fills the slot (counted partially) …');
    t.repo.updateObject({ userId: 'local', workspaceId: 'ws_studio' }, mine.id, { status: 'Confirmed' });
    const after = await t.call(c, 'get_gaps', { specId: 'main_positioning' });
    assert.equal(after.data.gaps.some((g: any) => g.key === gap.key), false, '… and once the user confirms it the gap is closed');
    const ctx = await t.call(c, 'get_context', { statuses: ['Confirmed'] });
    assert.equal(ctx.data.facts.find((f: any) => f.id === mine.id).slotKey, gap.key);
    await c.close();
  } finally { t.close(); }
});

test('get_changes: read-only, filterable, shows who did it but never the written reason', async () => {
  const t = await boot();
  try {
    const tok = await t.token();
    const c = await t.connect(tok.token);
    const s = { userId: 'local', workspaceId: 'ws_studio' };
    const before = await t.call(c, 'get_changes', {});
    const o = t.repo.createObject(s, { type: 'Decision', provenance: 'User Input', title: 'قیمت', content: 'پنج', nodeId: 'business' });
    t.repo.supersedeObject(s, o.id, { type: 'Decision', provenance: 'User Input', title: 'قیمت', content: 'شش', nodeId: 'business' }, { reason: 'راز: بودجه کم شد' });
    const r = await t.call(c, 'get_changes', { objectId: o.id });
    assert.deepEqual(r.data.changes.map((x: any) => x.kind), ['created', 'superseded']);
    assert.equal(r.data.changes[1].hasReason, true);
    assert.ok(!JSON.stringify(r.data).includes('بودجه کم شد') && !r.text.includes('بودجه کم شد'), 'the reason is not returned');
    assert.ok((await t.call(c, 'get_changes', { since: '2999-01-01' })).data.count === 0);
    assert.equal((await t.call(c, 'get_changes', { since: 'not a date' })).isError, true);
    assert.ok(before.data.count >= 0);
    await c.close();
  } finally { t.close(); }
});

test('the showcase workspace is a normal workspace for MCP: gaps (one missing, one ambiguous), changes by actor and the review reasons stay private', async () => {
  const t = await boot();
  try {
    await t.api('POST', '/demo/reset', {});
    const tok = await t.token('ws_demo', 'Claude');
    const c = await t.connect(tok.token);
    const g = await t.call(c, 'get_gaps', { specId: 'demo_spec_campaign' });
    assert.ok(JSON.stringify(g.data).includes('launch_date'));
    const ch = await t.call(c, 'get_changes', { limit: 200 });
    assert.ok(ch.data.count > 20);
    assert.ok(new Set(ch.data.changes.map((x: any) => x.actor)).size >= 4);
    assert.ok(!JSON.stringify(ch.data).includes('بعد از نظرسنجی از مشتری‌ها'), 'reasons are not returned');
    assert.ok(ch.data.changes.some((x: any) => x.hasReason));
    await c.close();
  } finally { t.close(); }
});
