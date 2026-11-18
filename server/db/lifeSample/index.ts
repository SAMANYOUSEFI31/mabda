/**
 * «زندگی من (نمونهٔ کامل)» — the long-use sample (docs/life-sample.md).
 *
 * The sample is a space of its own, never the person's first-run «زندگی من» (`ws_course`): its id is fresh on every build and the
 * seeder remembers which space it made (a marker row in `kv`). It only ever replaces a space it made itself.
 *
 * A rebuild is all-or-nothing: the new space is built next to the old one (a fresh id), and only when the whole story has been
 * told is the old copy deleted and the marker moved. If any step fails, the half-built space is deleted and the old copy stays.
 * One build per person at a time (a second request gets «conflict», not a second half-built space).
 */
import crypto from 'node:crypto';
import type { Repo } from '../repo.ts';
import { RepoError } from '../repo.ts';
import type { Workspace } from '../../../src/types/index.ts';
import { importLegacy, seedPayload } from '../legacy.ts';
import { openDriver } from './driver.ts';
import { tellLife } from './story.ts';

export const LIFE_SAMPLE_NAME = 'زندگی من (نمونهٔ کامل)';
const markerKey = 'life_sample_workspace';
/** persons with a build in flight (this process); the lock is released in `finally` */
const running = new Set<string>();

/** the space this person's seeder made last, if it still exists */
export function lifeSampleOf(repo: Repo, userId: string): Workspace | undefined {
  const r = repo.db.prepare('SELECT value FROM kv WHERE user_id = ? AND key = ?').get(userId, markerKey) as { value: string } | undefined;
  return r ? repo.getWorkspace(userId, (JSON.parse(r.value) as { id: string }).id) : undefined;
}

export async function applyLifeSample(repo: Repo, userId: string, now: Date = new Date()): Promise<Workspace> {
  if (running.has(userId)) throw new RepoError('conflict', 'ساخت نمونه برای تو همین الان در جریان است؛ کمی صبر کن.');
  running.add(userId);
  const wid = `ws_life_${crypto.randomBytes(6).toString('hex')}`;
  const driver = await openDriver(repo, userId);
  try {
    // a person who has not opened the app yet: the ordinary first-run samples come first (as /bootstrap would)
    if (!repo.isImported(userId)) importLegacy(repo, userId, seedPayload(userId), 'seed');
    const old = lifeSampleOf(repo, userId);
    try {
      await tellLife(driver, now, wid);
    } catch (e) {
      // nothing half-built stays; the previous sample (if any) is untouched
      if (repo.getWorkspace(userId, wid)) { driver.at(new Date()); await driver.del(`/workspaces/${wid}`, { confirmName: LIFE_SAMPLE_NAME }).catch(() => undefined); }
      throw e;
    }
    repo.db.transaction(() => {
      repo.db.prepare('INSERT OR REPLACE INTO kv (user_id, key, value) VALUES (?, ?, ?)').run(userId, markerKey, JSON.stringify({ id: wid }));
    })();
    // only now the old copy goes (the one the seeder made — never any other space)
    if (old && old.id !== wid) { driver.at(new Date()); await driver.del(`/workspaces/${old.id}`, { confirmName: old.name }).catch(() => undefined); }
  } finally { running.delete(userId); await driver.close(); }
  return repo.getWorkspace(userId, wid)!;
}

const offeredKey = 'life_sample_offered';
export const samplesAllowed = (env: NodeJS.ProcessEnv = process.env) => /^(1|on|true|yes)$/i.test(env.MABDA_ALLOW_SAMPLES ?? '');

/**
 * The owner's own copy, made once without anyone typing a command: on the owner's first load after the host set
 * `MABDA_ALLOW_SAMPLES`. Never for a tester; never when the flag is off; never again after it was offered once (a person who
 * deletes it does not get it back; the reset route still rebuilds it on request). A failure is logged and not retried on every load.
 */
export async function ensureOwnerSample(repo: Repo, userId: string, role: string | undefined, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if ((role !== 'owner' && role !== 'local') || !samplesAllowed(env)) return false;
  if (repo.db.prepare('SELECT 1 FROM kv WHERE user_id = ? AND key = ?').get(userId, offeredKey)) return false;
  repo.db.prepare('INSERT OR REPLACE INTO kv (user_id, key, value) VALUES (?, ?, ?)').run(userId, offeredKey, JSON.stringify({ at: now.toISOString() }));
  try { await applyLifeSample(repo, userId, now); return true; } catch (e) { console.error('[life-sample] owner sample failed:', e instanceof Error ? e.message : e); return false; }
}
