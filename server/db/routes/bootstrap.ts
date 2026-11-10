/**
 * First load: the one-time import of old browser data or the seed.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { LegacyPayload } from '../legacy.ts';
import type { RouteContext } from './context.ts';
import { importLegacy, seedPayload } from '../legacy.ts';

export function registerBootstrapRoutes(ctx: RouteContext): void {
  const { repo, router, body, wrap, LOCAL_USER } = ctx;
  router.post('/bootstrap', wrap((req, res) => {
    let imported: unknown = null;
    if (!repo.isImported(LOCAL_USER)) {
      const legacy = body(req).legacy as LegacyPayload | undefined;
      const hasLegacy = !!legacy?.workspaces?.length;
      imported = importLegacy(repo, LOCAL_USER, hasLegacy ? legacy! : seedPayload(), hasLegacy ? 'localStorage' : 'seed');
    }
    res.json({ workspaces: repo.listWorkspaces(LOCAL_USER), imported });
  }));
}
