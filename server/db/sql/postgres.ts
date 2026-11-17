/**
 * The Postgres adapter.
 *
 * Every caller in the server was written for a synchronous driver, so this adapter is synchronous too: a worker thread owns the
 * `pg` connection and the main thread waits for each answer (Atomics.wait on shared memory, then reads the reply from a private
 * port). Goal: Postgres without rewriting ~350 call sites at once. Cost: while a query runs the process waits, as it already did
 * for SQLite's disk reads; with the database in the same region that is about a millisecond a query. Check: measured in
 * `scripts/measure-pg.ts`; revisit (move the port to async) when request times grow or people grow past tens.
 *
 * One connection, one process: the same model the SQLite file had, so transactions keep their meaning (nothing else can run
 * between BEGIN and COMMIT while the main thread is waiting).
 */
import { MessageChannel, Worker, receiveMessageOnPort, type MessagePort } from 'node:worker_threads';
import { translateDdl, translateQuery, type SchemaLookup, type TableShape } from './translate.ts';
import type { Column, RunResult, SqlDatabase, SqlStatement, Transaction } from './types.ts';

export class PostgresError extends Error {
  constructor(message: string, readonly code?: string, readonly sql?: string) { super(message); }
}

type Reply = { ok: true; rows: Array<Record<string, unknown>>; changes: number } | { ok: false; message: string; code?: string };

/** the synchronous bridge to the worker: one request at a time, a timeout so a lost database never hangs the process forever */
class SyncBridge {
  private readonly flag = new Int32Array(new SharedArrayBuffer(4));
  private readonly port: MessagePort;
  private readonly worker: Worker;

  constructor(url: string, private readonly timeoutMs: number) {
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    this.worker = new Worker(new URL('./pgWorker.mjs', import.meta.url), { workerData: { flag: this.flag.buffer, port: port2, url }, transferList: [port2] });
    this.worker.unref();
  }

  /** round trips to the database so far (scripts/measure-pg.ts) */
  static calls = 0;

  call(req: Record<string, unknown>): Reply {
    SyncBridge.calls++;
    Atomics.store(this.flag, 0, 0);
    this.worker.postMessage(req);
    const waited = Atomics.wait(this.flag, 0, 0, this.timeoutMs);
    if (waited === 'timed-out') throw new PostgresError(`Postgres did not answer within ${this.timeoutMs} ms`, 'MABDA_TIMEOUT', String(req.sql ?? req.op));
    const msg = receiveMessageOnPort(this.port);
    if (!msg) throw new PostgresError('Postgres bridge: no reply', 'MABDA_BRIDGE');
    return msg.message as Reply;
  }

  terminate() { void this.worker.terminate(); }

  /** which schema the connection is in now (several adapters may share one connection, see `PostgresDatabase.bridgeFor`) */
  schema?: string;
  users = 0;
}

/** a bytea comes back across the thread as a Uint8Array; the code expects a Buffer, as better-sqlite3 gave it */
const fixRow = (r: Record<string, unknown>) => {
  delete r.rowid; // the hidden ordering column (see pgSchema.ts) is never part of a row, as in SQLite
  for (const k in r) { const v = r[k]; if (v instanceof Uint8Array && !Buffer.isBuffer(v)) r[k] = Buffer.from(v.buffer, v.byteOffset, v.byteLength); }
  return r;
};

/** how many round trips the process has made to Postgres (for measurements) */
export const postgresRoundTrips = () => SyncBridge.calls;

export interface PostgresOptions {
  /** a Postgres schema of its own (created when missing); default `public`. Tests use one per database. */
  schema?: string;
  timeoutMs?: number;
}

export class PostgresDatabase implements SqlDatabase {
  readonly dialect = 'postgres' as const;
  private readonly bridge: SyncBridge;
  private readonly cache = new Map<string, string>();
  private shapes = new Map<string, TableShape>();
  private depth = 0;
  /** tables with deleted or overwritten rows since the last flushErased */
  private readonly erased = new Set<string>();
  readonly schema: string;

  /** one connection (one worker) per database address, shared by every adapter on it */
  private static bridges = new Map<string, SyncBridge>();
  private static bridgeFor(url: string, timeoutMs: number): SyncBridge {
    let b = PostgresDatabase.bridges.get(url);
    if (!b) {
      b = new SyncBridge(url, timeoutMs);
      const r = b.call({ op: 'connect' });
      if (!r.ok) { b.terminate(); throw new PostgresError(`could not connect to Postgres: ${r.message}`, r.code); }
      PostgresDatabase.bridges.set(url, b);
    }
    return b;
  }

  constructor(private readonly url: string, opts: PostgresOptions = {}) {
    this.schema = opts.schema ?? 'public';
    this.bridge = PostgresDatabase.bridgeFor(url, opts.timeoutMs ?? 15_000);
    this.bridge.users++;
    this.enter(true);
  }

  /** the shared connection is pointed at this adapter's schema before each of its statements */
  private enter(create = false) {
    if (this.bridge.schema === this.schema && !create) return;
    this.check(this.bridge.call({ op: 'schema', schema: this.schema, create }));
    this.bridge.schema = this.schema;
  }

