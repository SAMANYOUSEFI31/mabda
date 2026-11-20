/**
 * The two adapters behave as one. The SQLite half always runs; the Postgres half runs when MABDA_TEST_DATABASE_URL names a
 * Postgres database it may create schemas in (e.g. postgres://postgres@127.0.0.1:5433/mabda_test). The rest of the suite runs on
 * Postgres too with the same setting (every in-memory test database becomes a fresh Postgres schema, server/db/database.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { SqliteDatabase } from './sqlite.ts';
import { PostgresDatabase } from './postgres.ts';
import { copyDatabase, readDumpFile, loadRows, writeDump } from './dump.ts';
import { migrate, LATEST_VERSION } from '../migrations.ts';
import { Repo } from '../repo.ts';
import { restoreIntoIfAsked } from '../../backup.ts';
import type { SqlDatabase } from './types.ts';

const PG = process.env.MABDA_TEST_DATABASE_URL?.trim();
const pgOnly = { skip: PG ? false : 'set MABDA_TEST_DATABASE_URL to run against Postgres' };
const U = 'u-1';
const freshPg = () => { const db = new PostgresDatabase(PG!, { schema: `e_${crypto.randomBytes(5).toString('hex')}` }); migrate(db); return db; };
const freshLite = () => { const db = SqliteDatabase.open(':memory:'); migrate(db); return db; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mabda-engines-'));

/** a small but complete workspace: Persian text, a version history, a binary vector, nulls */
function fill(db: SqlDatabase) {
  const repo = new Repo(db);
  repo.saveWorkspace(U, { id: 'w1', name: 'فضای «آزمون»', createdAt: '2026-11-17T00:00:00Z' } as never);
  const s = { userId: U, workspaceId: 'w1' };
  const o = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: 'قیمت پایه', content: 'نیم‌فاصله، «گیومه» و ۱۲۳', nodeId: repo.listNodes(s)[0].id });
  repo.updateObject(s, o.id, { content: 'نسخهٔ دوم' });
  db.prepare("INSERT INTO intelligence_embeddings (workspace_id, user_id, item_kind, item_id, chunk_index, text_hash, model_key, dims, vector, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run('w1', U, 'object', o.id, 0, 'h', 'm', 2, Buffer.from(new Float32Array([0.5, -1.25]).buffer), '2026-11-17T00:00:00Z');
  return { repo, s, id: o.id };
}

const snapshot = (db: SqlDatabase) => Object.fromEntries(db.tables().filter((t) => t !== 'schema_migrations').map((t) => {
  const cols = db.columns(t).map((c) => c.name);
  const order = cols.filter((c) => db.columns(t).find((x) => x.name === c)!.pk > 0).concat(cols).map((c) => `"${c}"`).join(', ');
  return [t, db.prepare(`SELECT * FROM "${t}" ORDER BY ${order}`).all()];
}));

test('dump: SQLite → SQLite copy keeps every row, Persian text and binary values exactly', () => {
  const a = freshLite(); fill(a);
  const b = freshLite();
  const { rows } = copyDatabase(a, b);
  assert.ok(rows > 10);
  assert.deepEqual(snapshot(b), snapshot(a));
});

test('dump file: written and read back (gzip JSON lines); a newer schema is refused', async () => {
  const a = freshLite(); fill(a);
  const file = path.join(tmp(), 'd.jsonl.gz');
  await writeDump(a, file);
  const d = readDumpFile(file);
  assert.equal(d.header.schemaVersion, LATEST_VERSION);
  const b = freshLite();
  loadRows(b, d.rows, d.header.schemaVersion);
  assert.deepEqual(snapshot(b), snapshot(a));
  assert.throws(() => loadRows(b, d.rows, LATEST_VERSION + 1), /newer schema/);
});

