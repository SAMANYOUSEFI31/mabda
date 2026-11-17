import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { migrate } from './migrations.ts';
import { SqliteDatabase } from './sql/sqlite.ts';
import { PostgresDatabase } from './sql/postgres.ts';
import type { SqlDatabase } from './sql/types.ts';

export type { SqlDatabase } from './sql/types.ts';

export const DEFAULT_DB_PATH = process.env.MABDA_DB_PATH || path.join(process.cwd(), 'server', 'data', 'mabda.sqlite');

/**
 * Which engine holds the data is one setting, read here and nowhere else:
 *   DATABASE_URL=postgres://…  → Postgres (any provider; add `?sslmode=require` for an encrypted link)
 *   otherwise                   → SQLite in MABDA_DB_PATH (a file on the disk)
 * Goal: the hosting choice (Render, an Iranian host, a VPS) stays open; moving is a setting, not a code change.
 */
export const databaseUrl = (env: NodeJS.ProcessEnv = process.env): string | undefined => env.DATABASE_URL?.trim() || undefined;

export function openDatabase(file: string = DEFAULT_DB_PATH, env: NodeJS.ProcessEnv = process.env): SqlDatabase {
  // test runs: `MABDA_TEST_DATABASE_URL` sends every in-memory test database to its own fresh Postgres schema
  const testUrl = env.MABDA_TEST_DATABASE_URL?.trim();
  if (file === ':memory:' && testUrl) return migrated(new PostgresDatabase(testUrl, { schema: `t_${crypto.randomBytes(6).toString('hex')}` }));
  const url = file === DEFAULT_DB_PATH ? databaseUrl(env) : undefined;
  if (url) return migrated(new PostgresDatabase(url));
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  return migrated(SqliteDatabase.open(file));
}

function migrated<T extends SqlDatabase>(db: T): T { migrate(db); return db; }
