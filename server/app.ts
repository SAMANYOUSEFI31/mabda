import express from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { adminEnabled, createAiRouter } from './ai/routes.ts';
import type { AiService } from './ai/service.ts';
import type { SessionResolver } from './ai/session.ts';
import { createDataRouter, LOCAL_USER } from './db/routes.ts';
import { createContextSource } from './db/aiContext.ts';
import { Repo } from './db/repo.ts';
import { createMcpRouter } from './mcp/router.ts';
import { FileService } from './files/service.ts';

/** Wires storage + AI. `aiOptions` lets tests inject a mock-backed AiService / session resolver. */
export function createApp(db: Database.Database, aiOptions: { sessions?: SessionResolver; service?: AiService; clock?: () => Date; admin?: boolean } = {}) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const repo = new Repo(db);

  let aiRef: AiService | undefined;
  let sessionsRef = (): SessionResolver => { throw new Error('sessions not ready'); };
  const files = new FileService(repo, (aiUser, req) => aiRef!.extract(aiUser, req), aiOptions.clock, { managed: () => sessionsRef().managedEnabled, payer: () => sessionsRef().platformPayer() });
  const source = createContextSource(repo, files, LOCAL_USER);
  const ai = createAiRouter({ source, sessions: aiOptions.sessions, service: aiOptions.service });
  aiRef = ai.service;
  sessionsRef = () => ai.sessions;

  app.use('/mcp', createMcpRouter({ repo }));
  app.use('/api/ai', ai.router);
  app.use('/api', createDataRouter({ repo, ai: ai.service, files, source, payer: () => ai.sessions.platformPayer(), admin: adminEnabled() || aiOptions.admin, clock: aiOptions.clock }).router);

  /** Health check (does not call any model). */
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', managedAi: ai.sessions.managedEnabled, timestamp: new Date().toISOString() });
  });

  return { app, repo, files, aiSessions: ai.sessions };
}
