/**
 * Who is signed in (server/auth/http.ts). In the local mode there is always one person; in the invite mode a person signs in by
 * opening their personal link (`/#join=<code>`): the code is exchanged for a cookie once, then removed from the address bar.
 */
import { deadline } from './deadline';

export type SessionRole = 'owner' | 'tester' | 'local';
/** `consented`: the person has accepted the owner-access notice (kept on the server, for the person, not the device) */
export interface SessionUser { id: string; role: SessionRole; name: string; consented: boolean }
export interface SessionInfo { mode: 'local' | 'invite'; user: SessionUser | null; /** Microsoft Clarity project id, only when the deploy sets one (invite mode) */ clarityId?: string }

/** the event every API call raises when the server says «not signed in» (the sign-in screen listens) */
export const SIGNED_OUT_EVENT = 'mabda:signed-out';

export class SessionError extends Error {
  constructor(message: string, public readonly kind: 'invalid_link' | 'network' | 'server') { super(message); }
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: deadline(15_000).signal });
  } catch {
    throw new SessionError('به سرور نرسیدیم. اینترنت را بررسی کن و دوباره امتحان کن.', 'network');
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof j?.error?.message === 'string' ? j.error.message : `خطای سرور (${res.status}). دوباره امتحان کن.`;
    throw new SessionError(message, j?.error?.code === 'invalid_link' ? 'invalid_link' : 'server');
  }
  return j as T;
}

/** the code of a personal link in the address bar (`#join=…`), if any */
export function inviteCodeInAddress(hash: string = window.location.hash): string | undefined {
  const m = /^#join=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** the code never stays in the address bar, the history or a shared screenshot */
export function forgetInviteCode() {
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* not important */ }
}

export const sessionApi = {
  current: () => send<SessionInfo>('GET', '/session'),
  join: (code: string) => send<SessionInfo>('POST', '/join', { code }),
  signOut: () => send<{ ok: true }>('POST', '/logout', {}),
  consent: () => send<SessionInfo>('POST', '/consent', {}),
};
