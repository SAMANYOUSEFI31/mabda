/**
 * BETA-01: a whole workspace as one file, and back.
 *
 * Goal (principle): a person can keep their own copy of a workspace and bring it back whole, with nothing lost or invented:
 * knowledge with every version, thoughts with their revisions and events, relations, the change log, notes, files and their
 * text chunks, boards, packs, metrics, outputs, removal history and the weekly-review mark.
 * Method: the schema decides what belongs to a workspace (every table with workspace_id + user_id), so a table added later is
 * in the backup without anyone remembering. Rows are written as they are stored. Left out on purpose: derived data that is
 * rebuilt (intelligence_* : vectors and suggestions), retired AI keys (mcp_tokens) and templates (a template belongs to the
 * person, not to the workspace it was saved from).
 * A restore never overwrites: it makes a NEW workspace («… (برگردانده‌شده)») with new ids, every reference following
 * (server/db/userIds.ts), so the same file can be restored next to its original, into another account, or twice.
 */
import crypto from 'node:crypto';
import type { Repo } from './repo.ts';
import { RepoError } from './repo.ts';
import type { Scope } from './repo.ts';
import { currentVersion } from './migrations.ts';
import { remapIds } from './userIds.ts';
import type { Workspace } from '../../src/types/index.ts';

export const BACKUP_FORMAT = 'mabda.workspace-backup';
export const BACKUP_VERSION = 1;
/** how many live workspaces a person may have for a restore to go ahead (a disk guard, not a plan) */
export const RESTORE_WORKSPACE_CAP = 20;
const RESTORE_CAP_FA = '۲۰';
const LEFT_OUT = new Set(['workspaces', 'templates', 'mcp_tokens', 'intelligence_embeddings', 'intelligence_suggestions', 'intelligence_reactions']);

export interface WorkspaceBackup {
  format: typeof BACKUP_FORMAT; version: number; schemaVersion: number; exportedAt: string;
  workspace: Workspace;
  weeklyReview: string | null;
  tables: Record<string, Array<Record<string, unknown>>>;
}

type Col = { name: string; pk: number };
const columnsOf = (repo: Repo, table: string): Col[] => repo.db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Col[];
const q = (name: string) => JSON.stringify(name);

/** the tables that hold one workspace's rows, read from the schema itself */
export function workspaceTables(repo: Repo): string[] {
  return (repo.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
    .map((t) => t.name)
    .filter((t) => !LEFT_OUT.has(t) && (() => { const c = columnsOf(repo, t).map((x) => x.name); return c.includes('workspace_id') && c.includes('user_id'); })());
}

export function exportWorkspace(repo: Repo, s: Scope, now: Date = new Date()): WorkspaceBackup {
  const ws = repo.getWorkspace(s.userId, s.workspaceId);
  if (!ws) throw new RepoError('not_found', 'فضا پیدا نشد.');
  const tables: WorkspaceBackup['tables'] = {};
  for (const t of workspaceTables(repo)) {
    const rows = repo.db.prepare(`SELECT * FROM ${q(t)} WHERE workspace_id = ? AND user_id = ?`).all(s.workspaceId, s.userId) as Array<Record<string, unknown>>;
    if (rows.length) tables[t] = rows.map((r) => { const { user_id: _u, workspace_id: _w, ...rest } = r; return rest; });
  }
  const kv = repo.db.prepare('SELECT value FROM kv WHERE user_id = ? AND key = ?').get(s.userId, `weekly_review:${s.workspaceId}`) as { value: string } | undefined;
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: currentVersion(repo.db), exportedAt: now.toISOString(), workspace: ws, weeklyReview: kv?.value ?? null, tables };
}

/** values that are JSON text are remapped inside; other strings as a whole (an id, or `obj:<id>`) */
const remapCell = (v: unknown, ids: ReadonlySet<string>, suffix: string, map: Map<string, string>): unknown => {
  if (typeof v !== 'string') return v;
  if (map.has(v)) return map.get(v);
  const i = v.indexOf(':');
  if (i > 0 && i < 12 && map.has(v.slice(i + 1))) return `${v.slice(0, i + 1)}${map.get(v.slice(i + 1))}`;
  if ((v.startsWith('{') || v.startsWith('[')) && v.length > 1) {
    try { return JSON.stringify(remapIds(JSON.parse(v), ids, suffix)); } catch { return v; }
  }
  return v;
};

