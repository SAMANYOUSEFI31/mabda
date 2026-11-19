/**
 * Migration 32 (monitoring onto truths) on EXISTING data, both engines: nothing a person made may be lost or changed.
 *   npx tsx scripts/check-migration-32.ts <a SQLite file made by Mabda before migration 32> [postgres url of an EMPTY database]
 *
 * 1. SQLite: a copy of the file is migrated in place; every metric, number, output (with its trail), pack and metric Change is
 *    compared before and after, and the two new columns start empty.
 * 2. Postgres (with a URL): an empty database is built at schema 31, the same rows are copied in, migrated to 32, compared again.
 * 3. Then on Postgres: a number made earlier is linked to a truth, the workspace is backed up and restored (the link follows the new
 *    ids), and the whole database is dumped and loaded into a fresh SQLite (the way back) and compared once more.
 * Exit code 0 = all held. Nothing is written to the given SQLite file.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { SqliteDatabase } from '../server/db/sql/sqlite.ts';
import { PostgresDatabase } from '../server/db/sql/postgres.ts';
import { copyDatabase, writeDump, readDumpFile, loadRows } from '../server/db/sql/dump.ts';
import type { SqlDatabase } from '../server/db/sql/types.ts';
import { migrate, currentVersion } from '../server/db/migrations.ts';
import { Repo } from '../server/db/repo.ts';
import { exportWorkspace, restoreWorkspace } from '../server/db/workspaceBackup.ts';

const [src, pgUrl] = process.argv.slice(2);
if (!src) { console.error('usage: tsx scripts/check-migration-32.ts <file.sqlite> [postgres-url]'); process.exit(2); }

const TABLES = ['metrics', 'measurements', 'deliverables', 'context_packs', 'saved_packs', 'specs', 'context_objects', 'context_object_versions'];
const NEW_COLS = new Set(['object_id', 'cadence']);
/** row count + a hash of every row (columns sorted, the two new columns left out) per table, and the metric Change rows */
function fingerprint(db: SqlDatabase): Record<string, { n: number; h: string }> {
  const out: Record<string, { n: number; h: string }> = {};
  const norm = (r: Record<string, unknown>) => JSON.stringify(Object.keys(r).filter((k) => !NEW_COLS.has(k) && k !== 'rowid').sort().map((k) => [k, typeof r[k] === 'bigint' ? Number(r[k]) : r[k]]));
  const hash = (rows: Array<Record<string, unknown>>) => crypto.createHash('sha256').update(rows.map(norm).sort().join('\n')).digest('hex').slice(0, 16);
  for (const t of TABLES) { const rows = db.prepare(`SELECT * FROM "${t}"`).all() as Array<Record<string, unknown>>; out[t] = { n: rows.length, h: hash(rows) }; }
  const ch = db.prepare("SELECT * FROM context_changes WHERE object_id LIKE 'metric:%'").all() as Array<Record<string, unknown>>;
  out['context_changes(metric:*)'] = { n: ch.length, h: hash(ch) };
  return out;
}
const show = (f: Record<string, { n: number }>) => Object.entries(f).map(([t, v]) => `${t}=${v.n}`).join(' ');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig32-'));
const copy = path.join(tmp, 'copy.sqlite');
fs.copyFileSync(src, copy);

// ── 1. SQLite ─────────────────────────────────────────────────────────────
const lite = SqliteDatabase.open(copy);
const v0 = currentVersion(lite);
assert.ok(v0 < 32, `the file must be from before migration 32 (it is at ${v0})`);
const before = fingerprint(lite);
console.log(`SQLite at ${v0}: ${show(before)}`);
const applied = migrate(lite);
assert.deepEqual(applied.at(-1), 32);
const after = fingerprint(lite);
assert.deepEqual(after, before, 'SQLite: every row is the same after migration 32');
const linked = lite.prepare('SELECT COUNT(*) AS n FROM metrics WHERE object_id IS NOT NULL OR cadence IS NOT NULL').get() as { n: number };
assert.equal(Number(linked.n), 0, 'the new columns start empty: nothing is linked for her');
console.log(`SQLite → ${currentVersion(lite)}: same rows (${applied.join(', ')} applied); no metric linked automatically ✓`);

