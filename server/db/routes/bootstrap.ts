/**
 * First load: the one-time import of old browser data or the seed.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { LegacyPayload } from '../legacy.ts';
import type { RouteContext } from './context.ts';
import { importLegacy, seedPayload } from '../legacy.ts';

export function registerBootstrapRoutes(ctx: RouteContext): void {
  const { repo, router, body, wrap, userOf } = ctx;
  router.post('/bootstrap', wrap((req, res) => {
    let imported: unknown = null;
    if (!repo.isImported(userOf(req))) {
      const legacy = body(req).legacy as LegacyPayload | undefined;
      const hasLegacy = !!legacy?.workspaces?.length;
      imported = importLegacy(repo, userOf(req), hasLegacy ? legacy! : seedPayload(userOf(req)), hasLegacy ? 'localStorage' : 'seed');
    }
    res.json({ workspaces: repo.listWorkspaces(userOf(req)), imported });
  }));
}