test('Postgres: the schema derived from SQLite has the same tables, columns and primary keys', pgOnly, () => {
  const lite = freshLite(), pg = freshPg();
  try {
    assert.deepEqual(pg.tables(), lite.tables());
    for (const t of lite.tables()) {
      // (a primary key column is NOT NULL in Postgres; SQLite lets a TEXT key be null — Postgres is the stricter of the two)
      const shape = (db: SqlDatabase) => db.columns(t).map((c) => [c.name, c.pk, c.pk > 0 || c.notnull]);
      assert.deepEqual(shape(pg), shape(lite), t);
      assert.deepEqual(pg.parents(t), lite.parents(t), `${t} foreign keys`);
    }
  } finally { pg.close(); }
});

test('Postgres: SQLite data moves in and back out unchanged (the move, and a backup of it)', pgOnly, () => {
  const lite = freshLite(); fill(lite);
  const pg = freshPg();
  try {
    copyDatabase(lite, pg);
    assert.deepEqual(snapshot(pg), snapshot(lite));
    const back = freshLite();
    copyDatabase(pg, back);
    assert.deepEqual(snapshot(back), snapshot(lite));
    const v = pg.prepare('SELECT vector FROM intelligence_embeddings').get() as { vector: Buffer };
    assert.ok(Buffer.isBuffer(v.vector));
    assert.deepEqual([...new Float32Array(v.vector.buffer, v.vector.byteOffset, 2)], [0.5, -1.25]);
  } finally { pg.close(); }
});

test('Postgres: a transaction is all or nothing, a nested one rolls back alone', pgOnly, () => {
  const pg = freshPg();
  try {
    const put = pg.prepare('INSERT INTO kv (user_id, key, value) VALUES (?, ?, ?)');
    assert.throws(() => pg.transaction(() => { put.run(U, 'a', '1'); throw new Error('stop'); })(), /stop/);
    assert.equal((pg.prepare('SELECT COUNT(*) AS n FROM kv').get() as { n: number }).n, 0);
    pg.transaction(() => {
      put.run(U, 'b', '1');
      try { pg.transaction(() => { put.run(U, 'c', '1'); throw new Error('inner'); })(); } catch { /* the outer one goes on */ }
    })();
    assert.deepEqual(pg.prepare('SELECT key FROM kv ORDER BY key').all(), [{ key: 'b' }]);
    assert.equal(typeof (pg.prepare('SELECT COUNT(*) AS n FROM kv').get() as { n: unknown }).n, 'number', 'counts are numbers, as in SQLite');
  } finally { pg.close(); }
});

test('Postgres: MABDA_RESTORE_FROM moves an old SQLite file in once, sets the current data aside first', pgOnly, async () => {
  const dir = tmp();
  const file = path.join(dir, 'mabda.sqlite');
  const lite = SqliteDatabase.open(file); migrate(lite); fill(lite); lite.close();
  const pg = freshPg();
  try {
    new Repo(pg).saveWorkspace(U, { id: 'old', name: 'پیش از انتقال', createdAt: '2026-11-17T00:00:00Z' } as never);
    const env = { MABDA_BACKUP_DIR: dir, MABDA_RESTORE_FROM: file };
    assert.ok((await restoreIntoIfAsked(pg, { ...env, MABDA_RESTORE_FROM: 'nope.sqlite' })).error);
    const r = await restoreIntoIfAsked(pg, env);
    assert.equal(r.restored, file);
    const repo = new Repo(pg);
    assert.deepEqual(repo.listWorkspaces(U).map((w) => w.id), ['w1']);
    assert.equal(repo.listObjects({ userId: U, workspaceId: 'w1' })[0].content, 'نسخهٔ دوم');
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('before-restore-') && f.endsWith('.jsonl.gz')), 'what was there is kept aside');
    // left in place, the setting does nothing on the next start
    repo.saveWorkspace(U, { id: 'later', name: 'بعدی', createdAt: '2026-11-18T00:00:00Z' } as never);
    assert.deepEqual(await restoreIntoIfAsked(pg, env), {});
    assert.equal(repo.listWorkspaces(U).length, 2);
  } finally { pg.close(); }
});

