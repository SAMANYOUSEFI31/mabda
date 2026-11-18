/**
 * The owner's tools (invite mode): people and their links, error reports, a copy of the whole database.
 * Only the owner reaches these; to anyone else they do not exist (404, not 403: nothing to discover).
 */
import { tehranDay } from '../../src/core/tehranDate.ts';
import fs from 'node:fs';
import express from 'express';
import type { Request } from 'express';
import type { SqlLike } from '../db/sql/types.ts';
import type { Accounts } from './accounts.ts';
import { AuthError } from './accounts.ts';
import { requireOwner } from './http.ts';
import type { AuthMode } from './http.ts';
import type { ErrorLog } from '../diagnostics.ts';
import type { ActivityLog } from '../activity.ts';
import { computeKpis, eventsCsv } from '../../src/core/activity.ts';
import { LOCAL_USER } from './http.ts';
import { freshCopy } from '../backup.ts';

const originOf = (req: Request, publicOrigin?: string) => publicOrigin?.replace(/\/+$/, '') ?? `${req.get('x-forwarded-proto') ?? req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`;
/** the personal link: the code is in the #fragment, which browsers never send to a server, so it is not in any request log */
export const inviteLink = (origin: string, code: string) => `${origin}/#join=${code}`;

export function createOwnerRouter(deps: { db: SqlLike; mode: AuthMode; accounts: Accounts; errors: ErrorLog; activity: ActivityLog; backupDir?: string; publicOrigin?: string }): express.Router {
  const { accounts, errors } = deps;
  const r = express.Router();
  r.use(requireOwner);
  const inviteOnly = () => { if (deps.mode.mode !== 'invite') throw new AuthError('invalid', 'دعوت فقط در نسخهٔ آنلاین (با MABDA_OWNER_CODE) معنا دارد.'); };
  const fail = (res: express.Response, e: unknown) => {
    if (e instanceof AuthError) return void res.status(e.code === 'not_found' ? 404 : 400).json({ error: { code: e.code, message: e.message } });
    throw e;
  };

  r.get('/people', (_req, res) => { res.json({ mode: deps.mode.mode, people: deps.mode.mode === 'invite' ? accounts.list().filter((a) => a.role === 'tester') : [] }); });
  r.post('/people', (req, res) => {
    try {
      inviteOnly();
      const { account, code } = accounts.invite(String(req.body?.name ?? ''));
      res.json({ person: account, link: inviteLink(originOf(req, deps.publicOrigin), code) });
    } catch (e) { fail(res, e); }
  });
  r.post('/people/:id/link', (req, res) => {
    try { inviteOnly(); res.json({ link: inviteLink(originOf(req, deps.publicOrigin), accounts.rotate(req.params.id)) }); } catch (e) { fail(res, e); }
  });
  r.post('/people/:id/disabled', (req, res) => {
    try { inviteOnly(); res.json({ person: accounts.setDisabled(req.params.id, req.body?.disabled !== false) }); } catch (e) { fail(res, e); }
  });

  r.get('/errors', (_req, res) => { res.json({ errors: errors.list(200) }); });

  // the user-test record (docs/test-data.md): the measures, computed from the raw events each time, and the raw events themselves
  const persons = () => deps.mode.mode === 'invite'
    ? accounts.list().map((a) => ({ id: a.id, name: a.role === 'owner' ? 'صاحب' : a.name, role: a.role }))
    : [{ id: LOCAL_USER, name: 'این دستگاه', role: 'local' }];
  r.get('/activity/kpis', (_req, res) => { res.json(computeKpis(deps.activity.list(), persons(), { clientErrors: deps.activity.clientErrorsByUser() })); });
  r.get('/activity/export', (req, res) => {
    const events = deps.activity.list();
    const day = tehranDay();
    if (req.query.format === 'csv') {
      res.setHeader('Content-Disposition', `attachment; filename="mabda-activity-${day}.csv"`);
      return void res.type('text/csv; charset=utf-8').send(eventsCsv(events, persons()));
    }
    res.setHeader('Content-Disposition', `attachment; filename="mabda-activity-${day}.json"`);
    res.json({ format: 'mabda-activity', version: 1, exportedAt: new Date().toISOString(), people: persons(), events, errors: errors.list(2000), kpis: computeKpis(events, persons(), { clientErrors: deps.activity.clientErrorsByUser() }) });
  });

  /** the whole database as one file (every person's data): the owner's off-host copy */
  r.get('/backup', async (_req, res, next) => {
    try {
      if (!deps.backupDir) return void res.status(404).json({ error: { code: 'not_found', message: 'پایگاه‌داده در حافظه است؛ پشتیبانی برای دانلود نیست.' } });
      const file = await freshCopy(deps.db, deps.backupDir);
      res.download(file, `mabda-${tehranDay()}${file.endsWith(".jsonl.gz") ? ".jsonl.gz" : ".sqlite"}`, () => fs.rmSync(file, { force: true }));
    } catch (e) { next(e); }
  });
  return r;
}
