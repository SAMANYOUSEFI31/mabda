import type { Repo } from './repo.ts';
import type { Workspace } from '../../src/types/index.ts';

/** the one showcase workspace of an account */
export const DEMO_WORKSPACE_ID = 'ws_demo';

/**
 * Builds — or rebuilds from nothing — the showcase workspace. Idempotent: running it twice gives the same result, because
 * every reset deletes all data of that workspace first. Nothing in here is an AI judgement or an AI output.
 */
export function applyDemo(repo: Repo, userId: string, now: Date): Workspace {
  const s = { userId, workspaceId: DEMO_WORKSPACE_ID };
  const ws: Workspace = {
    id: DEMO_WORKSPACE_ID, name: 'قهوهٔ تخصصی آنلاین', slug: 'demo-coffee', description: 'فضای نمونهٔ کامل برای بررسی محصول؛ داده‌ها ساختگی‌اند.',
    planId: 'max', creditsRemaining: 0, todayChatCount: 0, isDemo: true, createdAt: now.toISOString(),
  };
  const exists = !!repo.getWorkspace(userId, DEMO_WORKSPACE_ID);
  repo.saveWorkspace(userId, ws, { demo: true, skipLimit: true });
  if (exists) repo.resetWorkspaceData(s);
  return repo.getWorkspace(userId, DEMO_WORKSPACE_ID)!;
}
