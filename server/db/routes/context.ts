/** Shared context of the route files (server/db/routes/*): see docs/architecture.md → «نقشهٔ پوشه‌ها». */
import { tehranDay } from '../../../src/core/tehranDate.ts';
import type { ContextSource } from '../../ai/routes.ts';
import type { AiService } from '../../ai/service.ts';
import { FileService } from '../../files/service.ts';
import { Repo, RepoError } from '../repo.ts';
import type { ChangeMeta, Scope } from '../repo.ts';
import express from 'express';
import type { NextFunction, Request, Response, Router } from 'express';

import { LOCAL_USER, userIdOf } from '../../auth/http.ts';
/** the one user of the local mode (server/auth/http.ts); in the invite mode every request carries its own signed-in user */
export { LOCAL_USER };
/** the words that must be typed to delete every piece of data (nothing is half-confirmed) */
export const ACCOUNT_WIPE_WORDS = 'حذف همهٔ داده‌ها';

const wrap = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res); } catch (e) { next(e); }
};


export interface DataRouterDeps { repo: Repo; ai: AiService; files?: FileService; /** builds the AI context from the database for one person (thread: only the node + its parents) */ sourceFor?: (userId: string) => ContextSource; admin?: boolean; clock?: () => Date; /** an unexpected fault in a route (reported to the owner, server/diagnostics.ts) */ onServerError?: (req: Request, err: unknown) => void }

/** Everything the route files share: the dependencies, the request helpers and the helpers that more than one route file uses. Built once per router. */
export function makeRouteContext(deps: DataRouterDeps) {
  const { repo, ai } = deps;
  const clock = deps.clock ?? (() => new Date());
  const files = deps.files ?? new FileService(repo, (aiUser, req) => ai.extract(aiUser, req));
  const router = express.Router();
  const scopeOf = (req: Request): Scope => {
    const workspaceId = String(req.params.wid);
    const userId = userIdOf(req);
    // the workspace must be this person's: someone else's id answers exactly like an id that does not exist
    if (!repo.getWorkspace(userId, workspaceId)) throw new RepoError('not_found', 'فضا پیدا نشد.');
    return { userId, workspaceId };
  };
  const body = (req: Request) => (req.body ?? {}) as Record<string, any>;
  const ACTORS = ['user', 'chat', 'coach', 'import', 'system'];
  /** who did it and why, from the optional `change` field of a request (without an explicit actor the repo infers it from the object's source; no source = the user) */
  const metaOf = (b: Record<string, any>, extra: Partial<ChangeMeta> = {}): ChangeMeta => {
    const c = (b.change && typeof b.change === 'object' ? b.change : {}) as Record<string, unknown>;
    const reason = typeof b.reason === 'string' ? b.reason : typeof c.reason === 'string' ? c.reason : undefined;
    return { ...(ACTORS.includes(String(c.actor)) ? { actor: c.actor as ChangeMeta['actor'] } : {}), ...(typeof c.label === 'string' ? { label: c.label.slice(0, 80) } : {}), ...(reason ? { reason: reason.slice(0, 1000) } : {}), ...extra };
  };


  // ── context objects ──────────────────────────────────────────────────
  const stale = (s: Scope) => (repo.impactEnabled(s) ? repo.computeStale(s) : []);

  // ── decision layer: Gap ambiguity (cached per object version), Context Coach (daily cap per plan) ──
  // daily allowances and «today» follow the Tehran day (src/core/tehranDate.ts), not the UTC one
  const today = () => tehranDay(clock());

  return { repo, ai, clock, files, router, scopeOf, body, ACTORS, metaOf, wrap, deps, userOf: userIdOf, ACCOUNT_WIPE_WORDS, stale, today };
}

export type RouteContext = ReturnType<typeof makeRouteContext>;
