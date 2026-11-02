import type { Repo } from './repo.ts';
import type { Workspace } from '../../src/types/index.ts';
import { buildDemo, DEMO_ID, tehranAt } from '../../src/core/demoData.ts';

/** the one showcase workspace of an account */
export const DEMO_WORKSPACE_ID = DEMO_ID;

/**
 * Builds — or rebuilds from nothing — the showcase workspace («قهوهٔ تخصصی آنلاین»). Idempotent: every run deletes all data of
 * that workspace first and then inserts the same content (dates relative to `now`). Nothing stored here is an AI output or an AI
 * judgement; ids, versions and timestamps are written exactly as the builder says, bypassing the plan caps on purpose.
 */
export function applyDemo(repo: Repo, userId: string, now: Date): Workspace {
  const s = { userId, workspaceId: DEMO_WORKSPACE_ID };
  const ws: Workspace = {
    id: DEMO_WORKSPACE_ID, name: 'قهوهٔ تخصصی آنلاین', slug: 'demo-coffee', description: 'فضای نمونهٔ کامل برای بررسی محصول؛ داده‌ها ساختگی‌اند.',
    planId: 'max', creditsRemaining: 150, todayChatCount: 0, isDemo: true, createdAt: now.toISOString(),
  };
  const data = buildDemo(now);
  repo.db.transaction(() => {
    const exists = !!repo.getWorkspace(userId, DEMO_WORKSPACE_ID);
    repo.saveWorkspace(userId, exists ? { ...repo.getWorkspace(userId, DEMO_WORKSPACE_ID)!, ...ws, createdAt: repo.getWorkspace(userId, DEMO_WORKSPACE_ID)!.createdAt } : ws, { demo: true, skipLimit: true });
    if (exists) repo.resetWorkspaceData(s);
    for (const n of data.nodes) repo.importNode(s, n);
    for (const o of data.objects) repo.importObject(s, o, { silent: true });
    for (const v of data.versions) repo.importVersion(s, v);
    for (const r of data.relationships) repo.importRelationship(s, r);
    for (const c of data.changes) repo.importChange(s, c);
    for (const n of data.notes) repo.importNote(s, n);
    repo.importFile(s, data.file);
    data.specs.forEach((sp, i) => repo.importSpec(s, sp, tehranAt(now, 30, 10, data.specs.length - i)));
    for (const d of data.deliverables) repo.saveDeliverable(s, d);
    for (const i of data.canvas.decisions) repo.saveCanvasItem(s, 'decisions', i.itemRef, i);
    for (const i of data.canvas.free) repo.saveCanvasItem(s, 'free', i.itemRef, i);
  })();
  return repo.getWorkspace(userId, DEMO_WORKSPACE_ID)!;
}
