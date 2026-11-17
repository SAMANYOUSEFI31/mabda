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

test('Postgres: a dropped connection is opened again; one lost inside a transaction saves nothing of it', pgOnly, () => {
  const pg = freshPg();
  try {
    // only this test's own connection (other test files run at the same time on the same database)
    const kill = () => { const pid = (pg.query('SELECT pg_backend_pid() AS pid')[0] as { pid: number }).pid; const killer = new PostgresDatabase(PG!.replace(/\/[^/]*$/, '/postgres')); try {
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