  private check(r: Reply, sql?: string): Extract<Reply, { ok: true }> {
    if (!r.ok) throw new PostgresError(r.message, r.code, sql);
    return r;
  }

  /** a raw statement in Postgres' own SQL (no translation) */
  query(sql: string, params?: unknown[]): Array<Record<string, unknown>> {
    this.enter();
    return this.check(this.bridge.call({ sql, params }), sql).rows.map(fixRow);
  }

  private lookup: SchemaLookup = (table) => {
    if (!this.shapes.has(table)) {
      const cols = this.columns(table);
      if (cols.length) this.shapes.set(table, { columns: cols.map((c) => c.name), pk: cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name) });
    }
    return this.shapes.get(table);
  };

  private translated(sql: string): string {
    let t = this.cache.get(sql);
    if (t === undefined) { t = translateQuery(sql, this.lookup); this.cache.set(sql, t); }
    return t;
  }

  prepare(sql: string): SqlStatement {
    const text = this.translated(sql);
    const touched = /^\s*(?:DELETE\s+FROM|UPDATE)\s+"?(\w+)/i.exec(sql)?.[1];
    const exec = (params: unknown[]) => (this.enter(), this.check(this.bridge.call({ sql: text, params: params.map(toParam) }), sql));
    return {
      get: (...p) => { const r = exec(p).rows[0]; return r ? fixRow(r) : undefined; },
      all: (...p) => exec(p).rows.map(fixRow),
      run: (...p): RunResult => { const changes = exec(p).changes; if (changes && touched) this.erased.add(touched); return { changes }; },
    };
  }

  /** several statements, no parameters (DDL in migrations); SQLite types become Postgres types */
  exec(sql: string) {
    this.enter();
    this.check(this.bridge.call({ sql: translateDdl(sql) }), sql);
    this.shapes.clear(); this.cache.clear(); // a table may have changed shape
  }

  transaction<F extends (...params: any[]) => unknown>(fn: F): Transaction<F> {
    return ((...args: Parameters<F>) => {
      const sp = `sp_${this.depth}`;
      this.query(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      this.depth++;
      try {
        const out = fn(...args) as ReturnType<F>;
        this.depth--;
        this.query(this.depth === 0 ? 'COMMIT' : `RELEASE SAVEPOINT ${sp}`);
        return out;
      } catch (e) {
        this.depth--;
        try { this.query(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${sp}`); } catch { /* the original error matters more */ }
        throw e;
      }
    }) as unknown as Transaction<F>;
  }

  tables(): string[] {
    return this.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name", [this.schema])
      .map((r) => r.name as string);
  }

  columns(table: string): Column[] {
    const cols = this.query(`SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_default AS dflt
      FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name <> 'rowid' ORDER BY ordinal_position`, [this.schema, table]);
    const pk = this.query(`SELECT k.column_name AS name, k.ordinal_position AS pos FROM information_schema.table_constraints c
      JOIN information_schema.key_column_usage k ON k.constraint_name = c.constraint_name AND k.constraint_schema = c.constraint_schema AND k.table_name = c.table_name
      WHERE c.constraint_type = 'PRIMARY KEY' AND c.table_schema = $1 AND c.table_name = $2`, [this.schema, table]);
    const pos = new Map(pk.map((r) => [r.name as string, Number(r.pos)]));
    return cols.map((c) => ({ name: c.name as string, type: String(c.type).toUpperCase(), notnull: c.nullable === 'NO', dflt: (c.dflt as string | null) ?? null, pk: pos.get(c.name as string) ?? 0 }));
  }

  parents(table: string): string[] {
    return [...new Set(this.query(`SELECT DISTINCT ccu.table_name AS t FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2`, [this.schema, table]).map((r) => r.t as string))];
  }

  readonly backupExt = '.jsonl.gz';
  /** a portable dump of every table (sql/dump.ts): readable back into Postgres or SQLite */
  async backupTo(file: string): Promise<void> { const { writeDump } = await import('./dump.ts'); await writeDump(this, file); }

  /**
   * Postgres keeps a deleted row's bytes until the table is rewritten. After a permanent delete the touched tables are rewritten
   * (VACUUM FULL), the nearest Postgres has to SQLite's secure_delete. Copies already in the host's own backups are outside the
   * app's reach (as with the daily backups on the disk); docs/deploy.md says so.
   */
  flushErased(tables?: string[]) {
    if (this.depth > 0) return; // VACUUM cannot run inside a transaction; the caller flushes after it
    for (const t of tables ?? [...this.erased]) this.query(`VACUUM (FULL) "${t.replace(/"/g, '')}"`);
    this.erased.clear();
  }

  /** the forgotten caches of table shapes (after the schema changed under this adapter) */
  forgetShapes() { this.shapes.clear(); this.cache.clear(); }

  close() {
    if (--this.bridge.users > 0) return;
    try { this.bridge.call({ op: 'end' }); } catch { /* already gone */ }
    this.bridge.terminate();
    PostgresDatabase.bridges.delete(this.url);
  }
}

/** values cross to the worker by structured clone; what `pg` would not take is made explicit */
function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return v.toString();
  return v;
}
