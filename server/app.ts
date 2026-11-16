import express from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { adminEnabled, createAiRouter } from './ai/routes.ts';
import type { AiService } from './ai/service.ts';
import type { SessionResolver } from './ai/session.ts';
import { createDataRouter } from './db/routes.ts';
import { createContextSource } from './db/aiContext.ts';
import { Repo } from './db/repo.ts';
import { FileService } from './files/service.ts';
import { installAuth, rateLimit, securityHeaders, userIdOf } from './auth/http.ts';
import type { AuthMode } from './auth/http.ts';
import { createOwnerRouter } from './auth/owner.ts';
import { ErrorLog } from './diagnostics.ts';

export interface AppOptions {
  sessions?: SessionResolver; service?: AiService; clock?: () => Date; admin?: boolean;
  /** sign-in (server/auth/http.ts); default: the one local user */
  auth?: AuthMode;
  /** the address people open (optional; otherwise the request's own host): used for the CSRF check and invite links */
  publicOrigin?: string;
  /** where the whole-database backups live (none for an in-memory database) */
  backupDir?: string;
}

/** Wires sign-in, storage and the (frozen) AI. `opts` lets tests inject a mock-backed AiService / session resolver and the auth mode. */
export function createApp(db: Database.Database, opts: AppOptions = {}) {
  const app = express();
  const mode: AuthMode = opts.auth ?? { mode: 'local' };
  // the host's proxy terminates HTTPS: trust exactly one hop, so req.ip / req.secure are the visitor's
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // the host's health check: no data, no sign-in
  app.get('/healthz', (_req, res) => { res.type('text/plain').send('ok'); });
  // 10 MB for every request; a workspace restore brings its own, larger limit (server/db/routes/backup.ts)
  const json = express.json({ limit: '10mb' });
  app.use((req, res, next) => (req.path === '/api/backup/restore' ? next() : json(req, res, next)));
  const repo = new Repo(db);
  const errors = new ErrorLog(db, opts.clock);
  const { accounts } = installAuth(app, db, mode, { clock: opts.clock, publicOrigin: opts.publicOrigin });

  // error reports from the browser (src/app/shell/errorReport.ts): signed-in only, at most 20 a minute per person
  app.post('/api/client-errors', rateLimit({ windowMs: 60_000, max: 20, key: (req) => req.mabdaUser?.id ?? req.ip ?? '' }), (req, res) => {
    errors.record(userIdOf(req), 'client', req.body ?? {});
    res.json({ ok: true });
  });
  app.use('/api/owner', createOwnerRouter({ db, mode, accounts, errors, backupDir: opts.backupDir, publicOrigin: opts.publicOrigin }));

  let aiRef: AiService | undefined;
  let sessionsRef = (): SessionResolver => { throw new Error('sessions not ready'); };
  const files = new FileService(repo, (userId, req) => aiRef!.extract(userId, req), opts.clock, { managed: () => sessionsRef().managedEnabled });
  // the AI's context is always read for the person making the request (before: one fixed local person, safe only because AI
  // runs in the local mode alone; now a wrong person's knowledge cannot reach a prompt even if that ever changes)
  const sourceFor = (userId: string) => createContextSource(repo, files, userId, opts.clock ?? (() => new Date()));
  const ai = createAiRouter({ sourceFor, sessions: opts.sessions, service: opts.service });
  aiRef = ai.service;
  sessionsRef = () => ai.sessions;

  if (mode.mode === 'invite') {
    // Generative AI is frozen and not part of the product; its routes were built for one user. With several people only the
    // status answer stays (the UI reads it to hide AI); every other AI route is closed.
    app.use('/api/ai', (req, res, next) => {
      if (req.path === '/status') return next();
      res.status(503).json({ error: { kind: 'disabled', message: 'این قابلیت در این نسخه نیست.', retryable: false } });
    });
  }
  app.use('/api/ai', ai.router);
  const onServerError = (req: Request, err: unknown) => {
    const e = err as { name?: string; message?: string; stack?: string };
    try { errors.record(req.mabdaUser?.id ?? 'unknown', 'server', { name: e?.name, message: e?.message, stack: e?.stack, path: req.baseUrl + req.path }); } catch { /* reporting must never fail a request twice */ }
  };
  app.use('/api', createDataRouter({ repo, ai: ai.service, files, sourceFor, admin: adminEnabled() || opts.admin, clock: opts.clock, onServerError }).router);

  /** Health check (does not call any model). */
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', managedAi: ai.sessions.managedEnabled, timestamp: new Date().toISOString() });
  });

  return { app, repo, files, aiSessions: ai.sessions, accounts, errors };
}
