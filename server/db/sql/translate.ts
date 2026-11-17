/**
 * SQLite-flavoured SQL → Postgres SQL, for the few forms the code uses that the two engines spell differently.
 *
 * Goal: one SQL text in the code, correct on both engines. Check: `translate.test.ts` for each form, and the whole suite on Postgres.
 * Only these forms are translated; anything else must already be portable (docs/architecture.md → قاعدهٔ SQL قابل‌حمل):
 *   `?`                         → `$1, $2, …`   (outside quotes and comments)
 *   `INSERT OR IGNORE INTO …`   → `INSERT INTO … ON CONFLICT DO NOTHING`
 *   `INSERT OR REPLACE INTO t (cols) VALUES (…)` → an upsert on t's primary key that also resets the columns not listed, which is
 *     what SQLite's REPLACE (delete, then insert) does
 * DDL types: INTEGER → BIGINT (ids in milliseconds and byte counts outgrow 32 bits), REAL → DOUBLE PRECISION, BLOB → BYTEA.
 */

export interface TableShape { columns: string[]; pk: string[] }
export type SchemaLookup = (table: string) => TableShape | undefined;

/** walks the text and hands every piece outside quotes/comments to `fn` (quoted pieces are kept as they are) */
function mapCode(sql: string, fn: (code: string) => string): string {
  let out = '', code = '', i = 0;
  const flush = () => { out += fn(code); code = ''; };
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      flush();
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; } j++; }
      out += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '-' && sql[i + 1] === '-') { flush(); const j = sql.indexOf('\n', i); const end = j < 0 ? sql.length : j; out += sql.slice(i, end); i = end; continue; }
    if (c === '/' && sql[i + 1] === '*') { flush(); const j = sql.indexOf('*/', i + 2); const end = j < 0 ? sql.length : j + 2; out += sql.slice(i, end); i = end; continue; }
    code += c; i++;
  }
  flush();
  return out;
}

export function numberPlaceholders(sql: string): string {
  let n = 0;
  return mapCode(sql, (code) => code.replace(/\?/g, () => `$${++n}`));
}

const REPLACE = /^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+("?)(\w+)\1\s*\(([^)]*)\)/i;
const IGNORE = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i;

export function translateQuery(sql: string, schema: SchemaLookup): string {
  let out = sql;
  const rep = REPLACE.exec(out);
  if (rep) {
    const table = rep[2];
    const shape = schema(table);
    if (!shape || !shape.pk.length) throw new Error(`INSERT OR REPLACE: no primary key known for ${table}`);
    const listed = rep[3].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const set = shape.columns.filter((c) => !shape.pk.includes(c))
      .map((c) => (listed.includes(c) ? `"${c}" = EXCLUDED."${c}"` : `"${c}" = DEFAULT`));
    out = out.replace(/^\s*INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO').replace(/;\s*$/, '')
      + ` ON CONFLICT (${shape.pk.map((c) => `"${c}"`).join(', ')}) ${set.length ? `DO UPDATE SET ${set.join(', ')}` : 'DO NOTHING'}`;
  } else if (IGNORE.test(out)) {
    out = out.replace(IGNORE, 'INSERT INTO ').replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING';
  }
  return numberPlaceholders(out);
}

/** DDL written for SQLite (migrations, the schema of a fresh SQLite) → Postgres */
export function translateDdl(sql: string): string {
  return mapCode(sql, (code) => code
    .replace(/\bINTEGER\b/gi, 'BIGINT')
    .replace(/\bREAL\b/gi, 'DOUBLE PRECISION')
    .replace(/\bBLOB\b/gi, 'BYTEA'));
}

/**
 * `CREATE TRIGGER name AFTER DELETE ON t BEGIN …; END` (SQLite) → a plpgsql function + a row trigger (Postgres).
 * Only the AFTER INSERT/UPDATE/DELETE row form is supported, which is the only form the schema uses.
 */
export function translateTrigger(sql: string): string {
  const m = /CREATE\s+TRIGGER\s+(\w+)\s+(AFTER|BEFORE)\s+(INSERT|UPDATE|DELETE)\s+ON\s+(\w+)\s+BEGIN\s+([\s\S]*?)\s*END\s*;?\s*$/i.exec(sql);
  if (!m) throw new Error(`unsupported trigger: ${sql.slice(0, 80)}`);
  const [, name, when, event, table, body] = m;
  const ret = event.toUpperCase() === 'DELETE' ? 'OLD' : 'NEW';
  return `CREATE OR REPLACE FUNCTION ${name}_fn() RETURNS trigger LANGUAGE plpgsql AS $mabda$ BEGIN ${body.trim()} RETURN ${ret}; END $mabda$;\n`
    + `CREATE TRIGGER ${name} ${when} ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}_fn();`;
}
