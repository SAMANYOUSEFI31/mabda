/** Shared context of the route files (server/db/routes/*): see docs/architecture.md → «نقشهٔ پوشه‌ها». */
import type { ContextSource } from '../../ai/routes.ts';
import type { AiService } from '../../ai/service.ts';
import { FileService } from '../../files/service.ts';
import { Repo, RepoError } from '../repo.ts';
import type { ChangeMeta, Scope } from '../repo.ts';
import express from 'express';
import type { NextFunction, Request, Response, Router } from 'express';

/** One local user until real accounts exist. Every table already carries user_id + workspace_id. */
export const LOCAL_USER = 'local';
/** the words that must be typed to delete every piece of data (nothing is half-confirmed) */
export const ACCOUNT_WIPE_WORDS = 'حذف همهٔ داده‌ها';

const wrap = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res); } catch (e) { next(e); }
};


export interface DataRouterDeps { repo: Repo; ai: AiService; files?: FileService; /** builds the AI context from the database (thread: only the node + its parents) */ source?: ContextSource; admin?: boolean; clock?: () => Date }

/** Everything the route files share: the dependencies, the request helpers and the helpers that more than one route file uses. Built once per router. */
export function makeRouteContext(deps: DataRouterDeps) {
  const { repo, ai } = deps;
  const clock = deps.clock ?? (() => new Date());
  const files = deps.files ?? new FileService(repo, (aiUser, req) => ai.extract(aiUser, req));
  const router = express.Router();
  const scopeOf = (req: Request): Scope => {
    const workspaceId = String(req.params.wid);
    if (!repo.getWorkspace(LOCAL_USER, workspaceId)) throw new RepoError('not_found', 'فضا پیدا نشد.');
    return { userId: LOCAL_USER, workspaceId };
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
  const today = () => clock().toISOString().slice(0, 10);

  return { repo, ai, clock, files, router, scopeOf, body, ACTORS, metaOf, wrap, deps, LOCAL_USER, ACCOUNT_WIPE_WORDS, stale, today };
}

export type RouteContext = ReturnType<typeof makeRouteContext>;
