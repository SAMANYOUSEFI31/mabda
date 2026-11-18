/**
 * The hands of the sample builder: a private, in-process copy of the data API (the same router every browser talks to) that
 * answers for one person, with a clock the story moves. A step of the story is a real request to a real route, so the
 * validations, versions, history rows, impact and needs-review states are the product's own — nothing is written around it.
 *
 * It is a separate Express app on a loopback port that lives only for the run: the public server never learns about the fake
 * clock, and a request of someone else in flight is not affected (the moment travels in an AsyncLocalStorage, server/db/clock.ts).
 */
import crypto from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { AiService } from '../../ai/service.ts';
import { createDataRouter } from '../routes.ts';
import { currentDate, runAt } from '../clock.ts';
import type { Repo } from '../repo.ts';

export class SampleApiError extends Error {
  constructor(public status: number, public method: string, public path: string, message: string) { super(`${method} ${path} → ${status}: ${message}`); }
}

export interface Driver {
  /** where the private gateway listens (tests only: a call without the run's secret must be refused) */
  base: string;
  /** the moment of the following steps (each call inside advances by a second, so the order of steps is the order of history) */
  at(when: Date): void;
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  put<T = any>(path: string, body?: unknown): Promise<T>;
  patch<T = any>(path: string, body?: unknown): Promise<T>;
  del<T = any>(path: string, body?: unknown): Promise<T>;
  upload<T = any>(path: string, file: { name: string; mime: string; text: string }, fields?: Record<string, string>): Promise<T>;
  close(): Promise<void>;
}

export async function openDriver(repo: Repo, userId: string): Promise<Driver> {
  const app = express();
  // the loopback port is not a door: every call must carry this run's own secret (nothing else on the machine can drive it)
  const secret = crypto.randomBytes(24).toString('hex');
  app.use((req, res, next) => { const t = String(req.headers['x-sample-token'] ?? ''); if (t.length === secret.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(secret))) return next(); res.status(401).json({ error: { code: 'unauthenticated', message: 'not the sample builder' } }); });
  app.use(express.json({ limit: '10mb' }));
  // who: this person. when: the story's moment, read from a header only this private app understands.
  app.use((req, _res, next) => {
    req.mabdaUser = { id: userId, role: 'local', name: '', consented: true };
    const at = new Date(String(req.headers['x-sample-at'] ?? ''));
    if (Number.isNaN(at.getTime())) return next();
    runAt(at, next);
  });
  // none of the story's routes reaches an AI; a call that did would fail loudly instead of inventing text
  const noAi = new Proxy({}, { get: (_t, k) => () => { throw new Error(`the sample builder never calls the AI (${String(k)})`); } }) as unknown as AiService;
  app.use('/api', createDataRouter({ repo, ai: noAi, clock: currentDate }).router);
  const server: Server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  let cursor = new Date();
  const stamp = () => { cursor = new Date(cursor.getTime() + 1000); return cursor.toISOString(); };
  async function call<T>(method: string, path: string, body?: unknown, raw?: FormData): Promise<T> {
    const r = await fetch(base + path, { method, headers: { 'x-sample-token': secret, 'x-sample-at': stamp(), ...(raw ? {} : { 'content-type': 'application/json' }) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await r.text();
    const json = text ? JSON.parse(text) : {};
    if (!r.ok) throw new SampleApiError(r.status, method, path, json?.error?.message ?? text);
    return json as T;
  }
  return {
    base,
    at: (when) => { cursor = when; },
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    put: (p, b) => call('PUT', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b ?? {}),
    del: (p, b) => call('DELETE', p, b),
    upload: (p, f, fields = {}) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.set(k, v);
      form.set('file', new Blob([f.text], { type: f.mime }), f.name); // the filename goes out as UTF-8, like a browser's
      return call('POST', p, undefined, form);
    },
    close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); }),
  };
}
