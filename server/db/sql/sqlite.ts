/** The SQLite adapter: one file on a disk (or `:memory:`), via better-sqlite3. */
import Database from 'better-sqlite3';
import type { Column, SqlDatabase, SqlLike, SqlStatement, Transaction } from './types.ts';

export class SqliteDatabase implements SqlDatabase {
  readonly dialect = 'sqlite' as const;
  constructor(readonly raw: Database.Database) {}

  static open(file: string): SqliteDatabase {
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // an erased row is overwritten with zeros (not just unlinked): «حذف دائمی» must not leave the words in the file
    db.pragma('secure_delete = ON');
    return new SqliteDatabase(db);
  }

  prepare(sql: string): SqlStatement { return this.raw.prepare(sql) as unknown as SqlStatement; }
  exec(sql: string) { this.raw.exec(sql); }
  transaction<F extends (...params: any[]) => unknown>(fn: F): Transaction<F> {
    return this.raw.transaction(fn);
  }
  close() { this.raw.close(); }

  tables(): string[] {
    return (this.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((t) => t.name);
  }
  columns(table: string): Column[] {
    return (this.raw.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string; pk: number; type: string; notnull: number; dflt_value: string | null }>)
      .map((c) => ({ name: c.name, pk: c.pk, type: c.type, notnull: !!c.notnull, dflt: c.dflt_value }));
  }
  /** fold the write-ahead log into the file, so the zeroed pages are what is on disk (an in-memory database has no log) */
  flushErased() { try { this.raw.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* no log */ } }

  parents(table: string): string[] {
    return [...new Set((this.raw.prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`).all() as Array<{ table: string }>).map((f) => f.table))];
  }

  readonly backupExt = '.sqlite';
  /** SQLite's online backup: a consistent copy while it is being written */
  async backupTo(file: string): Promise<void> { await this.raw.backup(file); }
}

/** a raw better-sqlite3 handle (tests, old call sites) becomes the adapter; an adapter is returned as it is */
export function asSql(db: SqlLike | SqlDatabase): SqlDatabase {
  if ((db as SqlDatabase).dialect) return db as SqlDatabase;
  return new SqliteDatabase(db as unknown as Database.Database);
}
