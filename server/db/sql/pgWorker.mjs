// The Postgres side of the synchronous bridge (postgres.ts). Runs in a worker thread: it owns one `pg` connection, takes one
// request at a time from the main thread, answers on a private port and wakes the waiting main thread through shared memory.
// Plain JavaScript on purpose: a worker does not inherit the TypeScript loader.
import { workerData, parentPort } from 'node:worker_threads';
import pg from 'pg';

const { flag, port, url } = workerData;
const signal = new Int32Array(flag);

// numbers come back as numbers, as SQLite gave them: BIGINT (int8), COUNT(*) and SUM (numeric)
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

// one connection; when it drops (database restarted, network blip) the next request opens a new one, in the same schema
let client, connected, schema;
// a connection lost inside BEGIN … COMMIT must not let the rest of the transaction run on a new connection (half a write
// would be committed): every statement fails until the caller's ROLLBACK arrives
let inTx = false, broken = false;
const lost = () => { if (inTx) broken = true; client = undefined; connected = undefined; };
async function ready() {
  if (!client) {
    client = new pg.Client(configFor(url));
    client.on('error', lost);
    client.on('end', lost);
    connected = client.connect().then(() => (schema ? client.query(`SET search_path TO ${schema}`) : undefined));
    connected.catch(() => { client = undefined; connected = undefined; });
  }
  await connected;
  return client;
}

function configFor(u) {
  let parsed;
  try { parsed = new URL(u); } catch { return { connectionString: u }; }
  const mode = parsed.searchParams.get('sslmode');
  if (!mode || mode === 'disable') return { connectionString: u };
  // the mode is applied here, not left to the driver's reading of the link: a managed database usually presents a certificate
  // the container does not know. `require` = encrypted; `verify-ca` / `verify-full` = encrypted and the certificate checked.
  parsed.searchParams.delete('sslmode');
  return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: mode === 'verify-full' || mode === 'verify-ca' } };
}

function answer(msg) {
  port.postMessage(msg);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}

parentPort.on('message', async (req) => {
  try {
    if (req.op === 'end') { await client?.end().catch(() => {}); return answer({ ok: true }); }
    const verb = typeof req.sql === 'string' ? req.sql.trim().split(/\s+/)[0].toUpperCase() : '';
    if (broken) {
      if (verb === 'ROLLBACK' && !/TO\s+SAVEPOINT/i.test(req.sql)) { broken = false; inTx = false; return answer({ ok: true, rows: [], changes: 0 }); }
      return answer({ ok: false, message: 'the connection to Postgres was lost inside a transaction; nothing of it was saved', code: 'MABDA_LOST' });
    }
    const c = await ready();
    if (req.op === 'connect') return answer({ ok: true });
    if (req.op === 'schema') {
      const name = `"${String(req.schema).replace(/"/g, '')}"`;
      if (req.create) await c.query(`CREATE SCHEMA IF NOT EXISTS ${name}`);
      await c.query(`SET search_path TO ${name}`);
      schema = name;
      return answer({ ok: true });
    }
    const res = req.params ? await c.query({ text: req.sql, values: req.params }) : await c.query(req.sql);
    if (verb === 'BEGIN') inTx = true;
    else if (verb === 'COMMIT' || (verb === 'ROLLBACK' && !/TO\s+SAVEPOINT/i.test(req.sql))) inTx = false;
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    answer({ ok: true, rows: last?.rows ?? [], changes: last?.rowCount ?? 0 });
  } catch (e) {
    answer({ ok: false, message: e?.message ?? String(e), code: e?.code });
  }
});
