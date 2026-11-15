/**
 * A workspace's own backup file and its restore (server/db/workspaceBackup.ts).
 * Registered last on the shared router by routes.ts (new paths; the earlier order is unchanged).
 */
import express from 'express';
import type { RouteContext } from './context.ts';
import { exportWorkspace, restoreWorkspace } from '../workspaceBackup.ts';

export function registerBackupRoutes(ctx: RouteContext): void {
  const { repo, clock, router, scopeOf, wrap, userOf } = ctx;
  router.get('/workspaces/:wid/backup', wrap((req, res) => {
    const s = scopeOf(req);
    const b = exportWorkspace(repo, s, clock());
    const name = `mabda-${(b.workspace.slug || 'workspace').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'workspace'}-${b.exportedAt.slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(b);
  }));
  // a backup with files can be larger than an ordinary request (server/app.ts lets this path through its 10 MB parser)
  router.post('/backup/restore', express.json({ limit: '60mb' }), wrap((req, res) => {
    const workspace = restoreWorkspace(repo, userOf(req), req.body?.backup, clock());
    res.json({ workspace, workspaces: repo.listWorkspaces(userOf(req)) });
  }));
}
