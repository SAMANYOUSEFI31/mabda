import express from 'express';
import type { Request, Response, Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { can } from '../../src/core/entitlements.ts';
import type { Repo } from '../db/repo.ts';
import { buildMcpServer } from './tools.ts';

const rpcError = (res: Response, status: number, message: string) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code: status === 401 ? -32001 : -32000, message }, id: null });

/** `Authorization: Bearer mbd_…` — or `?token=` for clients that cannot set headers (custom connectors). OAuth is the planned replacement (README). */
export function tokenOf(req: Request): string {
  const h = req.header('authorization') ?? '';
  const m = h.match(/^Bearer\s+(\S+)$/i);
  if (m) return m[1];
  return typeof req.query.token === 'string' ? req.query.token : '';
}

/**
 * Remote MCP server on Streamable HTTP, mounted at /mcp. Stateless: each POST builds a server scoped to the token's
 * workspace, so a token can never read another workspace and nothing is kept between requests.
 */
export function createMcpRouter(deps: { repo: Repo }): Router {
  const router = express.Router();
  router.post('/', async (req: Request, res: Response) => {
    const t = deps.repo.resolveMcpToken(tokenOf(req));
    if (!t) return void rpcError(res, 401, 'توکن نامعتبر یا باطل‌شده است. در تنظیمات Mabda توکن تازه بساز.');
    const ws = deps.repo.getWorkspace(t.scope.userId, t.scope.workspaceId);
    if (!ws) return void rpcError(res, 401, 'فضای کاری این توکن وجود ندارد.');
    if (!can(ws.planId, 'mcp')) return void rpcError(res, 403, 'اتصال MCP از پلن Pro به بالا فعال است.');
    const server = buildMcpServer({ repo: deps.repo, scope: t.scope, label: t.label });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) rpcError(res, 500, `خطای سرور MCP: ${(e as Error).message}`);
    }
  });
  const noStream = (_req: Request, res: Response) => rpcError(res, 405, 'این سرور بدون session کار می‌کند؛ فقط POST پشتیبانی می‌شود.');
  router.get('/', noStream);
  router.delete('/', noStream);
  return router;
}
