/**
 * The user-test record on the server (docs/test-data.md): an append-only log of actions and screens, never of text.
 *
 * - Every request that changes something (POST/PUT/PATCH/DELETE under /api) is one `action` event: the route TEMPLATE
 *   ("POST /workspaces/:wid/objects", never the ids in the path), the answer's status, the server time, and the label fields of
 *   the body (src/core/activity.ts → actionProps). Recorded when the answer is sent, so a refusal and a failure are recorded too.
 * - The browser sends `ui` events (screens, dialogs, visits, a heartbeat while someone is using the page) to POST /api/activity.
 * Reads (GET) are not recorded: the browser's `view` events say what was looked at, without one row per data fetch.
 * Owner-only reads and exports live in server/auth/owner.ts.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { SqlLike } from './db/sql/types.ts';
import { actionProps, cleanProps, isUiEvent } from '../src/core/activity.ts';
import type { ActivityEvent, ActivityKind, Props } from '../src/core/activity.ts';

const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
const SPACE = /^[A-Za-z0-9_-]{1,80}$/;
/** routes whose requests are not the person's own actions: the log itself, error reports, owner tools, counters, sign-in */
const SKIP = /^\/api\/(activity|client-errors|owner|usage|health|join|logout|session)(\/|$)/;

const newId = () => `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

export class ActivityLog {
  constructor(private readonly db: SqlLike, private readonly clock: () => Date = () => new Date(), private readonly isSample?: (userId: string, spaceId: string) => boolean) {}

  record(e: { userId: string; sessionId?: string; spaceId?: string; kind: ActivityKind; name: string; status?: number; ms?: number; props?: Props; at?: string }): void {
    this.db.prepare('INSERT INTO activity_events (id, user_id, session_id, space_id, kind, name, status, ms, props, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      newId(), e.userId, e.sessionId && SESSION.test(e.sessionId) ? e.sessionId : null, e.spaceId && SPACE.test(e.spaceId) ? e.spaceId : null,
      e.kind, e.name.slice(0, 120), e.status ?? null, e.ms === undefined ? null : Math.max(0, Math.round(e.ms)), e.props ? JSON.stringify(e.props) : null,
      e.at ?? this.clock().toISOString(),
    );
  }

  /**
   * A batch from the browser: at most 50 events, each a known ui name with clean props. The time is the server's (a device
   * clock can be wrong by hours), shifted back by the event's own age in the batch (`ago`, at most 10 minutes).
   */
  recordUi(userId: string, sessionHeader: string | undefined, raw: unknown): number {
    const list = Array.isArray((raw as { events?: unknown })?.events) ? (raw as { events: unknown[] }).events.slice(0, 50) : [];
    const now = this.clock().getTime();
    let n = 0;
    this.db.transaction(() => {
      for (const x of list) {
        const ev = x as { name?: unknown; space?: unknown; props?: unknown; ms?: unknown; ago?: unknown };
        if (!isUiEvent(ev.name)) continue;
        const ago = typeof ev.ago === 'number' && Number.isFinite(ev.ago) ? Math.min(Math.max(0, ev.ago), 600_000) : 0;
        this.record({
          userId, sessionId: sessionHeader, spaceId: typeof ev.space === 'string' ? ev.space : undefined, kind: 'ui', name: ev.name,
          ms: typeof ev.ms === 'number' && Number.isFinite(ev.ms) ? Math.min(ev.ms, 86_400_000) : undefined, props: cleanProps(ev.props),
          at: new Date(now - ago).toISOString(),
        });
        n++;
      }
    })();
    return n;
  }

  /** Express middleware: one `action` per changing request, written when the answer goes out. Never fails a request. */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || SKIP.test(req.originalUrl.split('?')[0])) return next();
      const start = process.hrtime.bigint();
      // the route's params and the ids in the answer are read while the matched route still holds them
      let params: Record<string, string> = {}; let template: string | undefined; let result: Props = {};
      const json = res.json.bind(res);
      res.json = (body: unknown) => {
        try {
          params = { ...req.params }; template = req.route?.path as string | undefined;
          const b = body as Record<string, unknown> | undefined;
          for (const k of ['object', 'note', 'thought', 'file', 'node', 'deliverable', 'pack']) {
            const id = (b?.[k] as { id?: unknown } | undefined)?.id;
            if (typeof id === 'string' && SPACE.test(id)) result[`${k}Id`] = id;
          }
          if (Array.isArray(b?.thoughts)) result.thoughts = (b!.thoughts as unknown[]).length;
        } catch { result = {}; }
        return json(body);
      };
      res.on('finish', () => {
        try {
          const userId = req.mabdaUser?.id;
          // nothing is recorded before the person has read and accepted the notice that says so, except that acceptance itself
          const route = (template ?? (req.route?.path as string | undefined))?.replace(/^\/api(?=\/)/, '');
          if (!userId || (req.mabdaUser?.consented === false && route !== '/consent')) return;
          const name = `${req.method} ${route ?? 'unmatched'}`;
          const spaceId = params.wid ?? req.params?.wid;
          const props: Props = { ...(actionProps(req.body) ?? {}), ...result };
          if (params.id && SPACE.test(params.id)) props.id = params.id;
          if (spaceId && this.isSample?.(userId, spaceId)) props.sample = true;
          const ms = Number(process.hrtime.bigint() - start) / 1e6;
          this.record({ userId, sessionId: req.get('x-mabda-session') ?? undefined, spaceId, kind: 'action', name, status: res.statusCode, ms, props: Object.keys(props).length ? props : undefined });
        } catch { /* the record must never break the product */ }
      });
      next();
    };
  }

  /** every event, oldest first (the owner's export and the measures) */
  list(f: { since?: string } = {}): ActivityEvent[] {
    const rows = (f.since
      ? this.db.prepare('SELECT * FROM activity_events WHERE created_at >= ? ORDER BY created_at, id').all(f.since)
      : this.db.prepare('SELECT * FROM activity_events ORDER BY created_at, id').all()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string, userId: r.user_id as string, ...(r.session_id ? { sessionId: r.session_id as string } : {}), ...(r.space_id ? { spaceId: r.space_id as string } : {}),
      kind: r.kind as ActivityKind, name: r.name as string,
      ...(r.status !== null && r.status !== undefined ? { status: Number(r.status) } : {}), ...(r.ms !== null && r.ms !== undefined ? { ms: Number(r.ms) } : {}),
      ...(r.props ? { props: JSON.parse(r.props as string) as Props } : {}), at: r.created_at as string,
    }));
  }

  /** client error reports per person (for the error measure) */
  clientErrorsByUser(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.db.prepare("SELECT user_id, COUNT(*) AS n FROM client_errors WHERE source = 'client' GROUP BY user_id").all() as Array<{ user_id: string; n: number | string }>) out[r.user_id] = Number(r.n);
    return out;
  }
}
