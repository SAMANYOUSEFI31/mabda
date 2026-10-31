import type { ChatSession, ContextObject, ContextRelationship, GeneratedDeliverable, LedgerEntry, Workspace, WorkstreamSpec } from '../../src/types/index.ts';
import { INITIAL_CONTEXT_OBJECTS, INITIAL_DELIVERABLES, INITIAL_LEDGER, INITIAL_RELATIONSHIPS, INITIAL_WORKSPACES } from '../../src/core/seedData.ts';
import { WORKSTREAM_SPECS } from '../../src/core/specs.ts';
import type { Repo } from './repo.ts';

/** Everything the old localStorage-based client kept. Sent once by the browser to POST /api/bootstrap. */
export interface LegacyPayload {
  workspaces?: Workspace[];
  contextObjects?: ContextObject[];
  relationships?: ContextRelationship[];
  deliverables?: Array<GeneratedDeliverable & { usedContextIds?: string[] }>;
  ledger?: LedgerEntry[];
  specs?: WorkstreamSpec[];
  sessions?: Record<string, ChatSession[]>;
}

export interface ImportCounts { workspaces: number; objects: number; deliverables: number; ledger: number; sessions: number; specs: number }

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * One-time import. Idempotent per user (`kv.legacy_import`). Legacy assets only knew object ids, not versions:
 * they are imported at the version those objects have in the import (1 for legacy data), so nothing is falsely «stale».
 */
export function importLegacy(repo: Repo, userId: string, payload: LegacyPayload, source = 'localStorage'): ImportCounts | { skipped: true } {
  if (repo.isImported(userId)) return { skipped: true };
  const counts: ImportCounts = { workspaces: 0, objects: 0, deliverables: 0, ledger: 0, sessions: 0, specs: 0 };
  repo.db.transaction(() => {
    const workspaces = arr<Workspace>(payload.workspaces);
    for (const ws of workspaces) { repo.saveWorkspace(userId, ws); counts.workspaces++; }
    const known = new Set(workspaces.map((w) => w.id));
    const objects = arr<ContextObject>(payload.contextObjects).filter((o) => known.has(o.workspaceId));
    for (const o of objects) { repo.importObject({ userId, workspaceId: o.workspaceId }, { ...o, version: o.version ?? 1 }); counts.objects++; }
    const versionOf = new Map(objects.map((o) => [o.id, o.version ?? 1]));
    for (const r of arr<ContextRelationship>(payload.relationships)) {
      const w = objects.find((o) => o.id === r.sourceId)?.workspaceId;
      if (w) repo.importRelationship({ userId, workspaceId: w }, r);
    }
    for (const d of arr<GeneratedDeliverable & { usedContextIds?: string[] }>(payload.deliverables)) {
      if (!known.has(d.workspaceId)) continue;
      const { usedContextIds, ...rest } = d;
      const usedContext = rest.usedContext ?? (usedContextIds ?? []).map((id) => ({ id, version: versionOf.get(id) ?? 1 }));
      repo.saveDeliverable({ userId, workspaceId: d.workspaceId }, { ...rest, usedContext } as GeneratedDeliverable);
      counts.deliverables++;
    }
    for (const l of arr<LedgerEntry>(payload.ledger)) {
      if (!known.has(l.workspaceId)) continue;
      repo.addLedger({ userId, workspaceId: l.workspaceId }, l); counts.ledger++;
    }
    for (const [wid, list] of Object.entries(payload.sessions ?? {})) {
      if (!known.has(wid)) continue;
      for (const c of arr<ChatSession>(list)) { repo.saveSession({ userId, workspaceId: wid }, c); counts.sessions++; }
    }
    // custom specs only; built-ins come from code
    const builtIn = new Set(WORKSTREAM_SPECS.map((s) => s.id));
    const first = workspaces[0]?.id;
    if (first) for (const sp of arr<WorkstreamSpec>(payload.specs)) if (!builtIn.has(sp.id)) { repo.saveSpec({ userId, workspaceId: first }, sp); counts.specs++; }
    repo.markImported(userId, source);
  })();
  return counts;
}

/** First run without any old browser data: the same sample workspaces the prototype always started with. */
export function seedPayload(): LegacyPayload {
  return {
    workspaces: INITIAL_WORKSPACES, contextObjects: INITIAL_CONTEXT_OBJECTS, relationships: INITIAL_RELATIONSHIPS,
    deliverables: INITIAL_DELIVERABLES, ledger: INITIAL_LEDGER,
  };
}
