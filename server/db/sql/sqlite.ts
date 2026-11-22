/** The SQLite adapter: one file on a disk (or `:memory:`), via better-sqlite3. */
import Database from 'better-sqlite3';
import type { Column, RunResult, SqlDatabase, SqlLike, SqlStatement, Transaction } from './types.ts';

/** SQL has NULL, not JavaScript `undefined`. Keep that normalization at the storage boundary so every caller behaves the same
 * on SQLite and Postgres (whose adapter already performs this conversion). */
const sqlParams = (params: unknown[]): unknown[] => params.map((v) => v === undefined ? null : v);

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

  prepare(sql: string): SqlStatement {
    const stmt = this.raw.prepare(sql);
    return {
      get: (...params: unknown[]): unknown => stmt.get(...sqlParams(params)),
      all: (...params: unknown[]): unknown[] => stmt.all(...sqlParams(params)) as unknown[],
      run: (...params: unknown[]): RunResult => {
        const r = stmt.run(...sqlParams(params));
        return { changes: r.changes };
      },
    };
  }
  exec(sql: string) { this.raw.exec(sql); }
  transaction<F extends (...params: any[]) => unknown>(fn: F): Transaction<F> { return this.raw.transaction(fn); }
  close() { this.raw.close(); }
  tables(): string[] { return (this.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((t) => t.name); }
  columns(table: string): Column[] { return (this.raw.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string; pk: number; type: string; notnull: number; dflt_value: string | null }>).map((c) => ({ name: c.name, pk: c.pk, type: c.type, notnull: !!c.notnull, dflt: c.dflt_value })); }
  flushErased() { try { this.raw.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* no log */ } }
  readSnapshot<T>(fn: () => T): T { return this.raw.transaction(fn).deferred(); }
  parents(table: string): string[] { return [...new Set((this.raw.prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`).all() as Array<{ table: string }>).map((f) => f.table))]; }
  readonly backupExt = '.sqlite';
  async backupTo(file: string): Promise<void> { await this.raw.backup(file); }
}

export function asSql(db: SqlLike | SqlDatabase): SqlDatabase {
  if ((db as SqlDatabase).dialect) return db as SqlDatabase;
  return new SqliteDatabase(db as unknown as Database.Database);
}
