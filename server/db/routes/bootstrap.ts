/**
 * First load: the one-time import of old browser data or the seed.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { LegacyPayload } from '../legacy.ts';
import type { RouteContext } from './context.ts';
import { importLegacy, seedPayload } from '../legacy.ts';
import { ensureOwnerSample } from '../lifeSample/index.ts';

export function registerBootstrapRoutes(ctx: RouteContext): void {
  const { repo, clock, router, body, wrap, userOf } = ctx;
  router.post('/bootstrap', wrap(async (req, res) => {
    let imported: unknown = null;
    if (!repo.isImported(userOf(req))) {
      const legacy = body(req).legacy as LegacyPayload | undefined;
      const hasLegacy = !!legacy?.workspaces?.length;
      imported = importLegacy(repo, userOf(req), hasLegacy ? legacy! : seedPayload(userOf(req)), hasLegacy ? 'localStorage' : 'seed');
    }
    // the owner's own full sample (docs/life-sample.md): once, only when the host switched samples on
    await ensureOwnerSample(repo, userOf(req), req.mabdaUser?.role, clock());
    res.json({ workspaces: repo.listWorkspaces(userOf(req)), imported });
  }));
}
