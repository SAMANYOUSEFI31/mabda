import type { Repo } from './repo.ts';
import type { Workspace } from '../../src/types/index.ts';
import { buildDemo, DEMO_ID, tehranAt } from '../../src/core/demoData.ts';
import type { DemoData } from '../../src/core/demoData.ts';

/** the one showcase workspace of an account (canonical id for the local/dev user) */
export const DEMO_WORKSPACE_ID = DEMO_ID;

/**
 * Stable namespace so two users can both own a demo without colliding on `id TEXT PRIMARY KEY`.
 * The local/dev user keeps the canonical fixed ids (tests and single-user demos stay identical).
 * Any other userId gets a short deterministic prefix on every entity id.
 */
export function demoWorkspaceIdFor(userId: string): string {
  return userId === 'local' ? DEMO_WORKSPACE_ID : ns(userId, DEMO_WORKSPACE_ID);
}

function ns(userId: string, id: string): string {
  if (userId === 'local') return id;
  const p = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'u';
  return `${p}__${id}`;
}

function namespaceDemoData(userId: string, data: DemoData, workspaceId: string): DemoData {
  if (userId === 'local') {
    // still rewrite workspaceId on objects/notes/etc. when caller passes a non-default id
    if (workspaceId === DEMO_WORKSPACE_ID) return data;
  }
  const N = (id: string) => ns(userId, id);
  return {
    nodes: data.nodes.map((n) => ({ ...n, id: N(n.id), ...(n.parentId ? { parentId: N(n.parentId) } : {}) })),
    objects: data.objects.map((o) => ({
      ...o,
      id: N(o.id),
      workspaceId,
      nodeId: N(o.nodeId),
      ...(o.supersededById ? { supersededById: N(o.supersededById) } : {}),
      ...(o.source?.noteId ? { source: { ...o.source, noteId: N(o.source.noteId) } } : {}),
      ...(o.record?.metricExpectation ? {
        record: {
          ...o.record,
          metricExpectation: { ...o.record.metricExpectation, metricId: N(o.record.metricExpectation.metricId) },
        },
      } : {}),
    })),
    versions: data.versions.map((v) => ({ ...v, objectId: N(v.objectId) })),
    relationships: data.relationships.map((r) => ({
      ...r,
      id: N(r.id),
      sourceId: N(r.sourceId),
      targetId: N(r.targetId),
    })),
    changes: data.changes.map((c) => ({
      ...c,
      id: N(c.id),
      workspaceId,
      objectId: N(c.objectId),
      ...(c.after && typeof c.after === 'object' && c.after !== null && 'supersededById' in (c.after as object)
        ? { after: { ...(c.after as Record<string, unknown>), supersededById: N(String((c.after as { supersededById?: string }).supersededById)) } }
        : {}),
    })),
    notes: data.notes.map((n) => ({ ...n, id: N(n.id), workspaceId, nodeId: N(n.nodeId) })),
    file: {
      ...data.file,
      id: N(data.file.id),
      nodeId: N(data.file.nodeId),
    },
    specs: data.specs.map((sp) => ({
      ...sp,
      id: N(sp.id),
      requiredContext: sp.requiredContext.map((x) => ({ ...x, nodeId: N(x.nodeId) })),
      suggestedContext: sp.suggestedContext.map((x) => ({ ...x, nodeId: N(x.nodeId) })),
      optionalContext: sp.optionalContext.map((x) => ({ ...x, nodeId: N(x.nodeId) })),
    })),
    deliverables: data.deliverables.map((d) => ({
      ...d,
      id: N(d.id),
      workspaceId,
      workstreamId: N(d.workstreamId),
      usedContext: d.usedContext.map((u) => ({ ...u, id: N(u.id) })),
      ...(d.usedFileChunks ? { usedFileChunks: d.usedFileChunks.map((c) => ({ ...c, fileId: N(c.fileId) })) } : {}),
    })),
    canvas: {
      decisions: data.canvas.decisions.map((i) => ({ ...i, itemRef: N(i.itemRef) })),
      free: data.canvas.free.map((i) => ({ ...i, itemRef: N(i.itemRef) })),
    },
    packs: data.packs.map((p) => ({
      ...p,
      id: N(p.id),
      workspaceId,
      selection: {
        ...p.selection,
        nodeIds: p.selection.nodeIds.map(N),
      },
    })),
    templates: data.templates.map((t) => ({ ...t, id: N(t.id) })),
    samples: data.samples.map((x) => ({ ...x, id: N(x.id), nodeId: N(x.nodeId) })),
    metrics: data.metrics.map((m) => ({ ...m, id: N(m.id) })),
    measurements: data.measurements.map((x) => ({ ...x, id: N(x.id), metricId: N(x.metricId) })),
  };
}

