import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';

export const DEFAULT_DB_PATH = process.env.MABDA_DB_PATH ?? path.join(process.cwd(), 'server', 'data', 'mabda.sqlite');

export function openDatabase(file: string = DEFAULT_DB_PATH): Database.Database {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // an erased row is overwritten with zeros (not just unlinked): «حذف دائمی» must not leave the words in the file
  db.pragma('secure_delete = ON');
  migrate(db);
  return db;
}
