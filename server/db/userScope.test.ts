import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * DB-PG-03 at the level of every statement: each SQL statement that reads, changes or deletes a person's rows names `user_id`.
 * The route checks the workspace belongs to the signed-in person first (scopeOf); this is the second wall, so a bug in one route
 * (or a reused id) can never reach another person's rows. It also holds for code written later: a new statement without
 * `user_id` fails here until it is fixed or explained in ALLOWED below.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const FILES = [
  ...fs.readdirSync(path.join(ROOT, 'db/repo')).map((f) => `db/repo/${f}`),
  'db/removal.ts', 'db/aiContext.ts', 'db/aiRequests.ts', 'db/workspaceBackup.ts', 'db/demo.ts', 'db/legacy.ts',
  'files/service.ts', 'docimport/service.ts', 'intelligence/store.ts', 'intelligence/embeddingStore.ts', 'intelligence/callLog.ts',
].filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && fs.existsSync(path.join(ROOT, f)));

/** statements that do not touch one person's rows, each with its reason */
const ALLOWED: Array<[RegExp, string]> = [
  [/sqlite_master|PRAGMA/i, 'reads the schema, not rows'],
  [/file_chunks WHERE file_id NOT IN \(SELECT id FROM files\)/, 'removes chunks whose file no longer exists (orphans of nobody)'],
  [/^SELECT 1 FROM workspaces WHERE id = \?$/, 'is this workspace id taken by anyone? (ids are global; the owner is checked right after)'],
  [/^SELECT 1 FROM context_objects WHERE id = \?$/, 'is this object id taken by anyone? (an import never overwrites: a taken id is skipped)'],
  [/^SELECT user_id, workspace_id FROM \$\{/, 'who owns this id? (the cross-person write guard itself)'],
];

const sqlOf = (src: string): string[] => {
  const out: string[] = [];
  // db.prepare('…') and the small helpers that wrap it (removal.ts: rows(repo, '…'), count('…'))
  const re = /(?:\.prepare|\brows(?:<[^>]*>)?\(repo,|\bcount)\(?\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1].slice(1, -1).replace(/\s+/g, ' ').trim());
  return out;
};

test('every SQL statement on people\'s rows names user_id (or is explained)', () => {
  const missing: string[] = [];
  let seen = 0;
  for (const f of FILES) {
    for (const sql of sqlOf(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
      if (!/\b(SELECT|UPDATE|DELETE|INSERT)\b/i.test(sql)) continue;
      seen++;
      if (/\buser_id\b/.test(sql)) continue;
      if (/\$\{where/.test(sql)) continue; // built from a `where` list that always starts with user_id (checked below)
      if (ALLOWED.some(([re]) => re.test(sql))) continue;
      missing.push(`${f}: ${sql.slice(0, 140)}`);
    }
  }
  assert.ok(seen > 150, `found only ${seen} statements: the scan is broken`);
  assert.deepEqual(missing, []);
});

test('statements built from a where-list start the list with user_id', () => {
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/const where(?:: string\[\])? = \[([^\]]*)\]/g)) assert.match(m[1], /user_id/, `${f}: ${m[0]}`);
  }
});
