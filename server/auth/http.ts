/**
 * Sign-in on the wire: security headers, the CSRF check, the session cookie, and who the request is for.
 *
 * Two modes, decided by the environment and nothing else:
 * - «local» (one person on their own computer, the default outside production): every request is the one local user, as before.
 * - «invite» (MABDA_OWNER_CODE is set): every /api request needs a sign-in; each person has their own data.
 * Production without MABDA_OWNER_CODE refuses to start (fails closed): an open server would show one person's data to anyone.
 */
import crypto from 'node:crypto';
import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { SqlLike } from '../db/sql/types.ts';
import { Accounts, AuthError, OWNER_ID, sha256 } from './accounts.ts';
import type { Account, Role } from './accounts.ts';
import { OWNER_NOTICE_VERSION } from '../../src/core/ownerNotice.ts';

/** the one user of the local mode (also the id that existing single-user databases already use) */
export const LOCAL_USER = 'local';
export const SESSION_COOKIE = 'mabda_session';

export type AuthMode = { mode: 'local' } | { mode: 'invite'; ownerCode: string };
/** `consented`: a tester has accepted the owner-access notice (always true for the owner and the one local person) */
export interface RequestUser { id: string; role: Role | 'local'; name: string; consented: boolean }

declare module 'express-serve-static-core' {
  interface Request { mabdaUser?: RequestUser }
}

export function resolveAuthMode(env: NodeJS.ProcessEnv): AuthMode | { fatal: string } {
  const code = (env.MABDA_OWNER_CODE ?? '').trim();
  if (code) {
    if (code.length < 20) return { fatal: 'MABDA_OWNER_CODE must be at least 20 characters (let the host generate it).' };
    // the frozen AI was built for one person: its data routes read one fixed user, so it must never run with several people
    if (/^(1|on|true|yes)$/i.test(env.MABDA_MANAGED_AI ?? '')) return { fatal: 'MABDA_MANAGED_AI cannot be on together with MABDA_OWNER_CODE: the frozen AI reads a single fixed user. Turn it off.' };
    return { mode: 'invite', ownerCode: code };
  }
  if (env.NODE_ENV === 'production') return { fatal: 'Refusing to start in production without MABDA_OWNER_CODE: without sign-in every visitor would share one person\'s data. See docs/deploy.md.' };
  return { mode: 'local' };
}

/** who this request is for; throws when nobody is signed in (a route can never fall back to someone else's data) */
export function userIdOf(req: Request): string {
  const id = req.mabdaUser?.id;
  if (!id) throw new AuthError('unauthenticated', 'برای دیدن داده‌ها اول وارد شو.');
  return id;
}

/**
 * Headers every response carries. Goal: the page cannot be framed (clickjacking), sniffed into another type, or leak its URL
 * to other sites, and the test copy is not indexed. Standard: OWASP Secure Headers.
 */
export const securityHeaders: RequestHandler = (req, res, next) => {
  // HTTPS only from now on for this address (OWASP Secure Headers); only on a secure request, so a laptop on http stays usable
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
};

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
/**
 * CSRF (OWASP CSRF cheat sheet, «verifying origin with standard headers»): a request that changes data must come from this
 * site. The browser's own Sec-Fetch-Site / Origin say where it came from; a mismatch is refused. A request with neither header
 * is not from a browser page, so it cannot carry a victim's cookie in a forged way (and the cookie is SameSite=Lax as well).
 */
export function sameOriginOnly(publicOrigin?: string): RequestHandler {
  return (req, res, next) => {
    if (SAFE.has(req.method)) return next();
    const site = req.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return void res.status(403).json({ error: { code: 'forbidden', message: 'این درخواست از جای دیگری آمده بود و انجام نشد.' } });
    const origin = req.get('origin');
    if (origin) {
      const host = req.get('x-forwarded-host') ?? req.get('host');
      let ok = false;
      try { ok = publicOrigin ? new URL(origin).origin === new URL(publicOrigin).origin : new URL(origin).host === host; } catch { ok = false; }
      if (!ok) return void res.status(403).json({ error: { code: 'forbidden', message: 'این درخواست از جای دیگری آمده بود و انجام نشد.' } });
    }
    next();
  };
}

/** a small fixed-window limiter (memory only: one server, ten people). Goal: guessing links or flooding error reports cannot be cheap. */
export function rateLimit(opts: { windowMs: number; max: number; key: (req: Request) => string; clock?: () => number }): RequestHandler {
  const hits = new Map<string, { start: number; n: number }>();
  const now = opts.clock ?? (() => Date.now());
  return (req, res, next) => {
    const t = now();
    const k = opts.key(req);
    const h = hits.get(k);
    if (!h || t - h.start >= opts.windowMs) { hits.set(k, { start: t, n: 1 }); if (hits.size > 5000) hits.clear(); return next(); }
    if (++h.n > opts.max) return void res.status(429).json({ error: { code: 'rate_limited', message: 'تعداد تلاش‌ها زیاد بود. چند دقیقهٔ دیگر دوباره امتحان کن.' } });
    next();
  };
}

