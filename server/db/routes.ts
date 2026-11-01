import express from 'express';
import type { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { Repo, RepoError, newId } from './repo.ts';
import type { Scope } from './repo.ts';
import { importLegacy, seedPayload } from './legacy.ts';
import type { LegacyPayload } from './legacy.ts';
import type { AiService } from '../ai/service.ts';
import { toAiError } from '../ai/errors.ts';
import { userOf as aiUserOf } from '../ai/routes.ts';
import { FileService } from '../files/service.ts';
import { FileExtractError, MAX_FILE_BYTES } from '../files/extract.ts';
import { ledgerEntryFromUsage } from '../../src/core/ledger.ts';
import { ancestorIds } from '../../src/core/nodeTree.ts';
import { computeStaleAssets } from '../../src/core/impactEngine.ts';
import { validateSpec } from '../../src/core/specGraph.ts';
import { PLANS } from '../../src/core/creditEngine.ts';
import { entitlementsOf } from '../../src/core/entitlements.ts';
import { costReport } from '../../src/core/costReport.ts';
import { AiError } from '../ai/errors.ts';
import type { ChatSession, GeneratedDeliverable, LedgerEntry, Workspace, WorkstreamSpec } from '../../src/types/index.ts';

/** One local user until real accounts exist. Every table already carries user_id + workspace_id. */
export const LOCAL_USER = 'local';

const wrap = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

export function createDataRouter(deps: { repo: Repo; ai: AiService; files?: FileService; /** who pays for subscription-included judgements */ payer?: () => 'us' | 'user'; admin?: boolean; clock?: () => Date }): { router: Router; files: FileService } {
  const { repo, ai } = deps;
  const payer = deps.payer ?? (() => 'user' as const);
  const clock = deps.clock ?? (() => new Date());
  const files = deps.files ?? new FileService(repo, (aiUser, req) => ai.extract(aiUser, req));
  const router = express.Router();
  const scopeOf = (req: Request): Scope => {
    const workspaceId = String(req.params.wid);
    if (!repo.getWorkspace(LOCAL_USER, workspaceId)) throw new RepoError('not_found', 'فضای کاری پیدا نشد.');
    return { userId: LOCAL_USER, workspaceId };
  };
  const body = (req: Request) => (req.body ?? {}) as Record<string, any>;

  // ── bootstrap / import ──────────────────────────────────────────────
  router.post('/bootstrap', wrap((req, res) => {
    let imported: unknown = null;
    if (!repo.isImported(LOCAL_USER)) {
      const legacy = body(req).legacy as LegacyPayload | undefined;
      const hasLegacy = !!legacy?.workspaces?.length;
      imported = importLegacy(repo, LOCAL_USER, hasLegacy ? legacy! : seedPayload(), hasLegacy ? 'localStorage' : 'seed');
    }
    res.json({ workspaces: repo.listWorkspaces(LOCAL_USER), imported });
  }));

  router.get('/workspaces', wrap((_req, res) => { res.json({ workspaces: repo.listWorkspaces(LOCAL_USER) }); }));
  router.put('/workspaces/:wid', wrap((req, res) => {
    const ws = body(req) as Workspace;
    if (ws.id !== req.params.wid) throw new RepoError('invalid', 'شناسهٔ فضای کاری نامطابق است.');
    res.json(repo.saveWorkspace(LOCAL_USER, ws));
  }));

  router.get('/workspaces/:wid/state', wrap((req, res) => { res.json(repo.state(scopeOf(req))); }));

  // ── nodes ────────────────────────────────────────────────────────────
  router.post('/workspaces/:wid/nodes', wrap((req, res) => { res.json({ node: repo.createNode(scopeOf(req), body(req) as never), nodes: repo.listNodes(scopeOf(req)) }); }));
  router.patch('/workspaces/:wid/nodes/:id', wrap((req, res) => { const s = scopeOf(req); repo.updateNode(s, req.params.id, body(req)); res.json({ nodes: repo.listNodes(s) }); }));
  router.post('/workspaces/:wid/nodes/:id/move', wrap((req, res) => { res.json({ nodes: repo.moveNode(scopeOf(req), req.params.id, String(body(req).parentId), body(req).index) }); }));
  router.delete('/workspaces/:wid/nodes/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const nodes = repo.deleteNode(s, req.params.id, typeof req.query.transferTo === 'string' ? req.query.transferTo : undefined);
    res.json({ nodes, objects: repo.listObjects(s), notes: repo.listNotes(s), files: repo.listFiles(s) });
  }));

  // ── context objects ──────────────────────────────────────────────────
  const stale = (s: Scope) => (repo.impactEnabled(s) ? computeStaleAssets(repo.listDeliverables(s), repo.listObjects(s)) : []);
  router.post('/workspaces/:wid/objects', wrap((req, res) => {
    const s = scopeOf(req);
    res.json({ object: repo.createObject(s, body(req) as never) });
  }));
  router.patch('/workspaces/:wid/objects/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const r = repo.updateObject(s, req.params.id, body(req));
    res.json({ ...r, stale: stale(s) });
  }));
  router.post('/workspaces/:wid/objects/:id/supersede', wrap((req, res) => {
    const s = scopeOf(req);
    const r = repo.supersedeObject(s, req.params.id, body(req) as never);
    res.json({ ...r, relationships: repo.listRelationships(s), stale: stale(s) });
  }));
  router.get('/workspaces/:wid/objects/:id/versions', wrap((req, res) => { res.json({ versions: repo.listVersions(scopeOf(req), req.params.id) }); }));

  // ── notes (never injected into the model) ────────────────────────────
  router.post('/workspaces/:wid/notes', wrap((req, res) => { res.json({ note: repo.createNote(scopeOf(req), String(body(req).nodeId), String(body(req).content ?? '')) }); }));
  router.patch('/workspaces/:wid/notes/:id', wrap((req, res) => { res.json({ note: repo.updateNote(scopeOf(req), req.params.id, String(body(req).content ?? '')) }); }));
  router.delete('/workspaces/:wid/notes/:id', wrap((req, res) => { repo.deleteNote(scopeOf(req), req.params.id); res.json({ ok: true }); }));

  /** «استخراج»: the note becomes Proposed objects (provenance AI Suggested) — the user confirms them later. */
  router.post('/workspaces/:wid/notes/:id/extract', wrap(async (req, res) => {
    const s = scopeOf(req);
    const note = repo.getNote(s, req.params.id);
    if (!note) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    if (!note.content.trim()) throw new RepoError('invalid', 'یادداشت خالی است.');
    const aiUser = aiUserOf(req);
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const r = await ai.extract(aiUser, { kind: 'note', text: note.content, nodeId: note.nodeId, nodes: repo.listNodes(s).map((n) => ({ id: n.id, label: n.label })) }, ctl.signal);
    const created = r.objects.slice(0, repo.objectSlots(s)).map((o) => repo.createObject(s, { type: o.type, status: 'Proposed', provenance: 'AI Suggested', title: o.title, content: o.content, nodeId: o.nodeId }));
    const ledger = repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'استخراج از یادداشت', mode: 'note_extract', creditCost: 0, usage: r.usage, id: newId('led') }));
    res.json({ created, ledger, usage: r.usage });
  }));

  // ── assets / ledger / chats / specs ──────────────────────────────────
  router.put('/workspaces/:wid/deliverables/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const d = body(req) as GeneratedDeliverable;
    if (d.id !== req.params.id) throw new RepoError('invalid', 'شناسهٔ دارایی نامطابق است.');
    if (!Array.isArray(d.usedContext)) throw new RepoError('invalid', 'usedContext (شناسه و نسخهٔ Contextهای استفاده‌شده) لازم است.');
    res.json({ deliverable: repo.saveDeliverable(s, d), stale: stale(s) });
  }));
  router.post('/workspaces/:wid/ledger', wrap((req, res) => { res.json({ entry: repo.addLedger(scopeOf(req), body(req) as LedgerEntry) }); }));
  router.put('/workspaces/:wid/sessions/:id', wrap((req, res) => { res.json({ session: repo.saveSession(scopeOf(req), body(req) as ChatSession) }); }));
  router.delete('/workspaces/:wid/sessions/:id', wrap((req, res) => { repo.deleteSession(scopeOf(req), req.params.id); res.json({ ok: true }); }));
  router.put('/workspaces/:wid/specs/:id', wrap((req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    if (!PLANS[ws.planId]?.customSpecs) throw new RepoError('forbidden', 'ساخت و ویرایش جریان کار سفارشی از پلن Pro به بالا فعال است.');
    const spec = body(req) as WorkstreamSpec;
    if (spec.id !== req.params.id) throw new RepoError('invalid', 'شناسهٔ spec نامطابق است.');
    const issues = validateSpec(spec);
    if (issues.length) throw new RepoError('invalid', issues.map((i) => i.message).join(' '));
    res.json({ spec: repo.saveSpec(s, spec) });
  }));

  // ── decision layer: Gap ambiguity (cached per object version), Context Coach (daily cap per plan) ──
  const today = () => clock().toISOString().slice(0, 10);
  router.post('/workspaces/:wid/gap/judge', wrap(async (req, res) => {
    const s = scopeOf(req);
    const ids = Array.isArray(body(req).objectIds) ? (body(req).objectIds as unknown[]).map(String) : [];
    const have = repo.listJudgments(s);
    const todo = ids.map((id) => repo.getObject(s, id)).filter((o): o is NonNullable<typeof o> => !!o && have[o.id]?.version !== o.version);
    // judgements WE pay for are capped per plan per day; with the user's own key there is no cap
    const planOf = repo.getWorkspace(LOCAL_USER, s.workspaceId)!.planId;
    const capped = payer() === 'us';
    const left = capped ? Math.max(0, entitlementsOf(planOf).decisionJudgmentsPerDay - repo.dailyUsage(s, today(), 'judge')) : Infinity;
    const limited = todo.length > left;
    if (limited) todo.length = left;
    if (todo.length) {
      const ctl = new AbortController();
      res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
      const r = await ai.judgeAmbiguity(aiUserOf(req), todo.map((o) => ({ id: o.id, title: o.title, content: o.content })), ctl.signal);
      for (const o of todo) { const j = r.judgments[o.id]; if (j) repo.saveJudgment(s, o.id, o.version, j); }
      if (capped) repo.addDailyUsage(s, today(), 'judge', todo.length);
      // the decision-layer call is free for the user (PRD P3) but its real tokens/cost are in the ledger
      if (r.usage) repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'تشخیص ابهام Context (Gap)', mode: 'gap_judge', creditCost: 0, usage: r.usage, id: newId('led') }));
    }
    res.json({ judgments: repo.listJudgments(s), ledger: repo.listLedger(s), limited });
  }));

  const coachQuota = (s: Scope) => {
    const limit = entitlementsOf(repo.getWorkspace(LOCAL_USER, s.workspaceId)!.planId).coachPerDay;
    const used = repo.dailyUsage(s, today(), 'coach');
    return { used, limit, remaining: Math.max(0, limit - used) };
  };
  router.get('/workspaces/:wid/coach/quota', wrap((req, res) => { res.json(coachQuota(scopeOf(req))); }));
  router.post('/workspaces/:wid/coach', wrap(async (req, res) => {
    const s = scopeOf(req);
    const b = body(req);
    const text = String(b.text ?? '').trim();
    if (!text) throw new RepoError('invalid', 'متنی برای Coach نوشته نشده است.');
    if (payer() === 'us' && coachQuota(s).remaining <= 0) throw new AiError('quota', { message: 'سقف روزانهٔ Context Coach برای پلن این فضای کاری پر شده است. فردا دوباره یا پلن را ارتقا بده.', retryable: false });
    const nodes = repo.listNodes(s);
    const nodeId = nodes.some((n) => n.id === b.nodeId) ? String(b.nodeId) : 'business';
    const node = nodes.find((n) => n.id === nodeId);
    const chain = new Set(ancestorIds(nodes, nodeId));
    const existing = repo.listObjects(s).filter((o) => o.status === 'Confirmed' && chain.has(o.nodeId)).slice(0, 12).map((o) => `${o.title}: ${o.content}`);
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const r = await ai.coach(aiUserOf(req), {
      scope: b.scope === 'onboarding' ? 'onboarding' : 'node', text, nodeId, nodeLabel: node?.label, nodeDescription: node?.description,
      nodes: nodes.map((n) => ({ id: n.id, label: n.label })), existing,
      history: Array.isArray(b.history) ? (b.history as Array<{ role: 'user' | 'coach'; content: string }>).slice(-6) : undefined,
    }, ctl.signal);
    repo.addDailyUsage(s, today(), 'coach'); // counted only after a successful answer
    repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'Context Coach', mode: 'coach', creditCost: 0, usage: r.usage, id: newId('led') }));
    const { usage: _u, ...result } = r;
    res.json({ result, quota: coachQuota(s), ledger: repo.listLedger(s) });
  }));

  // ── usage meters + manager ledger ────────────────────────────────────
  router.get('/workspaces/:wid/usage', wrap((req, res) => {
    const s = scopeOf(req);
    const ws = repo.getWorkspace(LOCAL_USER, s.workspaceId)!;
    const month = clock().toISOString().slice(0, 7);
    const byokCostUsd = repo.listLedger(s).filter((l) => l.byok && l.timestamp.startsWith(month)).reduce((sum, l) => sum + l.estimatedAiCostUsd, 0);
    res.json({
      planId: ws.planId, month, payer: payer(), byokCostUsd,
      objects: repo.countActiveObjects(s), fileTokens: repo.fileUsage(s, month),
      judgmentsToday: repo.dailyUsage(s, today(), 'judge'), coachToday: repo.dailyUsage(s, today(), 'coach'),
    });
  }));

  router.get('/admin/cost-report', wrap((req, res) => {
    if (!deps.admin) throw new RepoError('not_found', 'نمای مدیر فعال نیست (MABDA_ADMIN).');
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : clock().toISOString().slice(0, 7);
    const rows = repo.ledgerByWorkspaceForMonth(month).map((w) => ({ userId: w.userId, workspaceId: w.workspaceId, name: w.name, ...costReport(w.planId, w.entries) }));
    res.json({ month, rows });
  }));

  // ── files ──────────────────────────────────────────────────────────
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

  // ── errors ───────────────────────────────────────────────────────────
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RepoError) return void res.status(err.code === 'not_found' ? 404 : err.code === 'forbidden' ? 403 : 400).json({ error: { code: err.code, message: err.message } });
    if (err instanceof FileExtractError) return void res.status(422).json({ error: { code: 'unreadable', message: err.message } });
    if (err instanceof multer.MulterError) return void res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: err.code, message: err.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل بیشتر از ۲۵ مگابایت است.' : 'ارسال فایل نامعتبر بود.' } });
    const a = toAiError(err);
    res.status(a.kind === 'bad_request' ? 400 : a.kind === 'quota' ? 429 : a.kind === 'no_key' || a.kind === 'invalid_key' || a.kind === 'disabled' ? 401 : 502).json({ error: a.toInfo() });
  });

  return { router, files };
}
