import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';
import { createApp, proxyHopsFrom } from '../app.ts';
import { migrate } from '../db/migrations.ts';
import { resolveAuthMode } from './http.ts';
import type { AiService } from '../ai/service.ts';
import { OWNER_NOTICE_VERSION } from '../../src/core/ownerNotice.ts';
import { openDatabase } from '../db/database.ts';

const OWNER_CODE = 'owner-code-for-tests-0123456789';

/** a server in the invite mode, and a small browser per person (keeps its own cookie, sends a same-site Origin) */
async function boot(service?: AiService) {
  const db = openDatabase(':memory:');
  const { app, accounts, repo } = createApp(db, { auth: { mode: 'invite', ownerCode: OWNER_CODE }, ...(service ? { service } : {}) });
  const server = app.listen(0);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser = () => {
    let cookie = '';
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const r = await fetch(origin + '/api' + path, { method, headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = r.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      return { status: r.status, json: await r.json().catch(() => ({})) as any, setCookie: set };
    };
    return { call, join: (code: string) => call('POST', '/join', { code }) };
  };
  return { db, accounts, repo, origin, browser, close: () => server.close() };
}

test('invite mode: nothing without a sign-in; a wrong link does nothing; the owner and each tester sign in with their own link', async () => {
  const t = await boot();
  try {
    const anon = t.browser();
    assert.equal((await anon.call('GET', '/workspaces')).status, 401);
    assert.equal((await anon.call('POST', '/bootstrap', {})).status, 401);
    assert.equal((await anon.call('GET', '/session')).json.user, null);
    assert.equal((await anon.join('not-a-real-code-000000')).status, 401);

    const owner = t.browser();
    const j = await owner.join(OWNER_CODE);
    assert.equal(j.status, 200);
    assert.match(j.setCookie!, /HttpOnly/);
    assert.match(j.setCookie!, /SameSite=Lax/);
    assert.equal(j.json.user.role, 'owner');
    const made = await owner.call('POST', '/owner/people', { name: 'نفر اول' });
    assert.equal(made.status, 200);
    assert.match(made.json.link, /\/#join=[A-Za-z0-9_-]{22}$/);
    // the code is shown once and only its hash is stored
    const code = made.json.link.split('#join=')[1];
    assert.ok(!JSON.stringify(t.db.prepare('SELECT * FROM accounts').all()).includes(code));

    const a = t.browser();
    assert.equal((await a.join(code)).json.user.role, 'tester');
    assert.equal((await a.call('GET', '/workspaces')).status, 200);
    // a tester has no owner tools: they do not exist for them
    assert.equal((await a.call('GET', '/owner/people')).status, 404);
    assert.equal((await a.call('POST', '/owner/people', { name: 'x' })).status, 404);
  } finally { t.close(); }
});

test('two testers: each sees only their own data; ids from someone else answer «not found»; a foreign id cannot be taken over', async () => {
  const t = await boot();
  try {
    const owner = t.browser(); await owner.join(OWNER_CODE);
    const a = t.browser(); await a.join((await owner.call('POST', '/owner/people', { name: 'A' })).json.link.split('#join=')[1]);
    const b = t.browser(); await b.join((await owner.call('POST', '/owner/people', { name: 'B' })).json.link.split('#join=')[1]);

    // DB-PG-01: both get the first-run sample and the showcase, each under their own ids
    const wa = (await a.call('POST', '/bootstrap', {})).json.workspaces;
    const wb = (await b.call('POST', '/bootstrap', {})).json.workspaces;
    assert.equal(wa.length, 2); assert.equal(wb.length, 2);
    assert.ok(wa.every((w: any) => !wb.some((x: any) => x.id === w.id)), 'no shared workspace id');
    const da = (await a.call('POST', '/demo/reset', {})).json.workspaceId;
    const db = (await b.call('POST', '/demo/reset', {})).json.workspaceId;
    assert.notEqual(da, db);
    const stA = (await a.call('GET', `/workspaces/${da}/state`)).json;
    const stB = (await b.call('GET', `/workspaces/${db}/state`)).json;
    assert.ok(stA.objects.length > 20);
    assert.equal(stA.objects.length, stB.objects.length, 'the same showcase for both');
    assert.ok(stA.objects.every((o: any) => !stB.objects.some((x: any) => x.id === o.id)));
    // references follow the ids: the showcase outputs point at this person's own knowledge, the boards at this person's notes
    const objIds = new Set(stA.objects.map((o: any) => o.id));
    assert.ok(stA.deliverables.every((d: any) => d.usedContext.every((u: any) => objIds.has(u.id))));
    assert.ok(stA.canvas.free.filter((c: any) => c.itemRef.startsWith('note:')).every((c: any) => stA.notes.some((n: any) => `note:${n.id}` === c.itemRef)));
    // B rebuilding the showcase does not touch A's
    await b.call('POST', '/demo/reset', {});
    assert.equal((await a.call('GET', `/workspaces/${da}/state`)).json.objects.length, stA.objects.length);

    // B cannot read or write A's workspace: it answers exactly like a workspace that does not exist
    assert.equal((await b.call('GET', `/workspaces/${da}/state`)).status, 404);
    assert.equal((await b.call('POST', `/workspaces/${da}/objects`, { type: 'Fact', title: 'x', content: 'y', nodeId: 'business' })).status, 404);
    assert.equal((await b.call('PUT', `/workspaces/${da}`, { ...wa[0], id: da })).status, 403);

    // a row id of A's sent inside B's own workspace (an «INSERT OR REPLACE») is refused and A's row stays as it was
    const aDel = stA.deliverables[0];
    const r = await b.call('PUT', `/workspaces/${db}/deliverables/${aDel.id}`, { ...aDel, workspaceId: db, title: 'taken over' });
    assert.equal(r.status, 403);
    assert.equal((await a.call('GET', `/workspaces/${da}/state`)).json.deliverables.find((d: any) => d.id === aDel.id).title, aDel.title);
    // the same for a ledger line (before: «INSERT OR REPLACE» silently moved A's line to B)
    const aWs = wa[0].id;
    const aLedger = (await a.call('GET', `/workspaces/${aWs}/state`)).json.ledger[0];
    assert.ok(aLedger, 'the first-run sample has ledger lines');
    assert.equal((await b.call('POST', `/workspaces/${wb[0].id}/ledger`, { ...aLedger, workspaceId: wb[0].id })).status, 403);
    assert.ok((await a.call('GET', `/workspaces/${aWs}/state`)).json.ledger.some((l: any) => l.id === aLedger.id));

    // «حذف همهٔ داده‌ها» of B leaves A whole (and B's sign-in too)
    const before = t.db.prepare('SELECT COUNT(*) AS n FROM context_objects WHERE user_id <> ?').get((await b.call('GET', '/session')).json.user.id) as { n: number };
    const wipe = await b.call('POST', '/account/delete-all', { confirm: 'حذف همهٔ داده‌ها' });
    assert.equal(wipe.status, 200);
    assert.deepEqual(wipe.json.workspaces, []);
    assert.equal((t.db.prepare('SELECT COUNT(*) AS n FROM context_objects WHERE user_id <> ?').get((await b.call('GET', '/session')).json.user.id) as { n: number }).n, before.n);
    assert.equal((await a.call('GET', `/workspaces/${da}/state`)).json.objects.length, stA.objects.length);
    assert.equal((await b.call('GET', '/workspaces')).status, 200, 'B is still signed in');
  } finally { t.close(); }
});

test('CSRF: a change from another site is refused; the owner can replace a link or turn a person off', async () => {
  const t = await boot();
  try {
    const owner = t.browser(); await owner.join(OWNER_CODE);
    const made = (await owner.call('POST', '/owner/people', { name: 'A' })).json;
    const a = t.browser(); await a.join(made.link.split('#join=')[1]);
    assert.equal((await a.call('POST', '/bootstrap', {}, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await a.call('POST', '/bootstrap', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await a.call('POST', '/bootstrap', {})).status, 200);

    // a new link: the old one stops working and every device of that person is signed out
    const fresh = (await owner.call('POST', `/owner/people/${made.person.id}/link`)).json.link;
    assert.equal((await a.call('GET', '/workspaces')).status, 401);
    assert.equal((await t.browser().join(made.link.split('#join=')[1])).status, 401);
    const a2 = t.browser();
    assert.equal((await a2.join(fresh.split('#join=')[1])).status, 200);
    assert.equal((await a2.call('GET', '/workspaces')).json.workspaces.length, 2, 'the same person, the same data');

    // off: signed out at once, the link refused; on again: the same data
    await owner.call('POST', `/owner/people/${made.person.id}/disabled`, { disabled: true });
    assert.equal((await a2.call('GET', '/workspaces')).status, 401);
    assert.equal((await t.browser().join(fresh.split('#join=')[1])).status, 401);
    await owner.call('POST', `/owner/people/${made.person.id}/disabled`, { disabled: false });
    const a3 = t.browser(); await a3.join(fresh.split('#join=')[1]);
    assert.equal((await a3.call('GET', '/workspaces')).json.workspaces.length, 2);

    // logout ends this device's sign-in
    await a3.call('POST', '/logout', {});
    assert.equal((await a3.call('GET', '/workspaces')).status, 401);
  } finally { t.close(); }
});

test('generative AI is closed in the invite mode (only its status answers); security headers are on every response', async () => {
  const t = await boot();
  try {
    const owner = t.browser(); await owner.join(OWNER_CODE);
    assert.equal((await owner.call('POST', '/ai/chat', { message: 'x' })).status, 503);
    assert.equal((await owner.call('GET', '/ai/status')).status, 200);
    const r = await fetch(t.origin + '/healthz');
    assert.equal(await r.text(), 'ok');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  } finally { t.close(); }
});

test('auth mode from the environment: production never starts open', () => {
  assert.ok('fatal' in resolveAuthMode({ NODE_ENV: 'production' }));
  assert.ok('fatal' in resolveAuthMode({ MABDA_OWNER_CODE: 'short' }));
  assert.deepEqual(resolveAuthMode({ NODE_ENV: 'production', MABDA_OWNER_CODE: OWNER_CODE }), { mode: 'invite', ownerCode: OWNER_CODE });
  assert.deepEqual(resolveAuthMode({}), { mode: 'local' });
});

test('audit follow-ups: HSTS on HTTPS, a new owner key signs out older owner devices, the frozen AI cannot run with several people', async () => {
  // HSTS only when the request came over HTTPS (the host's proxy says so with one hop)
  const t = await boot();
  try {
    const plain = await fetch(t.origin + '/healthz');
    assert.equal(plain.headers.get('strict-transport-security'), null, 'a laptop on http stays usable');
    const tls = await fetch(t.origin + '/healthz', { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(tls.headers.get('strict-transport-security') ?? '', /max-age=\d+/);

    // owner signed in with the old key; the server restarts with a new key → the old device is out
    const owner = t.browser();
    await owner.join(OWNER_CODE);
    assert.equal((await owner.call('GET', '/owner/people')).status, 200);
    createApp(t.db, { auth: { mode: 'invite', ownerCode: 'a-brand-new-owner-key-0123456789' } });
    assert.equal((await owner.call('GET', '/owner/people')).status, 401, 'before: the old owner session lived on for 60 days');
    // the same key again changes nothing
    const again = t.browser();
    createApp(t.db, { auth: { mode: 'invite', ownerCode: OWNER_CODE } });
    await again.join(OWNER_CODE);
    createApp(t.db, { auth: { mode: 'invite', ownerCode: OWNER_CODE } });
    assert.equal((await again.call('GET', '/owner/people')).status, 200);
  } finally { t.close(); }
  assert.ok('fatal' in resolveAuthMode({ MABDA_OWNER_CODE: OWNER_CODE, MABDA_MANAGED_AI: 'true' }));
  assert.deepEqual(resolveAuthMode({ MABDA_OWNER_CODE: OWNER_CODE, MABDA_MANAGED_AI: 'false' }), { mode: 'invite', ownerCode: OWNER_CODE });
});

test('informed consent is kept on the server for the person: a second device does not ask again, the owner sees who accepted', async () => {
  const t = await boot();
  try {
    const owner = t.browser();
    assert.equal((await owner.join(OWNER_CODE)).json.user.consented, true, 'the owner is never asked');
    const code = (await owner.call('POST', '/owner/people', { name: 'A' })).json.link.split('#join=')[1];
    const phone = t.browser();
    assert.equal((await phone.join(code)).json.user.consented, false);
    assert.equal((await phone.call('GET', '/session')).json.user.consented, false);
    assert.equal((await t.browser().call('POST', '/consent', {})).status, 401, 'no one signed in, nothing to accept');
    assert.equal((await phone.call('POST', '/consent', {})).json.user.consented, true);
    const first = (await owner.call('GET', '/owner/people')).json.people.find((p: { name: string }) => p.name === 'A').consentedAt;
    assert.ok(first, 'before: consent lived only in one browser, so the owner could not see it');
    // a laptop with the same link: already accepted (before: asked again on every device)
    const laptop = t.browser();
    assert.equal((await laptop.join(code)).json.user.consented, true);
    await laptop.call('POST', '/consent', {});
    assert.equal((await owner.call('GET', '/owner/people')).json.people.find((p: { name: string }) => p.name === 'A').consentedAt, first, 'the first date stays');
    // the notice text changes (a new version): what was accepted before no longer covers it, so the person is asked again
    t.db.prepare('UPDATE accounts SET consent_version = ? WHERE name = ?').run(OWNER_NOTICE_VERSION - 1, 'A');
    assert.equal((await laptop.call('GET', '/session')).json.user.consented, false, 'before: one «فهمیدم» covered every later text');
    assert.equal((await laptop.call('POST', '/consent', {})).json.user.consented, true);
    assert.equal((await owner.call('GET', '/owner/people')).json.people.find((p: { name: string }) => p.name === 'A').consentVersion, OWNER_NOTICE_VERSION);
  } finally { t.close(); }
});

test('the AI context is read for the person asking, never for one fixed person (focused thread on a section)', async () => {
  const seen: string[][] = [];
  const fake = { threadTurn: async (_u: string, r: { contextList: Array<{ title: string }> }) => {
    seen.push(r.contextList.map((c) => c.title));
    return { blocks: [], markdown: '', usage: { stages: [], totals: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, thinkingTokens: 0, costUsd: 0 } } };
  } } as unknown as AiService;
  const t = await boot(fake);
  try {
    const owner = t.browser(); await owner.join(OWNER_CODE);
    const b = t.browser(); await b.join((await owner.call('POST', '/owner/people', { name: 'B' })).json.link.split('#join=')[1]);
    const ws = (await b.call('POST', '/bootstrap', {})).json.workspaces[0];
    const userId = (await b.call('GET', '/session')).json.user.id;
    const s = { userId, workspaceId: ws.id };
    const node = t.repo.listNodes(s)[0];
    t.repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'دانش خود B', content: 'فقط مال B', nodeId: node.id });
    const r = await b.call('POST', `/workspaces/${ws.id}/threads/${node.id}/turn`, { message: 'سلام' });
    // before: the context source read the fixed local person, so B's workspace was «not found» (or another person's was read)
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(seen[0].includes('دانش خود B'));
  } finally { t.close(); }
});

test('sign-in limit behind more than one proxy: with the right hop count two visitors are two addresses', async () => {
  const run = async (proxyHops: number) => {
    const db = openDatabase(':memory:');
    const { app } = createApp(db, { auth: { mode: 'invite', ownerCode: OWNER_CODE }, proxyHops });
    const server = app.listen(0);
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // a CDN (9.9.9.9) in front of the host's proxy: the CDN adds the visitor, the host's proxy adds the CDN
    const join = (visitor: string) => fetch(origin + '/api/join', { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': `${visitor}, 9.9.9.9` }, body: JSON.stringify({ code: 'wrong-code-000000000000' }) });
    try {
      for (let i = 0; i < 10; i++) await join('1.1.1.1');
      return (await join('2.2.2.2')).status;
    } finally { server.close(); }
  };
  assert.equal(await run(1), 429, 'one hop: everyone looks like the CDN, so one person\'s ten wrong tries lock out the next person');
  assert.equal(await run(2), 401, 'two hops: the next person is someone else and only gets «this link does not work»');
  assert.equal(proxyHopsFrom(undefined), 1); assert.equal(proxyHopsFrom('2'), 2); assert.equal(proxyHopsFrom('0'), 1); assert.equal(proxyHopsFrom('x'), 1);
});