/**
 * Builds — or rebuilds from nothing — the showcase workspace («قهوهٔ تخصصی آنلاین»). Idempotent: every run deletes all data of
 * that workspace first and then inserts the same content (dates relative to `now`). Nothing stored here is an AI output or an AI
 * judgement; ids, versions and timestamps are written exactly as the builder says, bypassing the plan caps on purpose.
 *
 * Multi-user safety (DB-PG-01): entity primary keys are global (`id TEXT PRIMARY KEY`). For any user other than `local`,
 * every fixed demo id is namespaced so two accounts can each hold a full demo without Duplicate Key collisions.
 */
export function applyDemo(repo: Repo, userId: string, now: Date): Workspace {
  const workspaceId = demoWorkspaceIdFor(userId);
  const s = { userId, workspaceId };
  const ws: Workspace = {
    id: workspaceId,
    name: 'قهوهٔ تخصصی آنلاین',
    slug: userId === 'local' ? 'demo-coffee' : `demo-coffee-${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'u'}`,
    description: 'فضای نمونهٔ کامل برای بررسی محصول؛ داده‌ها ساختگی‌اند.',
    planId: 'max',
    creditsRemaining: 150,
    todayChatCount: 0,
    isDemo: true,
    enabledSpecIds: [],
    createdAt: now.toISOString(),
  };
  const raw = buildDemo(now);
  const data = namespaceDemoData(userId, raw, workspaceId);
  repo.db.transaction(() => {
    const exists = !!repo.getWorkspace(userId, workspaceId);
    repo.saveWorkspace(
      userId,
      exists
        ? { ...repo.getWorkspace(userId, workspaceId)!, ...ws, createdAt: repo.getWorkspace(userId, workspaceId)!.createdAt }
        : ws,
      { demo: true, skipLimit: true },
    );
    if (exists) repo.resetWorkspaceData(s);
    for (const n of data.nodes) repo.importNode(s, n);
    for (const o of data.objects) repo.importObject(s, o, { silent: true });
    for (const v of data.versions) repo.importVersion(s, v);
    for (const r of data.relationships) repo.importRelationship(s, r);
    for (const c of data.changes) repo.importChange(s, c);
    for (const n of data.notes) repo.importNote(s, n);
    repo.importFile(s, data.file);
    data.specs.forEach((sp, i) => repo.importSpec(s, sp, tehranAt(now, 30, 10, data.specs.length - i)));
    for (const d of data.deliverables) repo.saveDeliverable(s, d);
    for (const i of data.canvas.decisions) repo.saveCanvasItem(s, 'decisions', i.itemRef, i);
    for (const i of data.canvas.free) repo.saveCanvasItem(s, 'free', i.itemRef, i);
    for (const p of data.packs) repo.importSavedPack(s, p);
    for (const t of data.templates) repo.saveTemplate(s, t.kind, t.name, t.payload, t.at, t.id);
    for (const x of data.samples) repo.createSample(s, x);
    for (const m of data.metrics) repo.createMetric(s, { id: m.id, name: m.name, unit: m.unit, direction: m.direction, target: m.target, at: m.at }, { actor: 'user' });
    for (const x of data.measurements) {
      repo.addMeasurement(
        s,
        { id: x.id, metricId: x.metricId, value: x.value, at: x.day, note: x.note, source: 'demo', createdAt: `${x.day}T09:00:00.000Z` },
        { actor: 'user' },
      );
    }
  })();
  return repo.getWorkspace(userId, workspaceId)!;
}
