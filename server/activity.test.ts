import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { openDatabase } from './db/database.ts';

const OWNER_CODE = 'owner-code-for-tests-0123456789';
const SECRET = 'رازِ خیلی شخصی من';

async function boot() {
  const db = openDatabase(':memory:');
  const { app } = createApp(db, { auth: { mode: 'invite', ownerCode: OWNER_CODE } });
  const server = app.listen(0);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser = () => {
    let cookie = '';
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const r = await fetch(origin + '/api' + path, { method, headers: { 'content-type': 'application/json', origin, 'x-mabda-session': 'v_testvisit0001', ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = r.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await r.text();
      let json: any = {}; try { json = JSON.parse(text); } catch { /* csv */ }
      return { status: r.status, json, text, type: r.headers.get('content-type') ?? '' };
    };
    return { call, join: (code: string) => call('POST', '/join', { code }) };
  };
  return { db, browser, close: () => server.close() };
}

test('the test record: actions and screens are logged without text, only after consent; the owner reads measures and exports; erase removes it', async () => {
  const t = await boot();
  try {
    const owner = t.browser(); await owner.join(OWNER_CODE);
    const a = t.browser();
    await a.join((await owner.call('POST', '/owner/people', { name: 'نفر الف' })).json.link.split('#join=')[1]);

    // before the notice is accepted nothing is kept
    assert.equal((await a.call('POST', '/activity', { events: [{ name: 'session_start' }] })).json.recorded, 0);
    assert.equal(Number((t.db.prepare("SELECT COUNT(*) AS n FROM activity_events WHERE user_id <> 'owner'").get() as { n: number }).n), 0);
    await a.call('POST', '/consent', {});

    const ws = (await a.call('POST', '/bootstrap', {})).json.workspaces;
    const own = ws.find((w: any) => !w.isDemo) ?? ws[0];
    const st = (await a.call('GET', `/workspaces/${own.id}/state`)).json;
    const nodeId = st.nodes[0].id;
    assert.equal((await a.call('POST', `/workspaces/${own.id}/notes`, { nodeId, content: `${SECRET}\nآیا این درست است؟` })).status, 200);
    const made = await a.call('POST', `/workspaces/${own.id}/objects`, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: SECRET, content: SECRET, nodeId });
    assert.equal(made.status, 200);
    // a refusal is recorded too (status 4xx)
    assert.equal((await a.call('POST', `/workspaces/${own.id}/objects`, { type: 'Fact', title: '', content: '', nodeId })).status, 400);
    // screens from the browser; an unknown name and free text in props are dropped
    const r = await a.call('POST', '/activity', { events: [
      { name: 'view', space: own.id, props: { tab: 'home', section: false } },
      { name: 'dialog_open', props: { title: `ویرایش «${SECRET}»` } },
      { name: 'dialog_close', props: { title: `ویرایش «${SECRET}»`, note: SECRET }, ms: 4000 },
      { name: 'keylogger', props: { text: SECRET } },
    ] });
    assert.equal(r.json.recorded, 3);

    const rows = t.db.prepare("SELECT * FROM activity_events WHERE user_id <> 'owner' ORDER BY created_at, id").all() as Array<Record<string, unknown>>;
    assert.ok(!JSON.stringify(rows).includes('راز'), 'no text the person wrote is stored');
    const names = rows.map((x) => x.name);
    assert.ok(names.includes('POST /consent'));
    assert.ok(names.includes('POST /workspaces/:wid/notes'));
    assert.ok(names.includes('POST /workspaces/:wid/objects'));
    assert.ok(!names.some((n) => String(n).includes(own.id)), 'the template, never the ids in the path');
    const obj = rows.find((x) => x.name === 'POST /workspaces/:wid/objects' && x.status === 200)!;
    assert.equal(obj.space_id, own.id);
    assert.equal(obj.session_id, 'v_testvisit0001');
    const props = JSON.parse(obj.props as string);
    assert.equal(props.type, 'Fact'); assert.equal(props.status, 'Confirmed'); assert.equal(props.chars, SECRET.length * 2);
    assert.equal(props.objectId, made.json.object.id);
    assert.ok(rows.some((x) => x.name === 'POST /workspaces/:wid/objects' && x.status === 400));
    assert.ok(rows.some((x) => x.name === 'POST /workspaces/:wid/notes' && JSON.parse(x.props as string).thoughts >= 1));
    const close = rows.find((x) => x.name === 'dialog_close')!;
    assert.equal(JSON.parse(close.props as string).title, 'ویرایش …');

    // a tester has no owner tools
    assert.equal((await a.call('GET', '/owner/activity/kpis')).status, 404);
    assert.equal((await a.call('GET', '/owner/activity/export?format=csv')).status, 404);

    const k = (await owner.call('GET', '/owner/activity/kpis')).json;
    assert.equal(k.summary.people, 1);
    assert.equal(k.summary.activated, 1);
    const pa = k.people.find((p: any) => p.name === 'نفر الف');
    assert.equal(pa.confirms, 1); assert.ok(pa.captures >= 2); assert.equal(pa.refused, 1);
    assert.ok(pa.minutesToFirstConfirm >= 0);
    assert.equal(k.funnel.find((f: any) => f.key === 'confirmed').people, 1);

    const csv = await owner.call('GET', '/owner/activity/export?format=csv');
    assert.match(csv.type, /text\/csv/);
    assert.ok(csv.text.split('\r\n')[0].includes('at,tehran_day,user_id'));
    assert.ok(csv.text.includes('POST /workspaces/:wid/objects'));
    assert.ok(!csv.text.includes('راز'));
    const json = (await owner.call('GET', '/owner/activity/export')).json;
    assert.equal(json.format, 'mabda-activity');
    assert.ok(json.events.length >= rows.length);
    assert.ok(json.kpis.summary);

    // deleting a workspace keeps the record of it; «حذف همهٔ داده‌ها» erases the person's trace
    await a.call('DELETE', `/workspaces/${own.id}`, { confirmName: own.name });
    assert.ok(Number((t.db.prepare('SELECT COUNT(*) AS n FROM activity_events WHERE space_id = ?').get(own.id) as { n: number }).n) > 0);
    await a.call('POST', '/account/delete-all', { confirm: 'حذف همهٔ داده‌ها' });
    const left = t.db.prepare("SELECT name FROM activity_events WHERE user_id <> 'owner'").all() as Array<{ name: string }>;
    assert.deepEqual(left.map((x) => x.name), ['POST /account/delete-all'], 'only the erase itself is recorded after the erase');
  } finally { t.close(); }
});

test('Mabda\'s examples: stored as «Sample», never counted as the person\'s own work; writing over one makes it hers', async () => {
  const t = await boot();
  try {
    const owner = t.browser(); await owner.join(OWNER_CODE);
    const a = t.browser();
    await a.join((await owner.call('POST', '/owner/people', { name: 'ب' })).json.link.split('#join=')[1]);
    await a.call('POST', '/consent', {});
    const ws = (await a.call('POST', '/bootstrap', {})).json.workspaces;
    const life = ws.find((w: any) => w.slug === 'my-life');
    const st = (await a.call('GET', `/workspaces/${life.id}/state`)).json;
    assert.ok(st.objects.length > 0 && st.objects.every((o: any) => o.provenance === 'Sample'), 'every pre-written item says it is an example');
    const proposed = st.objects.find((o: any) => o.status === 'Proposed' && !o.sample);
    assert.ok(proposed);
    // confirming a ready-made suggestion: recorded, but not activation
    assert.equal((await a.call('PATCH', `/workspaces/${life.id}/objects/${proposed.id}`, { status: 'Confirmed' })).json.object.provenance, 'Sample');
    let k = (await owner.call('GET', '/owner/activity/kpis')).json;
    let p = k.people.find((x: any) => x.name === 'ب');
    assert.equal(p.confirms, 0); assert.equal(p.activated, false);
    // a client cannot claim «Sample» for its own writing
    const mine = await a.call('POST', `/workspaces/${life.id}/objects`, { type: 'Fact', status: 'Confirmed', provenance: 'Sample', title: 'مال خودم', content: 'نوشتهٔ خودم', nodeId: proposed.nodeId });
    assert.equal(mine.json.object.provenance, 'User Input');
    // writing over an example's text makes it hers
    assert.equal((await a.call('PATCH', `/workspaces/${life.id}/objects/${proposed.id}`, { content: 'متن خودم' })).json.object.provenance, 'User Input');
    k = (await owner.call('GET', '/owner/activity/kpis')).json;
    p = k.people.find((x: any) => x.name === 'ب');
    assert.equal(p.confirms, 1, 'only her own confirmed item'); assert.equal(p.activated, true);
  } finally { t.close(); }
});
