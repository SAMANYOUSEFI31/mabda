import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { resolveAccessGate } from './access.ts';

async function serve(env: NodeJS.ProcessEnv) {
  const { gate } = resolveAccessGate(env);
  const app = express();
  if (gate) app.use(gate);
  app.get('/api/x', (_q, r) => { r.json({ secret: 1 }); });
  const s = app.listen(0);
  return { s, base: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
}
const basic = (p: string) => 'Basic ' + Buffer.from('me:' + p).toString('base64');

test('access gate: no password -> 401, wrong -> 401, right -> 200, /healthz open', async () => {
  const { s, base } = await serve({ MABDA_ACCESS_PASSWORD: 'correct-horse-battery' });
  try {
    assert.equal((await fetch(base + '/api/x')).status, 401);
    assert.equal((await fetch(base + '/api/x', { headers: { authorization: basic('wrong-password-123') } })).status, 401);
    assert.equal((await fetch(base + '/api/x', { headers: { authorization: basic('correct-horse-battery') } })).status, 200);
    const h = await fetch(base + '/healthz');
    assert.equal(h.status, 200);
    assert.equal(await h.text(), 'ok');
  } finally { s.close(); }
});

test('production without password refuses to start unless explicitly opened', () => {
  assert.ok(resolveAccessGate({ NODE_ENV: 'production' }).fatal);
  assert.ok(resolveAccessGate({ MABDA_ACCESS_PASSWORD: 'short' }).fatal);
  assert.equal(resolveAccessGate({ NODE_ENV: 'production', MABDA_ALLOW_OPEN: '1' }).fatal, undefined);
  assert.equal(resolveAccessGate({}).gate, undefined);
});
