import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dailyBackup, listBackups, restoreIfAsked, KEEP_DAYS } from './backup.ts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mabda-backup-'));
const open = (file: string) => { const db = new Database(file); db.pragma('journal_mode = WAL'); return db; };
const rows = (file: string) => { const db = new Database(file, { readonly: true }); try { return (db.prepare('SELECT v FROM t ORDER BY v').all() as Array<{ v: string }>).map((r) => r.v); } finally { db.close(); } };

test('daily backup: one copy per Tehran day, complete while written, only the newest 14 kept', async () => {
  const dir = tmp(); const file = path.join(dir, 'mabda.sqlite'); const bdir = path.join(dir, 'backups');
  const db = open(file); db.exec('CREATE TABLE t (v TEXT)'); db.prepare('INSERT INTO t VALUES (?)').run('a');
  // 20:45 UTC on Nov 15 is already Nov 16 in Tehran
  const f1 = await dailyBackup(db, bdir, new Date('2026-11-15T20:45:00Z'));
  assert.equal(path.basename(f1!), 'mabda-2026-11-16.sqlite');
  assert.equal(await dailyBackup(db, bdir, new Date('2026-11-16T10:00:00Z')), undefined, 'the same Tehran day is not copied twice');
  assert.deepEqual(rows(f1!), ['a']);
  for (let d = 1; d <= 20; d++) await dailyBackup(db, bdir, new Date(Date.UTC(2026, 11, d, 8)));
  const kept = listBackups(bdir);
  assert.equal(kept.length, KEEP_DAYS);
  assert.equal(kept[0].day, '2026-12-20');
  assert.ok(!fs.readdirSync(bdir).some((f) => f.endsWith('.part')));
  db.close();
});

test('restore from a backup: the current data is set aside first, applied once, a missing file changes nothing', async () => {
  const dir = tmp(); const file = path.join(dir, 'mabda.sqlite'); const bdir = path.join(dir, 'backups');
  let db = open(file); db.exec('CREATE TABLE t (v TEXT)'); db.prepare('INSERT INTO t VALUES (?)').run('yesterday');
  const b = await dailyBackup(db, bdir, new Date('2026-11-15T08:00:00Z'));
  db.prepare('INSERT INTO t VALUES (?)').run('mistake'); // still in the write-ahead log
  db.close();

  const env = { MABDA_BACKUP_DIR: bdir, MABDA_RESTORE_FROM: path.basename(b!) };
  assert.ok(restoreIfAsked(file, { ...env, MABDA_RESTORE_FROM: 'nope.sqlite' }).error);
  assert.deepEqual(rows(file), ['mistake', 'yesterday'], 'a wrong name changes nothing');

  assert.equal(restoreIfAsked(file, env).restored, b);
  assert.deepEqual(rows(file), ['yesterday']);
  const aside = fs.readdirSync(bdir).find((f) => f.startsWith('before-restore-'))!;
  assert.deepEqual(rows(path.join(bdir, aside)), ['mistake', 'yesterday'], 'what was there before is kept, write-ahead log included');

  // the setting left in place does not restore again on the next start
  db = open(file); db.prepare('INSERT INTO t VALUES (?)').run('today'); db.close();
  assert.deepEqual(restoreIfAsked(file, env), {});
  assert.deepEqual(rows(file), ['today', 'yesterday']);
});
