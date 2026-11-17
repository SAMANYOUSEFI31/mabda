/**
 * A portable copy of the whole database: every table's rows, engine-neutral.
 *
 * Goal: one way to move data that works between any two adapters — SQLite → Postgres (the move), Postgres → a file (daily
 * backups and the owner's download), a file → Postgres (restore). Check: `dump.test.ts` round-trips every table (Persian text,
 * numbers, nulls, binary vectors) and moves a SQLite file into Postgres.
 *
 * Format: gzip of JSON lines. Line 1 = header {format, schemaVersion}; then one line per row {t: table, r: row}. Binary values
 * are {"$b64": …}. Rows are written in the order they were written to the table (rowid), so «same moment» ties keep their order.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { currentVersion } from '../migrations.ts';
import type { SqlDatabase } from './types.ts';

export const DUMP_FORMAT = 'mabda-db-dump';
const KEEP_OUT = new Set(['schema_migrations']);

const enc = (v: unknown) => (Buffer.isBuffer(v) ? { $b64: v.toString('base64') } : v);
const dec = (v: unknown) => (v && typeof v === 'object' && '$b64' in (v as object) ? Buffer.from((v as { $b64: string }).$b64, 'base64') : v);

/** tables a row of `table` points to must be filled first (and emptied last) */
function loadOrder(db: SqlDatabase, tables: string[]): string[] {
  const out: string[] = [], seen = new Set<string>();
  const visit = (t: string) => { if (seen.has(t)) return; seen.add(t); for (const p of db.parents(t)) if (tables.includes(p) && p !== t) visit(p); out.push(t); };
  for (const t of tables) visit(t);
  return out;
}

export function dataTables(db: SqlDatabase): string[] {
  return loadOrder(db, db.tables().filter((t) => !KEEP_OUT.has(t)));
}

export function* dumpLines(db: SqlDatabase): Generator<string> {
  yield JSON.stringify({ format: DUMP_FORMAT, schemaVersion: currentVersion(db), engine: db.dialect });
  for (const t of dataTables(db)) {
    for (const r of db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all() as Array<Record<string, unknown>>) {
      const row: Record<string, unknown> = {};
      for (const k in r) row[k] = enc(r[k]);
      yield JSON.stringify({ t, r: row });
    }
  }
}

/**
 * One consistent copy: every table is read inside one snapshot, synchronously (nothing else runs on the shared connection
 * meanwhile), into a plain file; only then is it compressed, in the background. So a write that lands during a backup is either
 * wholly in it or wholly not — never a version without its object, or a link without one end.
 */
export async function writeDump(db: SqlDatabase, file: string): Promise<void> {
  const plain = `${file}.jsonl`;
  const fd = fs.openSync(plain, 'w');
  try { db.readSnapshot(() => { for (const line of dumpLines(db)) fs.writeSync(fd, `${line}\n`); }); } finally { fs.closeSync(fd); }
  try {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(file);
      out.on('finish', resolve); out.on('error', reject);
      fs.createReadStream(plain).on('error', reject).pipe(zlib.createGzip()).on('error', reject).pipe(out);
    });
  } finally { fs.rmSync(plain, { force: true }); }
}

export function readDumpFile(file: string): { header: { format: string; schemaVersion: number }; rows: Array<{ t: string; r: Record<string, unknown> }> } {
  const lines = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean);
  const header = JSON.parse(lines[0] ?? '{}');
  if (header.format !== DUMP_FORMAT) throw new Error('not a Mabda database dump');
  return { header, rows: lines.slice(1).map((l) => JSON.parse(l)) };
}

/**
 * Replaces everything in `db` with `rows` (one transaction: all or nothing). The target's schema must be at least as new as the
 * source's; columns the source did not have keep their defaults.
 */
export function loadRows(db: SqlDatabase, rows: Iterable<{ t: string; r: Record<string, unknown> }>, sourceVersion: number): { rows: number } {
  if (sourceVersion > currentVersion(db)) throw new Error(`the copy is from a newer schema (${sourceVersion}) than this database (${currentVersion(db)}); update Mabda first`);
  const tables = dataTables(db);
  const known = new Map(tables.map((t) => [t, new Set(db.columns(t).map((c) => c.name))]));
  const stmts = new Map<string, ReturnType<SqlDatabase['prepare']>>();
  let n = 0;
  db.transaction(() => {
    for (const t of [...tables].reverse()) db.prepare(`DELETE FROM "${t}"`).run();
    for (const { t, r } of rows) {
      const cols = known.get(t);
      if (!cols) throw new Error(`the copy has a table this database does not know: ${t}`);
      const names = Object.keys(r).filter((c) => cols.has(c));
      const key = `${t}|${names.join(',')}`;
      let st = stmts.get(key);
      if (!st) { st = db.prepare(`INSERT INTO "${t}" (${names.map((c) => `"${c}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`); stmts.set(key, st); }
      st.run(...names.map((c) => dec(r[c])));
      n++;
    }
  })();
  return { rows: n };
}

/** every row of `from` into `to` (which is emptied first) */
export function copyDatabase(from: SqlDatabase, to: SqlDatabase): { rows: number } {
  return from.readSnapshot(() => {
    const lines = dumpLines(from);
    const header = JSON.parse(lines.next().value as string);
    const rows = (function* () { for (const l of lines) yield JSON.parse(l) as { t: string; r: Record<string, unknown> }; })();
    return loadRows(to, rows, header.schemaVersion);
  });
}
