import express from 'express';
import type { Request, Response } from 'express';
import type { SqlLike } from './db/sql/types.ts';
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
import { ActivityLog } from './activity.ts';
import { isSampleNote, isSeededSpaceId } from './db/sampleIds.ts';
import { lifeSampleOf } from './db/lifeSample/index.ts';

export interface AppOptions {
  sessions?: SessionResolver; service?: AiService; clock?: () => Date; admin?: boolean;
  /** sign-in (server/auth/http.ts); default: the one local user */
  auth?: AuthMode;
  /** the address people open (optional; otherwise the request's own host): used for the CSRF check and invite links */
  publicOrigin?: string;
  /** where the whole-database backups live (none for an in-memory database) */
  backupDir?: string;
  /** how many proxies stand in front of the server (default 1: Render's). A CDN in front adds one; a wrong number makes every
   *  visitor look like one address, so the sign-in limit would lock everyone out at once (`MABDA_PROXY_HOPS`) */
  proxyHops?: number;
}

/** `MABDA_PROXY_HOPS`: a whole number 1..5; anything else means the default 1 */
export const proxyHopsFrom = (v: string | undefined): number => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1; };

/** Wires sign-in, storage and the (frozen) AI. `opts` lets tests inject a mock-backed AiService / session resolver and the auth mode. */
export function createApp(db: SqlLike, opts: AppOptions = {}) {
  const app = express();
  const mode: AuthMode = opts.auth ?? { mode: 'local' };
  // the host's proxy terminates HTTPS: trust exactly the proxies in front (Render: one), so req.ip / req.secure are the visitor's
  app.set('trust proxy', opts.proxyHops ?? 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // the host's health check: no data, no sign-in
  app.get('/healthz', (_req, res) => { res.type('text/plain').send('ok'); });
  // 10 MB for every request; a workspace restore brings its own, larger limit (server/db/routes/backup.ts)
  const json = express.json({ limit: '10mb' });
  app.use((req, res, next) => (req.path === '/api/backup/restore' ? next() : json(req, res, next)));
  const repo = new Repo(db);
  const errors = new ErrorLog(db, opts.clock);
  // the user-test record (server/activity.ts, docs/test-data.md): one row per changing request, written when its answer goes out
  const activity = new ActivityLog(db, opts.clock, (userId, wid, itemId) => {
    const out: Record<string, boolean> = {};
    try {
      const s = { userId, workspaceId: wid };
      if (repo.getWorkspace(userId, wid)?.isDemo || lifeSampleOf(repo, userId)?.id === wid) out.sample = true;
      if (isSeededSpaceId(wid)) out.seededSpace = true;
      if (itemId) {
        // the same rule the screen shows (server/db/sampleIds.ts): an example written over is hers, in the UI and in the measures
        const obj = repo.getObjectAny(s, itemId);
        const thought = obj ? undefined : repo.getThought(s, itemId);
        const note = obj || thought ? undefined : repo.getNote(s, itemId);
        if (obj ? obj.provenance === 'Sample' : thought ? isSampleNote(thought.sourceNoteId ? repo.getNote(s, thought.sourceNoteId) : undefined) : isSampleNote(note)) out.sampleItem = true;
      }
    } catch { /* unknown: recorded without it */ }
    return out;
  });
  app.use('/api', activity.middleware());
  const { accounts } = installAuth(app, db, mode, { clock: opts.clock, publicOrigin: opts.publicOrigin });

  // screens, dialogs and visits from the browser (src/services/activity.ts): signed-in only, at most 60 batches a minute per person
  app.post('/api/activity', rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.mabdaUser?.id ?? req.ip ?? '' }), (req, res) => {
    // nothing before the person has accepted the notice that says it is recorded (src/core/ownerNotice.ts)
    if (req.mabdaUser && !req.mabdaUser.consented) return void res.json({ ok: true, recorded: 0 });
    res.json({ ok: true, recorded: activity.recordUi(userIdOf(req), req.get('x-mabda-session') ?? undefined, req.body ?? {}) });
  });

  // error reports from the browser (src/app/shell/errorReport.ts): signed-in only, at most 20 a minute per person
  app.post('/api/client-errors', rateLimit({ windowMs: 60_000, max: 20, key: (req) => req.mabdaUser?.id ?? req.ip ?? '' }), (req, res) => {
    // Error reports are telemetry too: acknowledge pre-consent reports, but persist nothing.
    if (req.mabdaUser && !req.mabdaUser.consented) return void res.json({ ok: true, recorded: false });
    errors.record(userIdOf(req), 'client', req.body ?? {});
    res.json({ ok: true, recorded: true });
  });
  app.use('/api/owner', createOwnerRouter({ db, mode, accounts, errors, activity, backupDir: opts.backupDir, publicOrigin: opts.publicOrigin }));

  let aiRef: AiService | undefined;
  const files = new FileService(repo, (userId, req) => aiRef!.extract(userId, req), opts.clock);
  // the AI's context is always read for the person making the request (before: one fixed local person, safe only because AI
  // runs in the local mode alone; now a wrong person's knowledge cannot reach a prompt even if that ever changes)
  const sourceFor = (userId: string) => createContextSource(repo, files, userId, opts.clock ?? (() => new Date()));
  const ai = createAiRouter({ sourceFor, sessions: opts.sessions, service: opts.service });
  aiRef = ai.service;

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

  return { app, repo, files, aiSessions: ai.sessions, accounts, errors, activity };
}
