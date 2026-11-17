/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// first: .env must be read before any module reads process.env (the database path is read at import)
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp, proxyHopsFrom } from './server/app.ts';
import { DEFAULT_DB_PATH, databaseUrl, openDatabase } from './server/db/database.ts';
import { resolveAuthMode } from './server/auth/http.ts';
import { backupDirFor, restoreIfAsked, restoreIntoIfAsked, restoresIntoOpenDatabase, scheduleDailyBackups } from './server/backup.ts';
import { decommissionLegacyByok } from './server/ai/decommission.ts';


const removedLegacyCredentials = decommissionLegacyByok();
if (removedLegacyCredentials) console.info('[ai] removed retired personal-key vault files');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// sign-in: production refuses to start without MABDA_OWNER_CODE (docs/deploy.md)
const auth = resolveAuthMode(process.env);
if ('fatal' in auth) { console.error(`[auth] ${auth.fatal}`); process.exit(1); }

// which engine holds the data is one setting: DATABASE_URL = Postgres, otherwise SQLite on the disk (server/db/database.ts)
const onPostgres = !!databaseUrl();
const restoreAfterOpen = restoresIntoOpenDatabase(process.env, onPostgres);

// SQLite: a .sqlite backup named in MABDA_RESTORE_FROM replaces the database file once, before it is opened
if (!restoreAfterOpen) {
  const restore = restoreIfAsked(DEFAULT_DB_PATH);
  if (restore.error) { console.error(`[backup] ${restore.error}`); process.exit(1); }
  if (restore.restored) console.log(`[backup] restored the database from ${restore.restored}`);
}

const db = openDatabase();
console.log(`[db] ${db.dialect === 'postgres' ? 'Postgres (DATABASE_URL)' : `SQLite (${DEFAULT_DB_PATH})`}`);

// otherwise the same setting loads a dump — or, on Postgres, an old SQLite file (the move) — once, into the open database
if (restoreAfterOpen) {
  const restore = await restoreIntoIfAsked(db);
  if (restore.error) { console.error(`[backup] ${restore.error}`); process.exit(1); }
  if (restore.restored) console.log(`[backup] restored ${restore.rows} rows from ${restore.restored}`);
}

const backupDir = backupDirFor(DEFAULT_DB_PATH);
if (process.env.NODE_ENV === 'production' || process.env.MABDA_BACKUP_DIR) scheduleDailyBackups(db, backupDir);
const publicOrigin = process.env.MABDA_PUBLIC_URL?.trim() || undefined;
const { app, aiSessions } = createApp(db, { auth, backupDir, publicOrigin, proxyHops: proxyHopsFrom(process.env.MABDA_PROXY_HOPS) });
console.log(`[auth] ${auth.mode === 'invite' ? 'invite mode: every person signs in with their own link' : 'local mode: one person on this computer'}`);

/** At start-up, verify the configured model ids against the managed key's model list. Never guesses. */
async function verifyManagedModels() {
  if (!aiSessions.managedEnabled) {
    console.log('[ai] managed AI is OFF (MABDA_MANAGED_AI). Platform AI requests are disabled.');
    return;
  }
  if (!aiSessions.managedKeyValid) {
    console.warn('[ai] MABDA_MANAGED_AI is on but GEMINI_API_KEY is missing/invalid.');
    return;
  }
  try {
    const s = await aiSessions.resolve('__startup__');
    for (const t of ['cheap', 'balanced', 'frontier'] as const) console.log(`[ai] ${t} -> ${s.modelFor(t)} (${s.verification.verified[t] ? 'verified' : 'UNVERIFIED'})`);
    for (const w of s.verification.warnings) console.warn(`[ai] warning: ${w}`);
  } catch (e) {
    console.warn('[ai] could not verify models:', (e as Error).message);
  }
}

// Development mode with Vite middlewares OR Production static serving
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  await verifyManagedModels();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mabda server is running at http://0.0.0.0:${PORT} [mode: ${isDev ? 'dev' : 'prod'}]`);
  });
}

startServer();
