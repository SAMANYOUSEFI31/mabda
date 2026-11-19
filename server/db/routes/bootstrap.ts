/**
 * First load: the one-time import of old browser data or the seed.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { LegacyPayload } from '../legacy.ts';
import type { RouteContext } from './context.ts';
import { importLegacy, seedPayload } from '../legacy.ts';
import { ensureOwnerSample } from '../lifeSample/index.ts';
import { applyDemo } from '../demo.ts';

export function registerBootstrapRoutes(ctx: RouteContext): void {
  const { repo, clock, router, body, wrap, userOf } = ctx;
  router.post('/bootstrap', wrap(async (req, res) => {
    let imported: unknown = null;
    if (!repo.isImported(userOf(req))) {
      const legacy = body(req).legacy as LegacyPayload | undefined;
      const hasLegacy = !!legacy?.workspaces?.length;
      // an invited tester (decisions.md §۳۷، §۴۸) starts with nothing written by anyone else in a space of their own: only the ONE
      // marked sample (isDemo; out of every KPI) sits beside it, and the first-run screen asks what their own space is for. The
      // local install and the owner keep the old seed, which the screenshots and the audits are written against
      const fresh = req.mabdaUser?.role === 'tester';
      imported = importLegacy(repo, userOf(req), hasLegacy ? legacy! : fresh ? { workspaces: [] } : seedPayload(userOf(req)), hasLegacy ? 'localStorage' : fresh ? 'fresh' : 'seed');
      if (fresh && !hasLegacy) applyDemo(repo, userOf(req), clock());
    }
    // the owner's own full sample (docs/life-sample.md): once, only when the host switched samples on
    await ensureOwnerSample(repo, userOf(req), req.mabdaUser?.role, clock());
    res.json({ workspaces: repo.listWorkspaces(userOf(req)), imported });
  }));
}