test('SQLite: MABDA_RESTORE_FROM with a dump loads it into the open database once (the way back from Postgres)', async () => {
  const dir = tmp();
  const a = freshLite(); fill(a);
  const dumpFile = path.join(dir, 'mabda-2026-11-17.jsonl.gz');
  await writeDump(a, dumpFile);
  const b = SqliteDatabase.open(path.join(dir, 'b.sqlite')); migrate(b);
  const env = { MABDA_BACKUP_DIR: dir, MABDA_RESTORE_FROM: path.basename(dumpFile) };
  assert.equal((await restoreIntoIfAsked(b, env)).restored, dumpFile);
  assert.deepEqual(new Repo(b).listWorkspaces(U).map((w) => w.id), ['w1']);
  assert.deepEqual(await restoreIntoIfAsked(b, env), {}, 'once');
  b.close();
});

/**
 * The killer needs its OWN connection: adapters on the same address share one (PostgresDatabase.bridges), so when the test
 * database is itself named `postgres` the old `…/postgres` address was the test's own connection and it terminated itself.
 * An application_name makes the address different without changing the database.
 */
const killerUrl = () => { const u = new URL(PG!); u.pathname = '/postgres'; u.searchParams.set('application_name', 'mabda_test_killer'); return u.toString(); };

test('Postgres: a dropped connection is opened again; one lost inside a transaction saves nothing of it', pgOnly, () => {
  const pg = freshPg();
  try {
    // only this test's own connection (other test files run at the same time on the same database)
    const kill = () => { const pid = (pg.query('SELECT pg_backend_pid() AS pid')[0] as { pid: number }).pid; const killer = new PostgresDatabase(killerUrl()); try {
      killer.query('SELECT pg_terminate_backend($1)', [pid]);
      // termination is asynchronous: wait until that backend is really gone
      for (let i = 0; i < 200 && killer.query('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [pid]).length; i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    } finally { killer.close(); } };
    const put = pg.prepare('INSERT INTO kv (user_id, key, value) VALUES (?, ?, ?)');
    put.run(U, 'before', '1');
    kill();
    try { put.run(U, 'x', '1'); } catch { /* the statement that meets the dead connection may fail; it is not retried */ }
    put.run(U, 'after', '1'); // the next one has reconnected, in the same schema
    assert.throws(() => pg.transaction(() => { put.run(U, 'tx1', '1'); kill(); put.run(U, 'tx2', '1'); })());
    put.run(U, 'last', '1');
    assert.deepEqual(pg.prepare("SELECT key FROM kv WHERE key <> 'x' ORDER BY key").all().map((r) => (r as { key: string }).key), ['after', 'before', 'last']);
  } finally { pg.close(); }
});

test('Postgres: after a timeout, every later statement gets its own answer (never the late answer of the one given up on)', pgOnly, () => {
  // the schema is made on a connection with the normal timeout: setting up (dozens of migrations) is not what this test is about,
  // and a busy machine (CI, a checkpoint) can take longer than the short timeout over it. Only the statements below run timed.
  const schema = `e_${crypto.randomBytes(5).toString('hex')}`;
  const setup = new PostgresDatabase(PG!, { schema });
  try { migrate(setup); } finally { setup.close(); }
  // the timeout is short, but with room for a slow runner; each slow statement sleeps well past it
  const pg = new PostgresDatabase(PG!, { schema, timeoutMs: 1500 });
  const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  try {
    assert.throws(() => pg.query('SELECT pg_sleep(3), 1 AS x'), /did not answer/);
    pause(2500); // the late answer (x=1) would be waiting by now
    assert.deepEqual(pg.query('SELECT 2 AS x'), [{ x: 2 }]);
    assert.deepEqual(pg.query('SELECT 3 AS y'), [{ y: 3 }]);
    // a write that timed out inside a transaction is not committed later by the abandoned connection
    const put = pg.prepare('INSERT INTO kv (user_id, key, value) VALUES (?, ?, ?)');
    assert.throws(() => pg.transaction(() => { put.run(U, 'slow', '1'); pg.query('SELECT pg_sleep(3)'); })(), /did not answer/);
    pause(2500);
    assert.equal((pg.prepare('SELECT COUNT(*) AS n FROM kv').get() as { n: number }).n, 0);
    put.run(U, 'fine', '1');
    assert.deepEqual(pg.prepare('SELECT key FROM kv').all(), [{ key: 'fine' }]);
  } finally { pg.close(); }
});

test('Postgres: a database made at an older version takes the later migrations one by one and ends the same as a new one', pgOnly, () => {
  const lite = freshLite();
  const pg = new PostgresDatabase(PG!, { schema: `e_${crypto.randomBytes(5).toString('hex')}` });
  try {
    const base = 27; // accounts exist from 27; 28 adds a column, 29 adds one and fills it from the data
    migrate(pg, base);
    // a row written under the older schema survives the later migrations
    pg.prepare('INSERT INTO accounts (id, name, role, created_at) VALUES (?,?,?,?)').run('a1', 'نفر', 'tester', '2026-11-01T00:00:00Z');
    const applied = migrate(pg, 28);
    pg.prepare('UPDATE accounts SET consented_at = ? WHERE id = ?').run('2026-11-02T00:00:00Z', 'a1');
    applied.push(...migrate(pg));
    assert.deepEqual(applied, Array.from({ length: LATEST_VERSION - base }, (_, i) => base + 1 + i));
    const shape = (db: SqlDatabase) => db.tables().map((t) => [t, db.columns(t).map((c) => [c.name, c.pk, c.pk > 0 || c.notnull])]);
    assert.deepEqual(shape(pg), shape(lite));
    assert.equal((pg.prepare('SELECT consent_version AS v FROM accounts WHERE id = ?').get('a1') as { v: number }).v, 1, 'the data step of migration 29 ran on Postgres');
  } finally { pg.close(); }
});

/** every read the app makes for a workspace, through the API, on one engine */
async function readAll(db: SqlDatabase): Promise<Record<string, unknown>> {
  const { createApp } = await import('../../app.ts');
  const { app } = createApp(db);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
  const get = async (p: string) => (await fetch(base + p)).json();
  try {
    const out: Record<string, unknown> = { workspaces: await get('/workspaces') };
    for (const w of (out.workspaces as { workspaces: Array<{ id: string }> }).workspaces) {
      out[`state:${w.id}`] = await get(`/workspaces/${w.id}/state`);
      out[`log:${w.id}`] = await get(`/workspaces/${w.id}/changes/log`);
      out[`archive:${w.id}`] = await get(`/workspaces/${w.id}/archive`);
    }
    return out;
  } finally { server.close(); }
}

test('Postgres: the same data reads back the same on both engines — versions, links, changes, thoughts, order and types', pgOnly, async () => {
  const lite = freshLite();
  const { createApp } = await import('../../app.ts');
  // build a rich history on SQLite through the app itself: the sample workspace, then edits, links, replacement, archive
  const { app } = createApp(lite);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
  const call = async (m: string, p: string, b?: unknown) => (await fetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })).json() as Promise<any>;
  try {
    const ws = (await call('POST', '/bootstrap', {})).workspaces[0].id as string;
    const st = await call('GET', `/workspaces/${ws}/state`);
    const nodeId = st.nodes[0].id;
    const a = (await call('POST', `/workspaces/${ws}/objects`, { type: 'Fact', provenance: 'User Input', title: 'الف', content: 'یک', nodeId })).object ?? null;
    const b = (await call('POST', `/workspaces/${ws}/objects`, { type: 'Decision', provenance: 'User Input', title: 'ب', content: 'دو', nodeId })).object ?? null;
    assert.ok(a?.id && b?.id, 'the scenario created its objects');
    {
      for (const c of ['یک-۲', 'یک-۳', 'یک-۴']) await call('PATCH', `/workspaces/${ws}/objects/${a.id}`, { content: c });
      await call('POST', `/workspaces/${ws}/canvas/connect`, { sourceId: a.id, targetId: b.id, type: 'supports' });
    }
  } finally { server.close(); }
  const pg = freshPg();
  try {
    copyDatabase(lite, pg);
    const [x, y] = [await readAll(lite), await readAll(pg)];
    assert.ok(JSON.stringify(x).length > 5000, 'the scenario produced real data');
    assert.deepEqual(y, x);
  } finally { pg.close(); }
});

test('Postgres → SQLite: MABDA_RESTORE_FROM with the Postgres address copies the live data back (nothing since the last backup is lost)', pgOnly, async () => {
  const name = `mabda_back_${crypto.randomBytes(4).toString('hex')}`;
  const admin = new PostgresDatabase(PG!.replace(/\/[^/]*$/, '/postgres'));
  admin.query(`CREATE DATABASE ${name}`);
  const url = PG!.replace(/\/[^/]*$/, `/${name}`);
  try {
    const src = new PostgresDatabase(url); migrate(src); fill(src);
    new Repo(src).saveWorkspace(U, { id: 'today', name: 'نوشته‌شده امروز', createdAt: '2026-11-17T09:00:00Z' } as never);
    src.close();
    const dir = tmp();
    const lite = SqliteDatabase.open(path.join(dir, 'mabda.sqlite')); migrate(lite);
    const env = { MABDA_BACKUP_DIR: dir, MABDA_RESTORE_FROM: url };
    const r = await restoreIntoIfAsked(lite, env);
    assert.ok(r.restored && !r.restored.includes('postgres://'), 'the address (and any password) is not printed');
    assert.deepEqual(new Repo(lite).listWorkspaces(U).map((w) => w.id).sort(), ['today', 'w1']);
    assert.deepEqual(await restoreIntoIfAsked(lite, env), {}, 'once');
    lite.close();
  } finally { admin.query(`DROP DATABASE ${name} WITH (FORCE)`); admin.close(); }
});

test('Postgres: ties and empty values come back in SQLite\'s order (same moment, missing line number)', pgOnly, async () => {
  const lite = freshLite();
  const { repo, s } = fill(lite);
  const node = repo.listNodes(s)[0].id;
  const T = '2026-11-17T12:00:00.000Z';
  // three notes and three changes written at the very same moment, in an order that is not the order of their ids
  for (const id of ['n_c', 'n_a', 'n_b']) lite.prepare('INSERT INTO notes (id, user_id, workspace_id, node_id, content, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(id, U, 'w1', node, `یادداشت ${id}`, T, T);
  for (const id of ['c_z', 'c_x', 'c_y']) lite.prepare("INSERT INTO context_changes (id,user_id,workspace_id,object_id,from_version,to_version,kind,actor,at) VALUES (?,?,?,?,?,?,'edited','user',?)").run(id, U, 'w1', 'o_same', 1, 2, T);
  // thoughts of one note: some with a line number, some without
  for (const [id, line] of [['t_2', 2], ['t_n1', null], ['t_0', 0], ['t_n2', null]] as const) lite.prepare("INSERT INTO thoughts (id,user_id,workspace_id,node_id,kind,text,status,source_note_id,source_line,created_at,updated_at) VALUES (?,?,?,?,'idea',?,'open','n_a',?,?,?)").run(id, U, 'w1', node, `فکر ${id}`, line, T, T);
  const pg = freshPg();
  try {
    copyDatabase(lite, pg);
    const reads = (db: SqlDatabase) => {
      const r = new Repo(db);
      return { notes: r.listNotes(s).map((n) => n.id), changes: r.listChanges(s, { includeNodes: true }).map((c) => c.id), thoughts: r.listThoughts(s, { includeResolved: true }).map((t) => t.id), raw: db.prepare('SELECT id FROM thoughts WHERE workspace_id = ? AND user_id = ? ORDER BY source_line, created_at').all('w1', U) };
    };
    assert.deepEqual(reads(pg), reads(lite));
  } finally { pg.close(); }
});
