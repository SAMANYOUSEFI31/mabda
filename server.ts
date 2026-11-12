/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './server/app.ts';
import { openDatabase } from './server/db/database.ts';
import { resolveAccessGate } from './server/access.ts';
import { decommissionLegacyByok } from './server/ai/decommission.ts';

dotenv.config();

const removedLegacyCredentials = decommissionLegacyByok();
if (removedLegacyCredentials) console.info('[ai] removed retired personal-key vault files');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const access = resolveAccessGate(process.env);
if (access.fatal) { console.error(`[access] ${access.fatal}`); process.exit(1); }

const { app, aiSessions } = createApp(openDatabase(), { gate: access.gate });

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
