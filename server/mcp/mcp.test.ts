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
    assert.deepEqual(tools, ['check_impact', 'get_asset', 'get_changes', 'get_context', 'get_gaps', 'get_pack', 'get_readiness', 'get_workspace_overview', 'list_assets', 'list_packs', 'propose_context_updates', 'save_asset']);
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
    // at a node: what is in force there — its own, inherited and global ones — each with an origin
    assert.ok(branch.data.facts.length >= 1 && branch.data.facts.every((f: any) => ['own', 'inherited', 'global', 'subtree'].includes(f.origin)));
    assert.ok(branch.data.facts.filter((f: any) => f.origin === 'own').every((f: any) => f.nodeId === 'offer'));
    assert.ok(branch.data.facts.filter((f: any) => f.origin === 'global').every((f: any) => f.type === 'Constraint' && f.nodeId !== 'offer'));
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
    const lp = await t.call(c, 'list_packs');
    assert.deepEqual(lp.data.packs.map((p: any) => p.name).sort(), ['پاسخ به مشتری', 'کارگاه پاییز (با پیشنهادی‌ها)', 'متن تبلیغ اشتراک'].sort());
    assert.ok(!JSON.stringify(lp).includes('مثال:'), 'no grey example in any pack');
    const ov = await t.call(c, 'get_workspace_overview', {});
    assert.deepEqual(JSON.stringify(ov.data).includes('main_positioning') || JSON.stringify(ov.data).includes('freelance_profile'), false, 'the showcase shows only its own workstreams, not the library');
    assert.ok(JSON.stringify(ov.data).includes('demo_spec_campaign'));
    const ch = await t.call(c, 'get_changes', { limit: 200 });
    assert.ok(ch.data.count > 20);
    assert.ok(new Set(ch.data.changes.map((x: any) => x.actor)).size >= 4);
    assert.ok(!JSON.stringify(ch.data).includes('بعد از نظرسنجی از مشتری‌ها'), 'reasons are not returned');
    assert.ok(ch.data.changes.some((x: any) => x.hasReason));
    await c.close();
  } finally { t.close(); }
});

test('get_context with a nodeId returns the list IN FORCE there with an origin; a position-only rule of another branch, an overridden rule and an expired one are not facts (they come apart under notInForce)', async () => {
  const t = await boot();
  try {
    await t.api('POST', '/demo/reset', {});
    const tok = await t.token('ws_demo', 'Claude');
    const c = await t.connect(tok.token);
    const st = (await t.api('GET', '/workspaces/ws_demo/state')).json;
    const sub = st.nodes.find((n: any) => n.parentId && n.parentId !== 'business' && !n.isSystem) ?? st.nodes[0];
    const r = await t.call(c, 'get_context', { nodeId: sub.id });
    assert.ok(r.data.facts.every((f: any) => typeof f.origin === 'string' && f.reach));
    assert.ok(r.data.facts.every((f: any) => f.origin !== 'overridden' && f.origin !== 'expired'));
    const all = await t.call(c, 'get_context', {});
    assert.ok(all.data.facts.every((f: any) => !f.validUntil || f.validUntil >= new Date().toISOString().slice(0, 10)), 'an expired object is never a fact');
    await c.close();
  } finally { t.close(); }
});

