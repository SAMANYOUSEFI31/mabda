/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAiRouter } from './server/ai/routes.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

const { router: aiRouter, sessions: aiSessions } = createAiRouter();
app.use('/api/ai', aiRouter);

/** Health check (does not call any model). */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', managedAi: aiSessions.managedEnabled, timestamp: new Date().toISOString() });
});

/** At start-up, verify the configured model ids against the managed key's model list. Never guesses. */
async function verifyManagedModels() {
  if (!aiSessions.managedEnabled) {
    console.log('[ai] managed AI is OFF (MABDA_MANAGED_AI). Users must add their own API key (BYOK).');
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
