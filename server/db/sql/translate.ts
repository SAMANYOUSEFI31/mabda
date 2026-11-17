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
  return numberPlaceholders(sqliteOrder(out));
}

/**
 * ORDER BY as SQLite does it. (1) SQLite puts NULL first going up and last going down; Postgres the opposite — so every term
 * gets NULLS FIRST / NULLS LAST. (2) Rows that tie on every term come out in the order they were written in SQLite (rowid);
 * in Postgres in no fixed order — so a plain single-table SELECT gets the hidden `rowid` as a last tie-break (write order, as
 * SQLite's sorter gives it; where SQLite walks an index backwards its tie order differs and is not promised by SQLite either). Without these, a list of versions, thoughts or changes with equal times could come out in another order.
 */
export function sqliteOrder(sql: string): string {
  const top = /^\s*SELECT\b/i.test(sql) && !/\bJOIN\b|\bGROUP\s+BY\b|\bDISTINCT\b|\bUNION\b|\browid\b/i.test(sql) && /\bFROM\s+"?\w+"?(\s+\w+)?\s*(WHERE|ORDER|LIMIT|$)/i.test(sql);
  let out = '', i = 0;
  const re = /\bORDER\s+BY\s+/gi;
  for (let m = re.exec(sql); m; m = re.exec(sql)) {
    // depth of this ORDER BY: 0 = the statement itself, > 0 = a sub-select
    let depth = 0;
    for (const ch of sql.slice(0, m.index)) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    const start = m.index + m[0].length;
    let j = start, d = 0;
    const terms: string[] = []; let from = start;
    for (; j < sql.length; j++) {
      const ch = sql[j];
      if (ch === '(') d++;
      else if (ch === ')') { if (d === 0) break; d--; }
      else if (ch === ',' && d === 0) { terms.push(sql.slice(from, j)); from = j + 1; }
      else if (d === 0 && /^\s(LIMIT|OFFSET)\b/i.test(sql.slice(j, j + 8))) break;
    }
    terms.push(sql.slice(from, j));
    const fixed = terms.map((t) => {
      const term = t.trim();
      if (/\bNULLS\s+(FIRST|LAST)\b/i.test(term)) return term;
      return /\bDESC$/i.test(term) ? `${term} NULLS LAST` : `${term} NULLS FIRST`;
    });
    if (top && depth === 0) fixed.push('rowid');
    out += sql.slice(i, start) + fixed.join(', ') + (sql.slice(j, j + 1).match(/\S/) ? ' ' : '');
    i = j;
    re.lastIndex = j;
  }
  return out + sql.slice(i);
}

/**
 * DDL written for SQLite (migrations, the schema of a fresh SQLite) → Postgres. Types are written in capitals in the
 * migrations, column names in lower case (`text TEXT`), so only the capitals are types.
 * TEXT compares byte by byte (COLLATE "C"), as SQLite's BINARY does: sorting, `=`, `<`, LIKE and unique keys give the same answer on
 * both engines whatever locale the host's database was created with.
 */
export function translateDdl(sql: string): string {
  return mapCode(sql, (code) => code
    .replace(/\bINTEGER\b/g, 'BIGINT')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
    .replace(/\bBLOB\b/g, 'BYTEA')
    .replace(/\bTEXT\b/g, 'TEXT COLLATE "C"'));
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