if (pgUrl) {
  // ── 2. Postgres: built at 31, the old rows copied in, then migrated ────────
  fs.copyFileSync(src, path.join(tmp, 'old2.sqlite'));
  const oldLite = SqliteDatabase.open(path.join(tmp, 'old2.sqlite'));
  const pg = new PostgresDatabase(pgUrl);
  migrate(pg, v0);
  assert.equal(currentVersion(pg), v0);
  copyDatabase(oldLite, pg);
  const pgBefore = fingerprint(pg);
  assert.deepEqual(pgBefore, before, 'Postgres at the old schema holds the same rows');
  const pgApplied = migrate(pg);
  assert.deepEqual(pgApplied, [32]);
  assert.deepEqual(fingerprint(pg), before, 'Postgres: every row is the same after migration 32');
  console.log(`Postgres ${v0} → 32: same rows ✓`);

  // ── 3. link, back up and restore a workspace, and the way back to SQLite ───
  const repo = new Repo(pg as never);
  const m = pg.prepare('SELECT * FROM metrics WHERE object_id IS NULL AND archived IS NULL LIMIT 1').get() as Record<string, string> | undefined;
  if (m) {
    const s = { userId: m.user_id, workspaceId: m.workspace_id };
    const n0 = repo.listMeasurements(s, { metricId: m.id }).length;
    const fact = repo.createObject(s, { type: 'Fact', status: 'Confirmed', provenance: 'User Input', title: m.name, content: 'آزمون پیوند.', nodeId: repo.listNodes(s)[0].id });
    repo.updateMetric(s, m.id, { objectId: fact.id, cadence: 'week' });
    assert.equal(repo.listMeasurements(s, { metricId: m.id }).length, n0, 'linking keeps every number');
    const backup = exportWorkspace(repo, s);
    const restored = restoreWorkspace(repo, s.userId, JSON.parse(JSON.stringify(backup)));
    const rs = { userId: s.userId, workspaceId: restored.id };
    const rm = repo.listMetrics(rs).find((x) => x.name === m.name)!;
    assert.ok(rm.objectId && rm.objectId !== fact.id && repo.getObject(rs, rm.objectId)?.title === m.name, 'the link follows the restored truth\'s new id');
    assert.equal(rm.cadence, 'week');
    assert.equal(repo.listMeasurements(rs, { metricId: rm.id }).length, n0, 'the restored monitor has every number');
    for (const t of ['metrics', 'measurements', 'deliverables']) {
      const a = (pg.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE workspace_id = ?`).get(s.workspaceId) as { n: number }).n;
      const b = (pg.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE workspace_id = ?`).get(restored.id) as { n: number }).n;
      assert.equal(Number(b), Number(a), `restored ${t}`);
    }
    console.log(`Postgres: «${m.name}» linked to a truth; workspace backup restored with the link and all its numbers and outputs ✓`);
  }
  const dump = path.join(tmp, 'pg.jsonl.gz');
  await writeDump(pg, dump);
  const back = SqliteDatabase.open(path.join(tmp, 'back.sqlite'));
  migrate(back);
  const { header, rows } = readDumpFile(dump);
  loadRows(back, rows, header.schemaVersion);
  assert.deepEqual(fingerprint(back), fingerprint(pg), 'the way back (Postgres dump → SQLite) holds every row');
  const lk = (db: SqlDatabase) => (db.prepare('SELECT id, object_id, cadence FROM metrics ORDER BY id').all() as unknown[]).map((r) => JSON.stringify(r)).join('|');
  assert.equal(lk(back), lk(pg), 'and every link');
  console.log('Postgres dump → fresh SQLite: same rows and links ✓');
  await (pg as unknown as { close?: () => Promise<void> | void }).close?.();
}
console.log('migration 32: all checks held');
process.exit(0);
