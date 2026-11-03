import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../app.ts';
import { migrate } from '../db/migrations.ts';
import { versionHistory } from '../../src/core/versionHistory.ts';

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
  const connect = async () => {
    const tok = (await api('POST', '/workspaces/ws_studio/mcp/tokens', { label: 'Claude' })).json.token;
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tok}` } } }));
    return client;
  };
  return { api, connect, repo, close: () => server.close() };
}

const everywhere = async (t: Awaited<ReturnType<typeof boot>>) => {
  const W = '/workspaces/ws_studio';
  const c = await t.connect();
  const parts: string[] = [];
  const tool = async (name: string, args: Record<string, unknown> = {}) => { const r = await c.callTool({ name, arguments: args }); parts.push(JSON.stringify(r.structuredContent ?? {}), String((r.content as Array<{ text?: string }>)[0]?.text ?? '')); };
  await tool('get_context', {}); await tool('get_context', { nodeId: 'business' }); await tool('get_workspace_overview', {}); await tool('get_gaps', { specId: 'main_positioning' });
  for (const kind of ['question', 'audit', 'draft']) parts.push(JSON.stringify(await c.getPrompt({ name: `request_${kind}`, arguments: { request: 'قیمت چقدر است؟' } })));
  await c.close();
  for (const kind of ['question', 'audit', 'decision', 'free']) parts.push(JSON.stringify((await t.api('POST', `${W}/ai-requests`, { kind, request: 'قیمت' })).json));
  parts.push(JSON.stringify((await t.api('POST', `${W}/packs`, {})).json));
  return parts.join('\n');
};

test('a draft over CONFIRMED knowledge never reaches any consumer: AI request, pack, MCP — they read the approved text; approving replaces it (a milestone), rejecting drops it', async () => {
  const t = await boot();
  try {
    const W = '/workspaces/ws_studio';
    const s = { userId: 'local', workspaceId: 'ws_studio' };
    const o = (await t.api('POST', `${W}/objects`, { type: 'Decision', status: 'Confirmed', provenance: 'User Input', title: 'قیمت-یکتا', content: 'قیمت ۴۲۰-یکتا هزار تومان', nodeId: 'business', reach: 'global' })).json.object;
    assert.match(await everywhere(t), /۴۲۰-یکتا/, 'the approved text is what every consumer reads');

    // an edit kept as a DRAFT
    const r = await t.api('PATCH', `${W}/objects/${o.id}`, { content: 'قیمت ۵۵۰-پیش‌نویس هزار تومان', title: 'قیمت-یکتا', asDraft: true, reason: 'دانه گران شد' });
    assert.equal(r.status, 200);
    assert.equal(r.json.object.content, 'قیمت ۴۲۰-یکتا هزار تومان', 'the approved text is untouched');
    assert.equal(r.json.object.draft.content, 'قیمت ۵۵۰-پیش‌نویس هزار تومان');
    assert.equal(r.json.object.version, o.version, 'no new version: nothing was approved');
    const seen = await everywhere(t);
    assert.ok(seen.includes('۴۲۰-یکتا') && !seen.includes('۵۵۰-پیش‌نویس'), 'the draft text reaches no AI request, no pack, no MCP tool');
    assert.equal(t.repo.listObjects(s).find((x) => x.id === o.id)!.content, 'قیمت ۴۲۰-یکتا هزار تومان');
    assert.deepEqual(versionHistory(t.repo.listChanges(s, { objectId: o.id })).entries.filter((e) => e.type === 'milestone' && e.how === 'edited').length, 0, 'no milestone yet');

    // a second edit replaces the draft (one draft per object); editing it back to the approved text clears it
    await t.api('PATCH', `${W}/objects/${o.id}`, { content: 'قیمت ۵۶۰-پیش‌نویس هزار تومان', asDraft: true });
    assert.equal(t.repo.listObjects(s).find((x) => x.id === o.id)!.draft!.content, 'قیمت ۵۶۰-پیش‌نویس هزار تومان');
    await t.api('PATCH', `${W}/objects/${o.id}`, { content: 'قیمت ۴۲۰-یکتا هزار تومان', asDraft: true });
    assert.equal(t.repo.listObjects(s).find((x) => x.id === o.id)!.draft, undefined);

    // approve: it REPLACES the text, version + 1, a confirmed-edit milestone with the reason; now every consumer reads it
    await t.api('PATCH', `${W}/objects/${o.id}`, { content: 'قیمت ۵۵۰-پیش‌نویس هزار تومان', asDraft: true, reason: 'دانه گران شد' });
    const ok = await t.api('POST', `${W}/objects/${o.id}/draft/approve`, {});
    assert.equal(ok.status, 200);
    assert.equal(ok.json.object.content, 'قیمت ۵۵۰-پیش‌نویس هزار تومان');
    assert.equal(ok.json.object.version, o.version + 1);
    assert.equal(ok.json.object.draft, undefined);
    const ms = versionHistory(t.repo.listChanges(s, { objectId: o.id })).entries.filter((e) => e.type === 'milestone' && e.how === 'edited');
    assert.equal(ms.length, 1);
    assert.equal((ms[0] as { reason?: string }).reason, 'دانه گران شد');
    assert.match(await everywhere(t), /۵۵۰-پیش‌نویس/);

    // reject: thrown away, the approved text never moved
    await t.api('PATCH', `${W}/objects/${o.id}`, { content: 'قیمت ۹۹۹-رد‌شده', asDraft: true });
    assert.equal((await t.api('DELETE', `${W}/objects/${o.id}/draft`)).status, 200);
    const after = t.repo.listObjects(s).find((x) => x.id === o.id)!;
    assert.deepEqual([after.content, after.draft, after.version], ['قیمت ۵۵۰-پیش‌نویس هزار تومان', undefined, o.version + 1]);
    assert.ok(!(await everywhere(t)).includes('۹۹۹-رد'));

    // «همین حالا جایگزین کن» (no draft) is still one step — the user chooses
    await t.api('PATCH', `${W}/objects/${o.id}`, { content: 'غلط‌املایی-اصلاح‌شد' });
    assert.equal(t.repo.listObjects(s).find((x) => x.id === o.id)!.content, 'غلط‌املایی-اصلاح‌شد');
    // a draft needs Confirmed knowledge: a Proposed one is edited in place (it is not truth yet)
    const p = (await t.api('POST', `${W}/objects`, { type: 'Fact', status: 'Proposed', provenance: 'User Input', title: 'پیشنهاد', content: 'قبل', nodeId: 'business' })).json.object;
    const pr = await t.api('PATCH', `${W}/objects/${p.id}`, { content: 'بعد', asDraft: true });
    assert.deepEqual([pr.json.object.content, pr.json.object.draft], ['بعد', undefined]);
  } finally { t.close(); }
});
