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
  const connect = async () => {
    const tok = (await api('POST', '/workspaces/ws_studio/mcp/tokens', { label: 'Claude' })).json.token;
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tok}` } } }));
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => { const r = await client.callTool({ name, arguments: args }); return { isError: Boolean(r.isError), data: (r.structuredContent ?? {}) as any, text: String((r.content as Array<{ text?: string }>)[0]?.text ?? '') }; };
  return { api, connect, call, repo: repo as Repo, close: () => server.close() };
}

test('the user deletes the old root and the «offer» node, builds her own: every door still works and nothing is lost', async () => {
  const t = await boot();
  try {
    const W = '/workspaces/ws_studio';
    const s = { userId: 'local', workspaceId: 'ws_studio' };
    const before = t.repo.listObjects(s).length;
    // knowledge in the nodes that will go (a note and an object each)
    await t.api('POST', `${W}/objects`, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'در آفر', content: 'متن آفر', nodeId: 'offer' });
    await t.api('POST', `${W}/canvas/free/notes`, { content: 'یادداشت ریشه', nodeId: 'business', x: 1, y: 1 });
    // a new root, then delete «business» (the old root): its knowledge, notes and children move to the new root; «offer» goes to its parent
    const root = (await t.api('POST', `${W}/nodes`, { label: 'خدمات' })).json.node;
    assert.equal(root.parentId, undefined, 'a node with no parent is a new root');
    assert.equal((await t.api('DELETE', `${W}/nodes/offer`)).status, 400, 'a node with content asks where it goes');
    assert.equal((await t.api('DELETE', `${W}/nodes/offer?transferTo=product`)).status, 200);
    const del = await t.api('DELETE', `${W}/nodes/business?transferTo=${root.id}`);
    assert.equal(del.status, 200);
    const pkg = (await t.api('POST', `${W}/nodes`, { parentId: root.id, label: 'بسته‌های خدمت' })).json.node;

    const st = (await t.api('GET', `${W}/state`)).json;
    const ids = new Set(st.nodes.map((n: any) => n.id));
    assert.ok(!ids.has('business') && !ids.has('offer'));
    assert.ok(st.objects.every((o: any) => ids.has(o.nodeId)), 'no knowledge points at a node that is gone');
    assert.ok(st.notes.every((n: any) => ids.has(n.nodeId)), 'no note either');
    assert.equal(st.objects.length, before + 1, 'nothing was lost or archived');
    assert.ok(st.objects.find((o: any) => o.title === 'در آفر').nodeId === 'product', 'the content went where the user was asked to send it');

    // the deletion is on record, with the reason, for the node and for every piece of knowledge that moved
    const feed = t.repo.listChanges(s, { includeNodes: true }) as any[];
    assert.ok(feed.some((c) => c.objectId === 'node:business' && c.kind === 'node_deleted' && /حذف شد/.test(c.reason ?? '')), 'the node deletion has a Change');
    assert.ok(feed.some((c) => c.kind === 'edited' && /حذف شد؛ این دانش به/.test(c.reason ?? '')), 'moved knowledge has a Change with the reason');

    // «no node» = the default place (the first root), whatever it is called — also for the AI paths
    const o = (await t.api('POST', `${W}/objects`, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'بی‌گره', content: 'x' })).json.object;
    assert.equal(o.nodeId, root.id);
    const n2 = (await t.api('POST', `${W}/canvas/free/notes`, { content: 'بی‌گره', x: 0, y: 0 })).json.note;
    assert.equal(n2.nodeId, root.id);

    const c = await t.connect();
    const ov = await t.call(c, 'get_workspace_overview', {});
    assert.ok(!ov.isError && ov.data.tree.every((n: any) => !('isSystem' in n)) && ov.data.tree.some((n: any) => n.id === root.id));
    const prop = await t.call(c, 'propose_context_updates', { updates: [{ type: 'Fact', title: 'از Claude', content: 'یک پیشنهاد', nodeId: 'business' }] });
    assert.equal(prop.isError, false);
    assert.equal(t.repo.listObjects(s).find((x) => x.title === 'از Claude')!.nodeId, root.id, 'a hint to a node that is gone goes to the default place');
    assert.equal((await t.call(c, 'get_context', {})).isError, false);
    for (const spec of ['main_positioning']) { assert.equal((await t.call(c, 'get_gaps', { specId: spec })).isError, false); assert.equal((await t.call(c, 'get_readiness', { specId: spec })).isError, false); }
    const rq = await c.getPrompt({ name: 'request_question', arguments: { request: 'یک سؤال' } });
    assert.match(String((rq.messages[0].content as { text: string }).text), /<documents/);
    await c.close();
    assert.equal((await t.api('POST', `${W}/packs`, {})).status, 200);
    assert.equal((await t.api('POST', `${W}/ai-requests`, { kind: 'audit', request: 'ممیزی' })).status, 200);

    // the answer to a Gap goes where the spec hints; when that node is gone it is the default place (client side: resolveNodeId); the starter «services» brings its own node and finds it again
    assert.equal((await t.api('POST', `${W}/starters/services/apply`, {})).status, 200);
    assert.equal(t.repo.listNodes(s).filter((x) => x.id === pkg.id).length, 1);
    // the last root cannot be deleted
    for (const r of t.repo.listNodes(s).filter((x) => !x.parentId && x.id !== root.id)) await t.api('DELETE', `${W}/nodes/${r.id}?transferTo=${root.id}`);
    assert.equal((await t.api('DELETE', `${W}/nodes/${root.id}?transferTo=${pkg.id}`)).status, 400, 'the only root is never deleted');
  } finally { t.close(); }
});
