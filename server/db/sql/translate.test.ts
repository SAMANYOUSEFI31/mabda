import test from 'node:test';
import assert from 'node:assert/strict';
import { numberPlaceholders, sqliteOrder, translateDdl, translateQuery, translateTrigger } from './translate.ts';

const schema = (t: string) => (t === 'notes' ? { columns: ['id', 'user_id', 'content', 'source_file_id'], pk: ['id'] } : t === 'kv' ? { columns: ['user_id', 'key', 'value'], pk: ['user_id', 'key'] } : undefined);

test('placeholders are numbered outside quotes and comments only', () => {
  assert.equal(numberPlaceholders("SELECT * FROM t WHERE a = ? AND b = '?' AND c = ? -- ?\n AND d = ?"), "SELECT * FROM t WHERE a = $1 AND b = '?' AND c = $2 -- ?\n AND d = $3");
  assert.equal(numberPlaceholders(`SELECT "a?" FROM t WHERE x LIKE '%it''s?%' AND y = ?`), `SELECT "a?" FROM t WHERE x LIKE '%it''s?%' AND y = $1`);
});

test('INSERT OR IGNORE becomes ON CONFLICT DO NOTHING', () => {
  assert.equal(translateQuery('INSERT OR IGNORE INTO kv (user_id, key, value) VALUES (?,?,?)', schema), 'INSERT INTO kv (user_id, key, value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING');
});

test('INSERT OR REPLACE becomes an upsert on the primary key that also resets the columns not listed (what REPLACE does)', () => {
  assert.equal(translateQuery('INSERT OR REPLACE INTO notes (id, user_id, content) VALUES (?,?,?)', schema),
    'INSERT INTO notes (id, user_id, content) VALUES ($1,$2,$3) ON CONFLICT ("id") DO UPDATE SET "user_id" = EXCLUDED."user_id", "content" = EXCLUDED."content", "source_file_id" = DEFAULT');
  assert.match(translateQuery('INSERT OR REPLACE INTO kv (user_id, key, value) VALUES (?, ?, ?)', schema), /ON CONFLICT \("user_id", "key"\) DO UPDATE SET "value" = EXCLUDED."value"$/);
  assert.throws(() => translateQuery('INSERT OR REPLACE INTO nope (a) VALUES (?)', schema), /no primary key/);
});

test('DDL types and triggers', () => {
  assert.equal(translateDdl("CREATE TABLE t (n INTEGER NOT NULL, r REAL, b BLOB, text TEXT DEFAULT 'INTEGER')"), `CREATE TABLE t (n BIGINT NOT NULL, r DOUBLE PRECISION, b BYTEA, text TEXT COLLATE "C" DEFAULT 'INTEGER')`);
  const pg = translateTrigger('CREATE TRIGGER trg_x AFTER DELETE ON files\n BEGIN\n DELETE FROM e WHERE id = OLD.id;\n END');
  assert.match(pg, /CREATE OR REPLACE FUNCTION trg_x_fn\(\) RETURNS trigger LANGUAGE plpgsql AS \$mabda\$ BEGIN DELETE FROM e WHERE id = OLD.id; RETURN OLD; END \$mabda\$;/);
  assert.match(pg, /CREATE TRIGGER trg_x AFTER DELETE ON files FOR EACH ROW EXECUTE FUNCTION trg_x_fn\(\);/);
});

test('ORDER BY as SQLite: NULL first going up, last going down; ties in write order on a plain single-table read', () => {
  assert.equal(sqliteOrder('SELECT * FROM notes WHERE a = ? ORDER BY created_at DESC LIMIT ?'), 'SELECT * FROM notes WHERE a = ? ORDER BY created_at DESC NULLS LAST, rowid LIMIT ?');
  assert.equal(sqliteOrder('SELECT * FROM thoughts WHERE a = ? ORDER BY source_line,id'), 'SELECT * FROM thoughts WHERE a = ? ORDER BY source_line NULLS FIRST, id NULLS FIRST, rowid');
  // a sub-select keeps its LIMIT and gets no tie-break; a join gets none either (rowid would be ambiguous)
  assert.equal(sqliteOrder('DELETE FROM e WHERE at < (SELECT at FROM e ORDER BY at DESC LIMIT 1 OFFSET ?)'), 'DELETE FROM e WHERE at < (SELECT at FROM e ORDER BY at DESC NULLS LAST LIMIT 1 OFFSET ?)');
  assert.equal(sqliteOrder('SELECT c.t FROM a c JOIN b f ON f.id = c.id ORDER BY c.x'), 'SELECT c.t FROM a c JOIN b f ON f.id = c.id ORDER BY c.x NULLS FIRST');
  assert.equal(sqliteOrder('SELECT MAX(v) AS v FROM m'), 'SELECT MAX(v) AS v FROM m');
});
