import express from 'express';
import type { Request, Response, Router } from 'express';
import { ByokVault } from './byok.ts';
import { AiError, toAiError } from './errors.ts';
import { AiService } from './service.ts';
import type { ChatRequest, GenerateRequest } from './service.ts';
import { defaultProviderFactory, SessionResolver, isValidGeminiKey } from './session.ts';
import type { AiStreamEvent, UserMode } from '../../src/types/ai.ts';
import type { ContextObjectLite } from './context.ts';

/** Feature flag: managed AI (server-side key paid by the product). OFF by default — users bring their own key. */
export const managedAiEnabled = () => /^(1|on|true|yes)$/i.test(process.env.MABDA_MANAGED_AI ?? '');

/**
 * Where the authoritative context comes from. When a request carries `workspaceId`, the server reads the
 * Context (with versions), node tree and relevant file chunks itself — the browser cannot influence what is injected.
 */
export interface ContextSource {
  forChat(workspaceId: string, o: { scopeNodeId?: string; message: string }): Partial<ChatRequest>;
  forGenerate(workspaceId: string, o: { targetNodeId?: string; title: string; criteria: string[]; dependencyAssetIds?: string[] }): Partial<GenerateRequest>;
}

/** Manager ledger (real cost per user vs plan price). Off unless the operator sets MABDA_ADMIN. */
export const adminEnabled = () => /^(1|on|true|yes)$/i.test(process.env.MABDA_ADMIN ?? '');

const USER_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function userOf(req: Request): string {
  const id = req.header('x-mabda-user') ?? '';
  if (!USER_ID.test(id)) throw new AiError('bad_request', { message: 'شناسهٔ کاربر نامعتبر است.', retryable: false });
  return id;
}

const fail = (res: Response, e: unknown) => {
  const err = toAiError(e);
  res.status(err.kind === 'bad_request' ? 400 : err.kind === 'no_key' || err.kind === 'invalid_key' || err.kind === 'disabled' ? 401 : 502).json({ error: err.toInfo() });
};

