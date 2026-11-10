/**
 * The data API (everything under /api that is not the AI routes). The routes live in server/db/routes/*, one file per concern;
 * this file only builds the shared context, registers them IN THE ORIGINAL ORDER and adds the error handler last.
 * The route list (method + path + middleware + order) is a tested contract: server/db/routes.manifest.test.ts.
 */
import type { Router } from 'express';
import type { FileService } from '../files/service.ts';
import { makeRouteContext } from './routes/context.ts';
import type { DataRouterDeps } from './routes/context.ts';
import { registerBootstrapRoutes } from './routes/bootstrap.ts';
import { registerDemoRoutes } from './routes/demo.ts';
import { registerNodesRoutes } from './routes/nodes.ts';
import { registerArchiveRoutes } from './routes/archive.ts';
import { registerAccountRoutes } from './routes/account.ts';
import { registerObjectsRoutes } from './routes/objects.ts';
import { registerCanvasRoutes } from './routes/canvas.ts';
import { registerNotesThoughtsRoutes } from './routes/notes-thoughts.ts';
import { registerMetricsRoutes } from './routes/metrics.ts';
import { registerOutputsRoutes } from './routes/outputs.ts';
import { registerJudgmentsRoutes } from './routes/judgments.ts';
import { registerMemoryRoutes } from './routes/memory.ts';
import { registerThreadsRoutes } from './routes/threads.ts';
import { registerContradictionsRoutes } from './routes/contradictions.ts';
import { registerStartersRoutes } from './routes/starters.ts';
import { registerSavedPacksRoutes } from './routes/saved-packs.ts';
import { registerPacksRoutes } from './routes/packs.ts';
import { registerUsageRoutes } from './routes/usage.ts';
import { registerFilesRoutes } from './routes/files.ts';
import { toAiError } from '../ai/errors.ts';
import { FileExtractError } from '../files/extract.ts';
import { RepoError } from './repo.ts';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

export { LOCAL_USER, ACCOUNT_WIPE_WORDS } from './routes/context.ts';
export type { DataRouterDeps } from './routes/context.ts';

export function createDataRouter(deps: DataRouterDeps): { router: Router; files: FileService } {
  const ctx = makeRouteContext(deps);
  const { router, files } = ctx;
  registerBootstrapRoutes(ctx);
  registerDemoRoutes(ctx);
  registerNodesRoutes(ctx);
  registerArchiveRoutes(ctx);
  registerAccountRoutes(ctx);
  registerObjectsRoutes(ctx);
  registerCanvasRoutes(ctx);
  registerNotesThoughtsRoutes(ctx);
  registerMetricsRoutes(ctx);
  registerOutputsRoutes(ctx);
  registerJudgmentsRoutes(ctx);
  registerMemoryRoutes(ctx);
  registerThreadsRoutes(ctx);
  registerContradictionsRoutes(ctx);
  registerStartersRoutes(ctx);
  registerSavedPacksRoutes(ctx);
  registerPacksRoutes(ctx);
  registerUsageRoutes(ctx);
  registerFilesRoutes(ctx);

  // ── errors ───────────────────────────────────────────────────────────
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RepoError) return void res.status(err.code === 'not_found' ? 404 : err.code === 'forbidden' ? 403 : 400).json({ error: { code: err.code, message: err.message } });
    if (err instanceof FileExtractError) return void res.status(422).json({ error: { code: 'unreadable', message: err.message } });
    if (err instanceof multer.MulterError) return void res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: err.code, message: err.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل بیشتر از ۲۵ مگابایت است.' : 'ارسال فایل نامعتبر بود.' } });
    const a = toAiError(err);
    res.status(a.kind === 'bad_request' ? 400 : a.kind === 'quota' ? 429 : a.kind === 'disabled' ? 503 : 502).json({ error: a.toInfo() });
  });


  return { router, files };
}