const readCookie = (req: Request, name: string): string | undefined => {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
};
const secureRequest = (req: Request) => req.secure || req.get('x-forwarded-proto') === 'https';
const cookie = (req: Request, value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureRequest(req) ? '; Secure' : ''}`;

const sameSecret = (a: string, b: string) => crypto.timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));

/**
 * Installs sign-in on the app. Routes it owns: POST /api/join (link code → cookie), GET /api/session, POST /api/logout, POST /api/consent.
 * Everything else under /api gets `req.mabdaUser` or a 401.
 */
/**
 * Microsoft Clarity (user-test session analytics, docs/test-data.md). The project id is a deploy setting (`CLARITY_PROJECT_ID`);
 * unset (development, tests, screenshots) the page never loads it. Only a well-formed id is passed on, never raw input.
 */
export const clarityProjectId = (): string | undefined => {
  const v = process.env.CLARITY_PROJECT_ID?.trim();
  return v && /^[a-z0-9]{6,16}$/i.test(v) ? v : undefined;
};
const sessionBody = (user: RequestUser | null) => ({ mode: 'invite' as const, user, ...(clarityProjectId() ? { clarityId: clarityProjectId() } : {}) });

const toUser = (a: Account): RequestUser => ({ id: a.id, role: a.role, name: a.name, consented: a.role === 'owner' || (a.consentVersion ?? 0) >= OWNER_NOTICE_VERSION });

export function installAuth(app: express.Express, db: SqlLike, mode: AuthMode, opts: { clock?: () => Date; publicOrigin?: string } = {}): { accounts: Accounts } {
  const accounts = new Accounts(db, opts.clock);
  const ipKey = (req: Request) => req.ip ?? 'unknown';

  app.use('/api', sameOriginOnly(opts.publicOrigin));

  if (mode.mode === 'local') {
    app.use('/api', (req, _res, next) => { req.mabdaUser = { id: LOCAL_USER, role: 'local', name: '', consented: true }; next(); });
    app.get('/api/session', (req, res) => { res.json({ mode: 'local', user: req.mabdaUser }); });
    return { accounts };
  }

  // a new owner key signs out every device the owner signed in with an older key (only the key's hash is kept)
  accounts.rememberOwnerKey(sha256(mode.ownerCode));

  // ten tries a minute per address is far more than a person needs and far too few to guess a 128-bit code
  app.post('/api/join', rateLimit({ windowMs: 60_000, max: 10, key: ipKey }), express.json({ limit: '2kb' }), (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    let account = code && code.length <= 200 && sameSecret(code, mode.ownerCode) ? accounts.ensureOwner() : accounts.byCode(code);
    if (account?.disabledAt) account = undefined;
    if (!account) return void res.status(401).json({ error: { code: 'invalid_link', message: 'این لینک دعوت کار نمی‌کند. شاید عوض شده یا خاموش شده است؛ از کسی که آن را فرستاده لینک تازه بخواه.' } });
    const old = readCookie(req, SESSION_COOKIE);
    accounts.endSession(old);
    const s = accounts.startSession(account.id);
    res.setHeader('Set-Cookie', cookie(req, s.token, s.maxAgeSeconds));
    res.json(sessionBody(toUser(account)));
  });

  app.use('/api', (req, _res, next) => {
    const a = accounts.bySession(readCookie(req, SESSION_COOKIE));
    if (a) req.mabdaUser = toUser(a);
    next();
  });
  app.get('/api/session', (req, res) => { res.json(sessionBody(req.mabdaUser ?? null)); });
  app.post('/api/logout', (req, res) => {
    accounts.endSession(readCookie(req, SESSION_COOKIE));
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    res.json({ ok: true });
  });
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    if (!req.mabdaUser) return void res.status(401).json({ error: { code: 'unauthenticated', message: 'برای دیدن داده‌ها اول با لینک دعوت شخصی‌ات وارد شو.' } });
    next();
  });
  // informed consent is stored on the person (not on one device), so the owner can see who has accepted
  app.post('/api/consent', (req, res) => {
    const a = accounts.consent(req.mabdaUser!.id, OWNER_NOTICE_VERSION);
    res.json(sessionBody(a ? toUser(a) : req.mabdaUser ?? null));
  });
  return { accounts };
}

/** only the owner (invite mode) or the one local user may use the owner's tools */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  const role = req.mabdaUser?.role;
  if (role !== 'owner' && role !== 'local') return void res.status(404).json({ error: { code: 'not_found', message: 'پیدا نشد.' } });
  next();
}

export { OWNER_ID };
