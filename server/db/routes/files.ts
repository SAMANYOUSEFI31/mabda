/**
 * File upload, quota, text and delete.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import multer from 'multer';
import type { RouteContext } from './context.ts';
import { MAX_FILE_BYTES } from '../../files/extract.ts';
import { RepoError } from '../repo.ts';
import { userOf as aiUserOf } from '../../ai/routes.ts';

export function registerFilesRoutes(ctx: RouteContext): void {
  const { repo, files, router, scopeOf, body, wrap, LOCAL_USER } = ctx;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  router.get('/workspaces/:wid/files/quota', wrap((req, res) => { res.json(files.quota(scopeOf(req))); }));
  router.post('/workspaces/:wid/files', upload.single('file'), wrap(async (req, res) => {
    const s = scopeOf(req);
    if (!req.file) throw new RepoError('invalid', 'فایلی ارسال نشده است.');
    // browsers send the name as latin1 bytes inside multipart; restore UTF-8 names (Persian file names)
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const nodeId = typeof req.body?.nodeId === 'string' && req.body.nodeId ? req.body.nodeId : undefined;
    res.json(await files.upload(s, { name, mime: req.file.mimetype, buffer: req.file.buffer, nodeId }));
  }));
  router.post('/workspaces/:wid/files/:id/process', wrap(async (req, res) => {
    const s = scopeOf(req);
    const r = await files.process(s, req.params.id, aiUserOf(req));
    res.json({ ...r, workspace: repo.getWorkspace(LOCAL_USER, s.workspaceId), quota: files.quota(s) });
  }));
  router.delete('/workspaces/:wid/files/:id', wrap((req, res) => { repo.deleteFile(scopeOf(req), req.params.id); res.json({ ok: true }); }));
}
