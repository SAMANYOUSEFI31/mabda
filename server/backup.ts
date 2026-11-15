/**
 * Whole-database backups for the test copy (INFRA-02, INFRA-08).
 *
 * Goal (principle): a tester's data survives a restart, a deploy and a mistake, and the owner can bring yesterday back without
 * a programmer. Method: once a day the server copies the live database with SQLite's online backup (consistent while it is being
 * written), keeps the last 14 days next to it on the persistent disk, and the owner can download a fresh copy at any time
 * (an off-host copy: a disk can be lost too). Bringing one back = one setting in the host's dashboard (MABDA_RESTORE_FROM), applied
 * once at start-up, after the current database is itself saved aside.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { tehranDay } from '../src/core/tehranDate.ts';

export const KEEP_DAYS = 14;
const NAME = /^mabda-(\d{4}-\d{2}-\d{2})\.sqlite$/;

export const backupDirFor = (dbFile: string, env: NodeJS.ProcessEnv = process.env) => env.MABDA_BACKUP_DIR || path.join(path.dirname(dbFile), 'backups');

/** the backups on disk, newest first */
export function listBackups(dir: string): Array<{ file: string; day: string; bytes: number }> {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => ({ f, m: NAME.exec(f) })).filter((x) => x.m)
    .map((x) => ({ file: path.join(dir, x.f), day: x.m![1], bytes: fs.statSync(path.join(dir, x.f)).size }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** today's copy (Tehran day), if it is not there yet; then only the newest KEEP_DAYS are kept */
export async function dailyBackup(db: Database.Database, dir: string, now: Date = new Date()): Promise<string | undefined> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `mabda-${tehranDay(now)}.sqlite`);
  if (fs.existsSync(file)) return undefined;
  const tmp = `${file}.part`;
  await db.backup(tmp);
  fs.renameSync(tmp, file); // a half-written copy never has the final name
  for (const old of listBackups(dir).slice(KEEP_DAYS)) fs.rmSync(old.file, { force: true });
  return file;
}

/** a fresh copy for the owner to download (not kept) */
export async function freshCopy(db: Database.Database, dir: string, now: Date = new Date()): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `download-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`);
  await db.backup(file);
  return file;
}

/** checks every hour whether today's backup exists; the timer never keeps the process alive */
export function scheduleDailyBackups(db: Database.Database, dir: string, clock: () => Date = () => new Date()): () => void {
  const run = () => { dailyBackup(db, dir, clock()).then((f) => { if (f) console.log(`[backup] saved ${path.basename(f)}`); }).catch((e) => console.error('[backup] failed:', (e as Error).message)); };
  run();
  const t = setInterval(run, 60 * 60 * 1000);
  t.unref();
  return () => clearInterval(t);
}

/**
 * MABDA_RESTORE_FROM=<a backup file name or path>: before the database is opened, the named backup replaces it. The current
 * database is first copied aside (before-restore-…). Applied once: the marker file remembers which backup was restored, so a
 * forgotten setting does not roll the data back again on the next restart.
 */
export function restoreIfAsked(dbFile: string, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): { restored?: string; error?: string } {
  const asked = (env.MABDA_RESTORE_FROM ?? '').trim();
  if (!asked || dbFile === ':memory:') return {};
  const dir = backupDirFor(dbFile, env);
  const src = path.isAbsolute(asked) ? asked : path.join(dir, asked);
  const marker = `${dbFile}.restored-from`;
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === src) return {};
  if (!fs.existsSync(src)) return { error: `MABDA_RESTORE_FROM: ${src} was not found. Nothing was changed.` };
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(dbFile)) {
    // fold the write-ahead log into the file first, so the copy set aside is complete
    const cur = new Database(dbFile);
    try { cur.pragma('wal_checkpoint(TRUNCATE)'); } finally { cur.close(); }
    fs.copyFileSync(dbFile, path.join(dir, `before-restore-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`));
  }
  for (const extra of ['-wal', '-shm']) fs.rmSync(dbFile + extra, { force: true });
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.copyFileSync(src, dbFile);
  fs.writeFileSync(marker, src);
  return { restored: src };
}