export function restoreWorkspace(repo: Repo, userId: string, raw: unknown, now: Date = new Date()): Workspace {
  const b = raw as Partial<WorkspaceBackup> | null;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.tables !== 'object' || !b.workspace || typeof b.workspace !== 'object') throw new RepoError('invalid', 'این فایل پشتیبان یک فضای مبدأ نیست.');
  if ((b.version ?? 0) > BACKUP_VERSION || (b.schemaVersion ?? 0) > currentVersion(repo.db)) throw new RepoError('invalid', 'این پشتیبان را نسخهٔ تازه‌تری از مبدأ ساخته است؛ اول مبدأ را به‌روز کن.');
  const live = workspaceTables(repo);
  const unknown = Object.keys(b.tables!).filter((t) => !live.includes(t));
  if (unknown.length) throw new RepoError('invalid', 'بخشی از این پشتیبان برای این نسخهٔ مبدأ ناشناخته است؛ چیزی برگردانده نشد.');
  // Plans are frozen and hidden this round, so a plan never blocks bringing one's own data back (principle: reversible). The
  // plan written INSIDE the file was also the wrong thing to read (a sample on a small plan was refused, a tampered file passed).
  // A fixed, plain safety cap remains so one person cannot fill the shared disk with copies; it counts only their live workspaces.
  const ws0 = b.workspace as Workspace;
  if (repo.listWorkspaces(userId).filter((w) => !w.isDemo && !w.archivedAt).length >= RESTORE_WORKSPACE_CAP) throw new RepoError('forbidden', `بیش از ${RESTORE_CAP_FA} فضا داری؛ برای برگرداندن، اول یکی را بایگانی یا حذف کن.`);

  // a new id for every row that has its own global id (the workspace too); tree nodes are keyed by workspace already
  const suffix = `_r${crypto.randomBytes(4).toString('hex')}`;
  const ids = new Set<string>([ws0.id]);
  for (const [t, rows] of Object.entries(b.tables!)) {
    const cols = columnsOf(repo, t);
    const pk = cols.filter((c) => c.pk > 0).map((c) => c.name);
    if (pk.length === 1 && pk[0] === 'id') for (const r of rows) if (typeof r.id === 'string') ids.add(r.id);
  }
  const map = new Map([...ids].map((id) => [id, id + suffix]));
  const wsId = map.get(ws0.id)!;
  const ws: Workspace = { ...remapIds(ws0, ids, suffix), id: wsId, name: `${ws0.name} (برگردانده‌شده)`.slice(0, 120), createdAt: now.toISOString() };
  delete ws.isDemo; delete ws.archivedAt;

  repo.transaction(() => {
    repo.db.prepare('INSERT INTO workspaces (id, user_id, workspace_id, data, created_at) VALUES (?,?,?,?,?)').run(wsId, userId, wsId, JSON.stringify(ws), ws.createdAt);
    for (const t of live) {
      const rows = b.tables![t];
      if (!rows?.length) continue;
      // the columns this backup has and this schema knows (a backup from an older version leaves later columns to their default)
      const cols = columnsOf(repo, t).map((c) => c.name).filter((c) => c !== 'user_id' && c !== 'workspace_id' && c in rows[0]);
      const ins = repo.db.prepare(`INSERT INTO ${q(t)} (${[...cols, 'user_id', 'workspace_id'].map(q).join(', ')}) VALUES (${[...cols, 'u', 'w'].map(() => '?').join(', ')})`);
      for (const r of rows) {
        ins.run(...cols.map((c) => remapCell(r[c], ids, suffix, map)), userId, wsId);
      }
    }
    if (typeof b.weeklyReview === 'string') repo.db.prepare('INSERT INTO kv (user_id, key, value) VALUES (?, ?, ?)').run(userId, `weekly_review:${wsId}`, b.weeklyReview);
  });
  return repo.getWorkspace(userId, wsId)!;
}