/** NDJSON writer: one JSON event per line, flushed immediately; aborts the upstream when the client goes away. */
function ndjson(req: Request, res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
  const emit = (e: AiStreamEvent) => { if (!res.writableEnded) res.write(`${JSON.stringify(e)}\n`); };
  return { emit, signal: ctl.signal, end: () => res.end() };
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function createAiRouter(opts: { vault?: ByokVault; sessions?: SessionResolver; service?: AiService; source?: ContextSource } = {}): { router: Router; sessions: SessionResolver; service: AiService } {
  const vault = opts.vault ?? new ByokVault();
  const sessions = opts.sessions ?? new SessionResolver({ vault, managedEnabled: managedAiEnabled(), managedKey: process.env.GEMINI_API_KEY, admin: adminEnabled() });
  const service = opts.service ?? new AiService({ sessions });
  const router = express.Router();

  router.get('/status', async (req, res) => {
    try { res.json(await sessions.status(userOf(req))); } catch (e) { fail(res, e); }
  });

  router.post('/plan', async (req, res) => {
    try {
      const b = req.body ?? {};
      const userMode = (['auto', 'fast', 'deep', 'sensitive'].includes(b.userMode) ? b.userMode : 'auto') as UserMode;
      const jobKind = b.jobKind === 'asset' || b.jobKind === 'chat' ? b.jobKind : 'deliverable';
      const ctl = new AbortController();
      res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
      const contextList = opts.source && typeof b.workspaceId === 'string' ? opts.source.forChat(b.workspaceId, { message: String(b.text ?? '') }).contextList ?? [] : asArray<ContextObjectLite>(b.contextList);
      res.json(await service.previewPlan(userOf(req), { userMode, jobKind, text: String(b.text ?? ''), contextList }, ctl.signal));
    } catch (e) { fail(res, e); }
  });

  router.post('/chat', async (req, res) => {
    let userId: string;
    try {
      userId = userOf(req);
      if (typeof req.body?.message !== 'string' || !req.body.message.trim()) throw new AiError('bad_request', { message: 'پیام خالی است.', retryable: false });
    } catch (e) { return fail(res, e); }
    const out = ndjson(req, res);
    const b = req.body;
    let chat: ChatRequest = {
      message: b.message, contextList: asArray(b.contextList), focusNodeIds: asArray(b.focusNodeIds),
      chatMode: b.chatMode, mode: b.mode === 'deep' ? 'deep' : b.mode === 'fast' ? 'fast' : 'auto', history: asArray(b.history), plan: b.plan, decisionUsage: b.decisionUsage,
    };
    try {
      if (opts.source && typeof b.workspaceId === 'string') {
        chat = { ...chat, ...opts.source.forChat(b.workspaceId, { scopeNodeId: typeof b.scopeNodeId === 'string' ? b.scopeNodeId : undefined, message: b.message }) };
        if (asArray<string>(b.focusNodeIds).length && !chat.scopeNodeId) chat.focusNodeIds = asArray(b.focusNodeIds);
      }
    } catch (e) { out.emit({ type: 'error', error: toAiError(e).toInfo() }); return out.end(); }
    await service.chat(userId, chat, out.emit, out.signal);
    out.end();
  });

  router.post('/generate', async (req, res) => {
    let userId: string;
    try {
      userId = userOf(req);
      if (typeof req.body?.deliverableTitle !== 'string') throw new AiError('bad_request', { message: 'عنوان خروجی مشخص نیست.', retryable: false });
    } catch (e) { return fail(res, e); }
    const out = ndjson(req, res);
    const b = req.body;
    let gen: GenerateRequest = {
      deliverableId: String(b.deliverableId ?? ''), deliverableTitle: b.deliverableTitle,
      deliverableType: b.deliverableType === 'Asset' ? 'Asset' : 'Deliverable',
      acceptanceCriteria: asArray<string>(b.acceptanceCriteria), contextObjects: asArray(b.contextObjects),
      contextList: b.contextList ? asArray(b.contextList) : undefined,
      userMode: (['auto', 'fast', 'deep', 'sensitive'].includes(b.userMode) ? b.userMode : 'auto') as UserMode,
      rebuildNotes: typeof b.rebuildNotes === 'string' ? b.rebuildNotes : undefined, plan: b.plan, decisionUsage: b.decisionUsage,
      specTarget: typeof b.specTarget === 'string' ? b.specTarget : undefined,
      specGuardrails: asArray<unknown>(b.specGuardrails).filter((g): g is string => typeof g === 'string').slice(0, 50),
      outputBand: ['short', 'medium', 'long'].includes(b.outputBand) ? b.outputBand : undefined,
    };
    try {
      if (opts.source && typeof b.workspaceId === 'string') {
        gen = { ...gen, ...opts.source.forGenerate(b.workspaceId, { targetNodeId: typeof b.targetNodeId === 'string' ? b.targetNodeId : undefined, title: b.deliverableTitle, criteria: gen.acceptanceCriteria, dependencyAssetIds: asArray<unknown>(b.dependencyAssetIds).filter((x): x is string => typeof x === 'string').slice(0, 20) }) };
      }
    } catch (e) { out.emit({ type: 'error', error: toAiError(e).toInfo() }); return out.end(); }
    await service.generate(userId, gen, out.emit, out.signal);
    out.end();
  });

  router.put('/byok', async (req, res) => {
    try {
      const userId = userOf(req);
      const key = String(req.body?.apiKey ?? '').trim();
      if (!isValidGeminiKey(key)) throw new AiError('invalid_key', { message: 'قالب کلید Gemini درست نیست (باید با AIzaSy شروع شود).' });
      // prove the key works before storing it
      await defaultProviderFactory('gemini', key).listModels();
      const { last4 } = vault.set(userId, key);
      sessions.invalidate(userId);
      res.json({ ok: true, last4 });
    } catch (e) { fail(res, e); }
  });

  router.delete('/byok', (req, res) => {
    try {
      const userId = userOf(req);
      vault.delete(userId);
      sessions.invalidate(userId);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  return { router, sessions, service };
}
