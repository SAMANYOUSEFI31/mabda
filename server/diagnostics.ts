/**
 * Error reports from testers' devices and from the server (BETA-05).
 *
 * Goal (principle): when something breaks on someone's phone we learn about it without asking them, and without ever receiving
 * what they wrote. Method: the browser sends only the error's name, its message with every quoted or non-Latin run removed,
 * the code locations of the stack, and the page path (no query, no hash). The server cleans the same way again (the browser is
 * not trusted), keeps the last 2000 reports and prints one line to the host's log.
 */
import crypto from 'node:crypto';
import type { SqlLike } from './db/sql/types.ts';

export interface ErrorReport { id: string; userId: string; source: 'client' | 'server'; name: string; message: string; stack?: string; path?: string; agent?: string; createdAt: string }

const KEEP = 2000;

/**
 * Removes anything that could be a person's own words from an error message: quoted runs ("…", '…', «…», `…`) and every run of
 * non-ASCII letters (Persian text is user text here; the app's own error messages are written in English by the libraries).
 */
export function scrubMessage(v: unknown, max = 240): string {
  const s = typeof v === 'string' ? v : '';
  return s
    .replace(/"[^"]*"|'[^']*'|«[^»]*»|`[^`]*`|“[^”]*”/g, '…')
    .replace(/[^\x20-\x7E]+/g, '…')
    .replace(/(…\s*)+/g, '… ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** keeps only code locations of a stack ("at fn (file:line:col)"): function names and files, no values */
export function scrubStack(v: unknown, maxLines = 12): string | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  const lines = v.split('\n').map((l) => l.trim()).filter((l) => /^at\s|@/.test(l)).slice(0, maxLines)
    .map((l) => l.replace(/[?#][^\s):]*/g, '').replace(/[^\x20-\x7E]+/g, '…').slice(0, 200));
  return lines.length ? lines.join('\n') : undefined;
}

/** a page path without query or hash (an invite code lives in the hash; search text could live in the query) */
export const scrubPath = (v: unknown): string | undefined => (typeof v === 'string' && v.startsWith('/') ? v.split(/[?#]/)[0].replace(/[^\x20-\x7E]+/g, '…').slice(0, 120) : undefined);
const scrubName = (v: unknown) => (typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,59}$/.test(v) ? v : 'Error');

export class ErrorLog {
  constructor(private readonly db: SqlLike, private readonly clock: () => Date = () => new Date()) {}

  record(userId: string, source: 'client' | 'server', raw: { name?: unknown; message?: unknown; stack?: unknown; path?: unknown; agent?: unknown }): ErrorReport {
    const r: ErrorReport = {
      id: `err_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, userId, source, name: scrubName(raw.name), message: scrubMessage(raw.message),
      ...(scrubStack(raw.stack) ? { stack: scrubStack(raw.stack) } : {}), ...(scrubPath(raw.path) ? { path: scrubPath(raw.path) } : {}),
      ...(typeof raw.agent === 'string' ? { agent: raw.agent.replace(/[^\x20-\x7E]+/g, '').slice(0, 160) } : {}),
      createdAt: this.clock().toISOString(),
    };
    this.db.prepare('INSERT INTO client_errors (id, user_id, source, name, message, stack, path, agent, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(r.id, r.userId, r.source, r.name, r.message, r.stack ?? null, r.path ?? null, r.agent ?? null, r.createdAt);
    // keep the newest KEEP (portable SQL: no SQLite-only LIMIT -1)
    this.db.prepare('DELETE FROM client_errors WHERE created_at < (SELECT created_at FROM client_errors ORDER BY created_at DESC LIMIT 1 OFFSET ?)').run(KEEP - 1);
    // one line in the host's log: enough to notice, nothing personal
    console.error(`[${source}-error] user=${userId} ${r.name}: ${r.message}${r.path ? ` (${r.path})` : ''}`);
    return r;
  }

  /** newest first; only the owner reads this (server/auth/owner.ts) */
  list(limit = 200): ErrorReport[] {
    return (this.db.prepare('SELECT * FROM client_errors ORDER BY created_at DESC, id DESC LIMIT ?').all(Math.min(Math.max(1, limit), KEEP)) as Array<Record<string, unknown>>).map((x) => ({
      id: x.id as string, userId: x.user_id as string, source: x.source as ErrorReport['source'], name: x.name as string, message: x.message as string,
      ...(x.stack ? { stack: x.stack as string } : {}), ...(x.path ? { path: x.path as string } : {}), ...(x.agent ? { agent: x.agent as string } : {}), createdAt: x.created_at as string,
    }));
  }
}
