import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { migrate } from './migrations.ts';
import { Repo } from './repo.ts';
import { createDataRouter } from './routes.ts';
import type { AiService } from '../ai/service.ts';

/**
 * The API surface is a contract: every route (method + path) and every middleware, IN THE ORDER they are registered (Express matches in
 * order, so the order is part of the behaviour). The list below was recorded from the single-file routes.ts before it was split into
 * server/db/routes/*; a split (or any later refactor) must keep it identical. A change on purpose: run with UPDATE_ROUTES=1 and review the diff.
 */
const FILE = new URL('./routes.manifest.json', import.meta.url);

function manifest(): string[] {
  const db = new Database(':memory:');
  migrate(db);
  const { router } = createDataRouter({ repo: new Repo(db), ai: {} as AiService });
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> }; name: string; handle: { length: number } }> }).stack;
  return stack.map((l) => (l.route ? `${Object.keys(l.route.methods).map((m) => m.toUpperCase()).join(',')} ${l.route.path}` : `use:${l.name}:${l.handle.length}`));
}

test('the API route list (method + path + middleware, in registration order) is unchanged', () => {
  const now = manifest();
  if (process.env.UPDATE_ROUTES || !existsSync(FILE)) { writeFileSync(FILE, `${JSON.stringify(now, null, 1)}\n`); return; }
  const before = JSON.parse(readFileSync(FILE, 'utf8')) as string[];
  assert.deepEqual(now, before);
  assert.ok(now.length >= 100, `${now.length} routes`);
});
