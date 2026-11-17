/**
 * The storage port (Adapter pattern).
 *
 * Goal: the data can live in SQLite (one file on a disk) or in Postgres (a managed database any host offers), and the rest of the
 * server — Repo, auth, files, intelligence — does not know which. Check: the whole test suite runs unchanged against both
 * (`bun run test` on SQLite; `MABDA_TEST_DATABASE_URL=postgres://… bun run test` on Postgres).
 *
 * The shape is the subset of better-sqlite3 the code already used (prepare → get/all/run, exec, transaction), so a raw
 * better-sqlite3 handle still fits and no call site had to change. What differs between engines — reading the schema, making
 * deleted text unrecoverable, closing — is a method here, implemented once per adapter, never an `if (sqlite)` at a call site.
 *
 * Calls are synchronous on purpose: every caller was written for a synchronous driver. The Postgres adapter keeps that contract
 * with a worker thread (see postgres.ts); moving to async calls is a later, separate step, and this interface is where it starts.
 */
export type Dialect = 'sqlite' | 'postgres';

export type Row = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...params: any[]) => unknown;
type Args<F extends Fn> = F extends (...args: infer A) => unknown ? A : never;
/** a function that runs `fn` as one unit (all or none) — the same shape better-sqlite3 gives */
export interface Transaction<F extends Fn> { (...params: Args<F>): ReturnType<F> }

export interface RunResult { changes: number }

export interface SqlStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): RunResult;
}

export interface Column { name: string; pk: number; type: string; notnull: boolean; dflt: string | null }

/** the minimum every engine offers — a raw better-sqlite3 handle satisfies it too (see `asSql`) */
export interface SqlLike {
  prepare(sql: string): SqlStatement;
  exec(sql: string): unknown;
  transaction<F extends Fn>(fn: F): Transaction<F>;
  close(): unknown;
}

export interface SqlDatabase extends SqlLike {
  readonly dialect: Dialect;
  /** the app's tables (not the engine's own), sorted by name */
  tables(): string[];
  /** the columns of one table, in order; `pk` is the 1-based position in the primary key, 0 = not part of it */
  columns(table: string): Column[];
  /** the tables a row of `table` points to (foreign keys): those are filled first when data is copied in */
  parents(table: string): string[];
  /** after a permanent delete: make the removed rows unreadable in the storage itself (best the engine allows) */
  flushErased(tables?: string[]): void;
  /** a complete, consistent copy of the database in one file (SQLite: a database file; Postgres: a portable dump, sql/dump.ts) */
  readonly backupExt: string;
  backupTo(file: string): Promise<void>;
}

/** a SQL statement's text with every `?` placeholder — used where a column list is built at run time */
export const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');
