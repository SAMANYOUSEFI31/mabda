/**
 * Workspaces and the account: archive, delete (typed name), delete everything (typed words).
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import { RepoError } from '../repo.ts';
import { archiveWorkspace, deleteWorkspace, wipeUser } from '../removal.ts';

export function registerAccountRoutes(ctx: RouteContext): void {
  const { repo, router, body, wrap, LOCAL_USER, ACCOUNT_WIPE_WORDS } = ctx;
  router.post('/workspaces/:wid/archive', wrap((req, res) => { archiveWorkspace(repo, LOCAL_USER, req.params.wid, body(req).archive !== false); res.json({ workspaces: repo.listWorkspaces(LOCAL_USER) }); }));
  router.delete('/workspaces/:wid', wrap((req, res) => {
    const ws = repo.getWorkspace(LOCAL_USER, req.params.wid);
    if (!ws) throw new RepoError('not_found', 'فضای کاری پیدا نشد.');
    // the showcase is a sample: one clear yes is enough; a real workspace needs its name typed
    if (!ws.isDemo && body(req).confirmName !== ws.name) throw new RepoError('invalid', 'برای حذف، نام فضای کاری را دقیقاً بنویس.');
    const r = deleteWorkspace(repo, LOCAL_USER, req.params.wid);
    res.json({ ...r, workspaces: repo.listWorkspaces(LOCAL_USER) });
  }));
  router.post('/account/delete-all', wrap((req, res) => {
    if (body(req).confirm !== ACCOUNT_WIPE_WORDS) throw new RepoError('invalid', `برای حذف همهٔ داده‌ها عبارت «${ACCOUNT_WIPE_WORDS}» را بنویس.`);
    res.json({ ...wipeUser(repo, LOCAL_USER), workspaces: repo.listWorkspaces(LOCAL_USER) });
  }));
}