test('get_context: an assumption is never a fact (even Confirmed) — it comes under `assumptions` with the rule; rejected options of a decision under `rejectedOptions`', async () => {
  const t = await boot();
  try {
    const mk = (b: Record<string, unknown>) => t.api('POST', '/workspaces/ws_studio/objects', { provenance: 'User Input', nodeId: 'business', ...b });
    await mk({ type: 'Fact', status: 'Confirmed', title: 'واقعیت', content: 'سی مشتری داریم' });
    await mk({ type: 'Fact', status: 'Confirmed', title: 'فرض من', content: 'مشتری‌ها پیام‌رسان را ترجیح می‌دهند', assumption: true, reviewBy: '2026-09-01' });
    await mk({ type: 'Decision', status: 'Confirmed', title: 'قیمت', content: 'ماهانه', record: { options: [{ title: 'سالانه', rejectedReason: 'نقدینگی' }] } });
    const tok = await t.token('ws_studio', 'Claude');
    const c = await t.connect(tok.token);
    const r = await t.call(c, 'get_context', {});
    assert.ok(r.data.facts.some((f: any) => f.title === 'واقعیت'));
    assert.ok(!r.data.facts.some((f: any) => f.title === 'فرض من'), 'an assumption is not a fact');
    assert.deepEqual(r.data.assumptions.map((a: any) => [a.title, a.reviewBy]), [['فرض من', '2026-09-01']]);
    assert.match(r.data.assumptionRule, /فرض‌اند، نه واقعیت/);
    assert.deepEqual(r.data.rejectedOptions.map((x: any) => [x.option, x.reason]), [['سالانه', 'نقدینگی']]);
    assert.match(r.text, /## فرض‌های فعال، تأییدنشده[\s\S]*فرض من/);
    assert.match(r.text, /## گزینه‌های بررسی‌شده و ردشده[\s\S]*«سالانه»/);
    await c.close();
  } finally { t.close(); }
});

// ── examples (starter / template samples) must never reach an AI or an engine — one central filter (repo.listObjects) ──
test('SAMPLES: a sample object is invisible to every path — repo lists, caps, state.objects, the Context pack, MCP (context / gaps / readiness / overview), Gap + Readiness, contradictions, impact', async () => {
  const t = await boot();
  try {
    const s = { userId: 'local', workspaceId: 'ws_studio' };
    const SECRET = 'نمونهٔ-ممنوع-برای-AI';
    const before = t.repo.countActiveObjects(s);
    const sample = t.repo.createSample(s, { type: 'Constraint', title: `قید ${SECRET}`, content: `هرگز ${SECRET}`, nodeId: 'business' })!;
    const sample2 = t.repo.createSample(s, { type: 'Decision', title: `مخاطب اصلی ${SECRET}`, content: `سازمان‌ها ${SECRET}`, nodeId: 'business', slotKey: 'target_audience' })!;
    t.repo.createSample(s, { type: 'Decision', title: `مخاطب فرعی ${SECRET}`, content: `دیگر ${SECRET}`, nodeId: 'business', slotKey: 'target_audience' }); // a second one in the same slot: a contradiction candidate if it were seen
    assert.equal(t.repo.createSample(s, { type: 'Decision', title: `مخاطب اصلی ${SECRET}`, content: 'x', nodeId: 'business' }), undefined, 'applying twice does not duplicate');
    const everything = (v: unknown) => JSON.stringify(v);

    // repo: lists, getters, caps
    assert.ok(!t.repo.listObjects(s).some((o) => o.id === sample.id) && !t.repo.getObject(s, sample.id), 'listObjects / getObject hide samples');
    assert.equal(t.repo.countActiveObjects(s), before, 'samples do not count against the plan');
    assert.ok(t.repo.getObjectAny(s, sample.id)?.sample, 'only the example editor can reach one');
    // the UI's state: engines get `objects` (no samples), the grey display gets `samples`
    const st = (await t.api('GET', '/workspaces/ws_studio/state')).json;
    assert.ok(!st.objects.some((o: any) => o.sample || o.title.includes(SECRET)));
    assert.equal(st.samples.length, 3);

    // the Context pack (ad-hoc route) and a pack for a target node
    for (const body of [{}, { nodeId: 'business' }]) assert.ok(!everything((await t.api('POST', '/workspaces/ws_studio/packs', body)).json).includes(SECRET), 'pack');

    // Gap + Readiness: a sample in a slot never fills it (the readiness engine is fed repo.listObjects / state.objects)

    // MCP
    const c = await t.connect((await t.token()).token);
    for (const [name, args] of [['get_context', {}], ['get_context', { nodeId: 'business' }], ['get_workspace_overview', {}], ['get_changes', {}], ['list_assets', {}]] as const) {
      const r = await t.call(c, name, args as Record<string, unknown>);
      assert.ok(!everything(r).includes(SECRET), `MCP ${name} shows no sample`);
    }
    const ov = await t.call(c, 'get_workspace_overview', {});
    const gaps = await t.call(c, 'get_gaps', { specId: ov.data.specs[0].id });
    assert.ok(!everything(gaps).includes(SECRET), 'MCP get_gaps: a sample is neither a gap answer nor a guardrail');
    assert.ok(!(gaps.data.guardrails as string[]).some((g) => g.includes(SECRET)));
    const ready = await t.call(c, 'get_readiness', { specId: ov.data.specs[0].id });
    assert.ok(!everything(ready).includes(SECRET));
    assert.ok(!everything(await t.call(c, 'check_impact', {})).includes(SECRET), 'MCP check_impact');
    assert.equal((await t.call(c, 'propose_context_updates', { updates: [{ type: 'Fact', title: 'سلام', content: 'x', nodeId: 'business' }] })).isError, false);
    await c.close();

    // contradictions: two samples in one slot are NOT a candidate (the model would never be asked)
    const { pairsToJudge } = await import('../../src/core/contradictionCandidates.ts');
    assert.deepEqual(pairsToJudge(t.repo.listObjects(s), [], undefined, t.repo.listRelationships(s), t.repo.listNodes(s)).filter((p) => p.a.title.includes(SECRET) || p.b.title.includes(SECRET)), []);
    // Gap + Readiness engines are fed repo.listObjects: a sample in a slot never fills it
    const { calculateReadinessAndGaps } = await import('../../src/core/contextEngine.ts');
    const sp = { id: 'x', title: 'x', target: 't', description: '', requiredContext: [{ key: 'zzz_slot', label: 'جای آزمایشی', description: '', nodeId: 'business', question: '؟', suggestedAnswers: [] }], suggestedContext: [], optionalContext: [], deliverables: [] } as never;
    t.repo.createSample(s, { type: 'Decision', title: `جای آزمایشی ${SECRET}`, content: SECRET, nodeId: 'business', slotKey: 'zzz_slot' });
    const r = calculateReadinessAndGaps(sp, t.repo.listObjects(s), []);
    assert.equal(r.gaps.find((g) => g.key === 'zzz_slot')?.status, 'missing', 'the sample did not fill the slot');
    // impact: samples are not part of the stale computation
    assert.ok(!everything(t.repo.computeStale(s)).includes(SECRET));
    // the update route of a sample id from the outside world still works for the editor, but «edit» makes it hers
    assert.equal(sample2.sample, true);
  } finally { t.close(); }
});

test('saved packs: built once, resolved through the effective context (a section rule stays in its section), only Confirmed is fact, assumptions apart, NO samples — via the API, MCP tools, MCP prompts and resources', async () => {
  const t = await boot();
  try {
    const s = { userId: 'local', workspaceId: 'ws_studio' };
    const SECRET = 'نمونهٔ-ممنوع-در-بسته';
    const mk = (b: Record<string, unknown>) => t.api('POST', '/workspaces/ws_studio/objects', { provenance: 'User Input', ...b }).then((r) => r.json.object);
    const n1 = (await t.api('POST', '/workspaces/ws_studio/nodes', { parentId: 'business', label: 'بخش یک' })).json.node.id;
    const n2 = (await t.api('POST', '/workspaces/ws_studio/nodes', { parentId: 'business', label: 'بخش دو' })).json.node.id;
    await mk({ type: 'Fact', status: 'Confirmed', title: 'واقعیت بخش یک', content: 'واقعیت-یک', nodeId: n1, facets: ['مخاطب سازمانی'] });
    await mk({ type: 'Fact', status: 'Confirmed', title: 'واقعیت بخش دو', content: 'واقعیت-دو', nodeId: n2, facets: ['فصل پاییز'] });
    await mk({ type: 'Constraint', status: 'Confirmed', title: 'قید فقط بخش دو', content: 'قید-دو', nodeId: n2, reach: 'position' });
    await mk({ type: 'Fact', status: 'Confirmed', title: 'فرض من', content: 'فرض-یک', nodeId: n1, assumption: true });
    await mk({ type: 'Fact', status: 'Proposed', title: 'پیشنهاد معلق', content: 'پیشنهاد-معلق', nodeId: n1 });
    t.repo.createSample(s, { type: 'Fact', title: `نمونه ${SECRET}`, content: SECRET, nodeId: n1, facets: ['مخاطب سازمانی'] });

    // create → list → render
    const made = (await t.api('POST', '/workspaces/ws_studio/saved-packs', { name: 'بستهٔ بخش یک', instruction: 'فقط از همین بسته کار کن.', selection: { nodeIds: [n1, 'ghost'], facets: [], statuses: [], includeAssumptions: true } })).json.pack;
    assert.deepEqual(made.selection.nodeIds, [n1], 'unknown nodes are dropped');
    assert.ok(made.tokens > 10 && made.counts.confirmed >= 1);
    const md = (await t.api('GET', `/workspaces/ws_studio/saved-packs/${made.id}/render`)).json.markdown as string;
    assert.match(md, /^<!-- mabda-pack:/);
    assert.match(md, /## دستور\nفقط از همین بسته کار کن\./);
    assert.ok(md.includes('واقعیت-یک') && !md.includes('واقعیت-دو'), 'a pack for section 1 holds section 1');
    assert.ok(!md.includes('قید-دو'), 'a rule of section 2 (position) does not reach section 1');
    const facts = md.slice(md.indexOf('## واقعیت‌های تأییدشده'), md.indexOf('## فرض‌های فعال'));
    assert.ok(!facts.includes('فرض-یک') && !facts.includes('پیشنهاد-معلق'), 'only Confirmed is fact');
    assert.match(md, /## فرض‌های فعال، تأییدنشده[\s\S]*فرض-یک/);
    assert.ok(!md.includes('پیشنهاد-معلق'), 'default statuses: Confirmed only');
    assert.ok(!md.includes(SECRET), 'a sample never gets into a pack');

    // a facet filter, extra statuses, assumptions off, several nodes
    const other = (await t.api('POST', '/workspaces/ws_studio/saved-packs', { name: 'دو بخش و بُعد', selection: { nodeIds: [n1, n2], facets: ['فصل پاییز'], statuses: ['Proposed'], includeAssumptions: false } })).json.pack;
    const md2 = (await t.api('GET', `/workspaces/ws_studio/saved-packs/${other.id}/render`)).json.markdown as string;
    assert.ok(md2.includes('واقعیت-دو') && !md2.includes('واقعیت-یک'), 'facet filter');
    assert.ok(md2.includes('قید-دو'), 'the section rule applies at its own section (guardrails are not facet-filtered)');
    assert.ok(!md2.includes('فرض-یک') && !md2.includes(SECRET));
    // edit + delete
    const edited = (await t.api('PUT', `/workspaces/ws_studio/saved-packs/${made.id}`, { name: 'نام تازه', instruction: '', selection: made.selection })).json.pack;
    assert.equal(edited.name, 'نام تازه');
    assert.equal((await t.api('POST', '/workspaces/ws_studio/saved-packs', { name: ' ' })).status, 400);

    // MCP tools
    const c = await t.connect((await t.token()).token);
    const list = await t.call(c, 'list_packs');
    assert.deepEqual(list.data.packs.map((p: any) => p.name).sort(), ['دو بخش و بُعد', 'نام تازه'].sort());
    assert.ok(!JSON.stringify(list).includes(SECRET));
    const got = await t.call(c, 'get_pack', { name: 'دو بخش و بُعد' });
    assert.ok(got.data.markdown.includes('واقعیت-دو') && !got.data.markdown.includes(SECRET));
    assert.equal((await t.call(c, 'get_pack', { packId: 'ghost' })).isError, true);
    // MCP prompts and resources
    const prompts = (await c.listPrompts()).prompts;
    assert.ok(prompts.some((p) => p.title === 'نام تازه'));
    const pr = await c.getPrompt({ name: `pack_${made.id}` });
    assert.ok(JSON.stringify(pr).includes('واقعیت-یک') && !JSON.stringify(pr).includes(SECRET));
    const res = (await c.listResources()).resources;
    assert.ok(res.some((r) => r.uri === `mabda://pack/${made.id}`));
    const rd = await c.readResource({ uri: `mabda://pack/${other.id}` });
    assert.ok(JSON.stringify(rd).includes('واقعیت-دو') && !JSON.stringify(rd).includes(SECRET));
    await c.close();
    await t.api('DELETE', `/workspaces/ws_studio/saved-packs/${other.id}`);
    assert.equal(t.repo.listSavedPacks(s).length, 1);
  } finally { t.close(); }
});

test('starters and templates: applying a starter makes grey SAMPLES (twice = no duplicates, no cap used, no Change); removing them leaves nothing; a node template comes back as real nodes + samples; a workstream template needs Pro', async () => {
  const t = await boot();
  try {
    const s = { userId: 'local', workspaceId: 'ws_studio' };
    const before = { objects: t.repo.listObjects(s).length, active: t.repo.countActiveObjects(s), changes: t.repo.listChanges(s).length };
    const r1 = (await t.api('POST', '/workspaces/ws_studio/starters/services/apply', {})).json;
    assert.ok(r1.added >= 6 && r1.samples.length === r1.added);
    assert.ok(r1.samples.every((o: any) => o.sample === true && o.content.startsWith('مثال:')));
    assert.equal((await t.api('POST', '/workspaces/ws_studio/starters/services/apply', {})).json.added, 0, 'twice does not duplicate');
    assert.deepEqual([t.repo.listObjects(s).length, t.repo.countActiveObjects(s), t.repo.listChanges(s).length], [before.objects, before.active, before.changes], 'no cap, no knowledge, no Change');
    assert.equal((await t.api('POST', '/workspaces/ws_studio/starters/ghost/apply', {})).status, 404);
    const st = (await t.api('GET', '/workspaces/ws_studio/state')).json;
    assert.ok(st.samples.length === r1.added && !st.objects.some((o: any) => o.sample));
    // editing an example makes it hers (it enters knowledge only then)
    const mine = (await t.api('PATCH', `/workspaces/ws_studio/objects/${r1.samples[0].id}`, { content: 'متن واقعی خودم' })).json.object;
    assert.equal(mine.sample, undefined);
    assert.equal(t.repo.listObjects(s).length, before.objects + 1);
    const removed = (await t.api('POST', '/workspaces/ws_studio/samples/delete', {})).json;
    assert.equal(removed.removed, r1.added - 1);
    assert.equal(removed.samples.length, 0);

    // a node template: save → list → apply (real nodes, samples)
    const n = (await t.api('POST', '/workspaces/ws_studio/nodes', { parentId: 'offer', label: 'کارگاه' })).json.node.id;
    const k = (await t.api('POST', '/workspaces/ws_studio/nodes', { parentId: n, label: 'جلسه‌ها' })).json.node.id;
    await t.api('POST', '/workspaces/ws_studio/objects', { type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'قیمت کارگاه', content: 'نود هزار', nodeId: n });
    await t.api('POST', '/workspaces/ws_studio/objects', { type: 'Fact', status: 'Proposed', provenance: 'User Input', title: 'فقط پیشنهاد', content: 'x', nodeId: k });
    const tid = (await t.api('POST', '/workspaces/ws_studio/templates', { kind: 'node', sourceId: n, name: 'قالب کارگاه' })).json.id;
    assert.ok((await t.api('GET', '/templates')).json.templates.some((x: any) => x.id === tid && x.name === 'قالب کارگاه'));
    const ap = (await t.api('POST', `/workspaces/ws_studio/templates/${tid}/apply`, { parentId: 'brand' })).json;
    assert.equal(ap.added, 1, 'only the Confirmed decision became an example');
    const nn = ap.nodes.find((x: any) => x.id === ap.rootId);
    assert.deepEqual([nn.label, nn.parentId], ['کارگاه', 'brand']);
    assert.ok(ap.nodes.some((x: any) => x.parentId === ap.rootId && x.label === 'جلسه‌ها'));
    assert.ok(ap.samples.every((o: any) => o.sample && o.nodeId === ap.rootId));
    assert.ok(ap.samples.every((o: any) => !t.repo.listObjects(s).some((x) => x.id === o.id)), 'the example copies of a template are not in any list an AI path reads');
    // a workstream template: only the user's own spec; applying needs Pro (this workspace has it)
    assert.equal((await t.api('POST', '/workspaces/ws_studio/templates', { kind: 'workstream', sourceId: 'main_positioning' })).status, 404, 'a library workstream is not «hers»');
    await t.api('DELETE', `/templates/${tid}`);
    assert.equal((await t.api('GET', '/templates')).json.templates.length, 0);
  } finally { t.close(); }
});
