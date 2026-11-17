/**
 * People and sign-in (docs/deploy.md → «ورود با لینک دعوت»).
 *
 * Goal (principle): each tester sees only their own data, and nobody can reach anyone's data without their personal key.
 * Method (chosen here, not a rule): one personal invite link per person. The link carries a random 128-bit code; opening it
 * once on a device exchanges it for a sign-in cookie, so the person never types anything. The owner can make a new link
 * (the old one stops working) or turn a person off (every device of theirs is signed out at once).
 * Standard floor (OWASP ASVS V2/V3): codes and session tokens come from a CSPRNG, are stored only as SHA-256, are compared
 * by hash lookup (no early-exit string compare of secrets), the cookie is HttpOnly + SameSite=Lax + Secure on HTTPS, and
 * sessions expire.
 */
import { tehranDay } from '../../src/core/tehranDate.ts';
import crypto from 'node:crypto';
import type { SqlLike } from '../db/sql/types.ts';

export type Role = 'owner' | 'tester';
export interface Account { id: string; name: string; role: Role; createdAt: string; disabledAt?: string; lastSeenAt?: string; consentedAt?: string; /** the notice version accepted (src/core/ownerNotice.ts) */ consentVersion?: number; hasLink: boolean }

/** the id the owner signs in as; also the user_id of the owner's own data */
export const OWNER_ID = 'owner';
/** how long one sign-in on one device lasts (a tester re-opens their link after this) */
export const SESSION_DAYS = 60;

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
/** 16 random bytes → 22 url-safe characters: a link code no one can guess (2^128) */
export const newCode = () => crypto.randomBytes(16).toString('base64url');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const nowIso = (d = new Date()) => d.toISOString();

const rowToAccount = (r: Record<string, unknown>): Account => ({
  id: r.id as string, name: r.name as string, role: r.role as Role, createdAt: r.created_at as string,
  ...(r.disabled_at ? { disabledAt: r.disabled_at as string } : {}), ...(r.last_seen_at ? { lastSeenAt: r.last_seen_at as string } : {}),
  ...(r.consented_at ? { consentedAt: r.consented_at as string } : {}),
  ...(r.consent_version ? { consentVersion: r.consent_version as number } : {}),
  hasLink: !!r.invite_hash,
});

export class Accounts {
  constructor(private readonly db: SqlLike, private readonly clock: () => Date = () => new Date()) {}

  list(): Account[] {
    return (this.db.prepare('SELECT * FROM accounts ORDER BY created_at, id').all() as Array<Record<string, unknown>>).map(rowToAccount);
  }

  get(id: string): Account | undefined {
    const r = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? rowToAccount(r) : undefined;
  }

  /** the owner's account exists from the first sign-in; its key is MABDA_OWNER_CODE (never stored) */
  /** the owner key changed since the last start: end every owner session (the hash is kept in the owner's invite_hash slot) */
  rememberOwnerKey(hash: string): void {
    const owner = this.ensureOwner();
    const was = (this.db.prepare('SELECT invite_hash FROM accounts WHERE id = ?').get(OWNER_ID) as { invite_hash: string | null } | undefined)?.invite_hash ?? null;
    if (was === hash) return;
    this.db.prepare('UPDATE accounts SET invite_hash = ? WHERE id = ?').run(hash, owner.id);
    if (was !== null) this.db.prepare('DELETE FROM auth_sessions WHERE account_id = ?').run(OWNER_ID);
  }

  ensureOwner(): Account {
    this.db.prepare("INSERT OR IGNORE INTO accounts (id, name, role, created_at) VALUES (?, 'صاحب محصول', 'owner', ?)").run(OWNER_ID, nowIso(this.clock()));
    return this.get(OWNER_ID)!;
  }

  /** a new person and their personal link code (returned once: only its hash is kept) */
  invite(name: string): { account: Account; code: string } {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!clean) throw new AuthError('invalid', 'یک نام برای این نفر بنویس.');
    const id = `u_${crypto.randomBytes(8).toString('hex')}`;
    const code = newCode();
    this.db.prepare("INSERT INTO accounts (id, name, role, invite_hash, created_at) VALUES (?, ?, 'tester', ?, ?)").run(id, clean, sha256(code), nowIso(this.clock()));
    return { account: this.get(id)!, code };
  }

  /** a new link for the same person and the same data; the old link stops working and every device is signed out */
  rotate(id: string): string {
    const a = this.get(id);
    if (!a || a.role !== 'tester') throw new AuthError('not_found', 'این نفر پیدا نشد.');
    const code = newCode();
    this.db.transaction(() => {
      this.db.prepare('UPDATE accounts SET invite_hash = ? WHERE id = ?').run(sha256(code), id);
      this.db.prepare('DELETE FROM auth_sessions WHERE account_id = ?').run(id);
    })();
    return code;
  }

  /** off: the link stops working and every device is signed out; their data stays (on again = the same data) */
  setDisabled(id: string, disabled: boolean): Account {
    const a = this.get(id);
    if (!a || a.role !== 'tester') throw new AuthError('not_found', 'این نفر پیدا نشد.');
    this.db.transaction(() => {
      this.db.prepare('UPDATE accounts SET disabled_at = ? WHERE id = ?').run(disabled ? nowIso(this.clock()) : null, id);
      if (disabled) this.db.prepare('DELETE FROM auth_sessions WHERE account_id = ?').run(id);
    })();
    return this.get(id)!;
  }

  /** the tester whose link this is (none for a wrong, replaced or turned-off link) */
  /** the person read the owner-access notice of `version` and accepted it (accepting the same version again never moves the date) */
  consent(id: string, version: number): Account | undefined {
    this.db.prepare('UPDATE accounts SET consented_at = ?, consent_version = ? WHERE id = ? AND (consent_version IS NULL OR consent_version < ?)').run(nowIso(this.clock()), version, id, version);
    return this.get(id);
  }

  byCode(code: string): Account | undefined {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return undefined;
    const r = this.db.prepare('SELECT * FROM accounts WHERE invite_hash = ? AND disabled_at IS NULL').get(sha256(code)) as Record<string, unknown> | undefined;
    return r ? rowToAccount(r) : undefined;
  }

  startSession(accountId: string): { token: string; maxAgeSeconds: number } {
    const token = newToken();
    const now = this.clock();
    const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
    this.db.prepare('INSERT INTO auth_sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), accountId, nowIso(now), nowIso(expires));
    // expired sessions are cleared on the way (no timer needed for ten people)
    this.db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(nowIso(now));
    return { token, maxAgeSeconds: SESSION_DAYS * 86_400 };
  }

  /** the signed-in account of a cookie value (none = signed out, expired or turned off) */
  bySession(token: string | undefined): Account | undefined {
    if (!token || token.length > 128) return undefined;
    const r = this.db.prepare(`SELECT a.* FROM auth_sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled_at IS NULL`).get(sha256(token), nowIso(this.clock())) as Record<string, unknown> | undefined;
    if (!r) return undefined;
    const a = rowToAccount(r);
    // "last seen" per day is enough to tell the owner who is testing; it is not a tracking log
    const day = tehranDay(this.clock());
    if (!a.lastSeenAt || tehranDay(a.lastSeenAt) !== day) this.db.prepare('UPDATE accounts SET last_seen_at = ? WHERE id = ?').run(nowIso(this.clock()), a.id);
    return a;
  }

  endSession(token: string | undefined) {
    if (token) this.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(token));
  }
}

export class AuthError extends Error {
  constructor(public code: 'invalid' | 'not_found' | 'forbidden' | 'unauthenticated', message: string) { super(message); }
}
