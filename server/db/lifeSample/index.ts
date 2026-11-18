/**
 * «زندگی من» — the long-use sample (docs/life-sample.md).
 *
 * `applyLifeSample` throws away the person's «زندگی من» space and tells the whole story again through the product's own routes
 * (story.ts), with a clock that moves day by day over eight weeks ending today. Everything stored is therefore what a real
 * use would have stored: versions, history, drafts, replaced and archived knowledge, stale outputs, due assumptions.
 * Works on whichever engine the Repo sits on (SQLite or Postgres): it only talks to the Repo through the routes.
 */
import type { Repo } from '../repo.ts';
import type { Workspace } from '../../../src/types/index.ts';
import { idSuffixFor } from '../userIds.ts';
import { importLegacy, seedPayload } from '../legacy.ts';
import { openDriver } from './driver.ts';
import { tellLife } from './story.ts';

/** the first-run sample «زندگی من» already has this id (server/db/legacy.ts via src/core/seedData.ts): rebuilding replaces it in place */
export const LIFE_WORKSPACE_ID = 'ws_course';
export const lifeWorkspaceIdFor = (userId: string) => LIFE_WORKSPACE_ID + idSuffixFor(userId);

export async function applyLifeSample(repo: Repo, userId: string, now: Date = new Date()): Promise<Workspace> {
  const wid = lifeWorkspaceIdFor(userId);
  // a person who has not opened the app yet: the ordinary first-run samples come first (as /bootstrap would), or that first load would pour them into this space
  if (!repo.isImported(userId)) importLegacy(repo, userId, seedPayload(userId), 'seed');
  const driver = await openDriver(repo, userId);
  try {
    const old = repo.getWorkspace(userId, wid);
    if (old) {
      // the same step the person takes in «حذف فضا»: nothing of the old copy stays (the name is the confirmation)
      driver.at(now);
      await driver.del(`/workspaces/${wid}`, { confirmName: old.name });
    }
    await tellLife(driver, now, wid);
  } finally { await driver.close(); }
  return repo.getWorkspace(userId, wid)!;
}
