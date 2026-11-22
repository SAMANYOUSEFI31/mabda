import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.ts';
import { openDatabase } from '../db/database.ts';

const OWNER_CODE = 'owner-code-for-tests-0123456789';

test('client error telemetry records nothing before informed consent', async () => {
  const db = openDatabase(':memory:');
  const { app } = createApp(db, { auth: { mode: 'invite', ownerCode: OWNER_CODE } });
  const server = app.listen(0);
  const origin = `<scrubbed-url-domain>(server.address() as AddressInfo).port}`;
  let ownerCookie = '';
  const call = async (cookie: string, method: string, path: string, body?: unknown) => {
    const response = await fetch(origin + '/api' + path, {
      method,
      headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, json: await response.json().catch(() => ({})) as any, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie };
  };
  try {
    const ownerJoin = await call('', 'POST', '/join', { code: OWNER_CODE });
    ownerCookie = ownerJoin.cookie;
    const made = await call(ownerCookie, 'POST', '/owner/people', { name: 'A' });
    const code = made.json.link.split('#join=')[1];
    const testerJoin = await call('', 'POST', '/join', { code });
    let testerCookie = testerJoin.cookie;
    assert.equal(testerJoin.json.user.consented, false);

    const before = (db.prepare('SELECT COUNT(*) AS n FROM client_errors').get() as { n: number }).n;
    const ignored = await call(testerCookie, 'POST', '/client-errors', { name: 'Error', message: 'before consent' });
    assert.equal(ignored.response.status, 200);
    assert.equal(ignored.json.recorded, false);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM client_errors').get() as { n: number }).n, before);

    const accepted = await call(testerCookie, 'POST', '/consent', {});
    testerCookie = accepted.cookie;
    const recorded = await call(testerCookie, 'POST', '/client-errors', { name: 'Error', message: 'after consent' });
    assert.equal(recorded.json.recorded, true);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM client_errors').get() as { n: number }).n, before + 1);
  } finally {
    server.close();
  }
});
