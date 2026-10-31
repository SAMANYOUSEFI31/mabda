/**
 * Dependency graph of a workstream spec's deliverables.
 * Pure: used by the editor (block cycles), the studio (order + locks) and the server (validation on save).
 */

import type { DeliverableSpec, WorkstreamSpec } from '../types';

type Node = Pick<DeliverableSpec, 'id' | 'order' | 'dependsOn'>;

/** First dependency cycle as a list of ids (a → b → … → a), or null. */
export function findCycle(items: Node[]): string[] | null {
  const byId = new Map(items.map((d) => [d.id, d]));
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    stack.push(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue;
      if (state.get(dep) === 1) return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) { const c = visit(dep); if (c) return c; }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const d of [...items].sort((a, b) => a.order - b.order)) {
    if (!state.has(d.id)) { const c = visit(d.id); if (c) return c; }
  }
  return null;
}

/** Would adding `from → dependsOn(to)` create a cycle? (editor: disables the choice with a message) */
export function wouldCreateCycle(items: Node[], id: string, newDep: string): boolean {
  if (id === newDep) return true;
  return findCycle(items.map((d) => (d.id === id ? { ...d, dependsOn: [...(d.dependsOn ?? []), newDep] } : d))) !== null;
}

/**
 * Execution order: dependencies first (Kahn), ties broken by `order` so the author's sequence is kept when the graph allows.
 * Throws on a cycle — callers validate first.
 */
export function topologicalOrder<T extends Node>(items: T[]): T[] {
  const ids = new Set(items.map((d) => d.id));
  const indeg = new Map(items.map((d) => [d.id, (d.dependsOn ?? []).filter((x) => ids.has(x)).length]));
  const out: T[] = [];
  const ready = () => items.filter((d) => indeg.get(d.id) === 0 && !out.includes(d)).sort((a, b) => a.order - b.order);
  for (let next = ready()[0]; next; next = ready()[0]) {
    out.push(next);
    for (const d of items) if ((d.dependsOn ?? []).includes(next.id)) indeg.set(d.id, (indeg.get(d.id) ?? 0) - 1);
  }
  if (out.length !== items.length) throw new Error('cycle in deliverable dependencies');
  return out;
}

export interface LockInfo { locked: boolean; missing: DeliverableSpec[] }

/** A deliverable is locked until every dependency has been built (`builtIds` = deliverable spec ids that exist as assets). */
export function lockOf(d: DeliverableSpec, all: DeliverableSpec[], builtIds: Set<string>): LockInfo {
  const missing = (d.dependsOn ?? []).map((id) => all.find((x) => x.id === id)).filter((x): x is DeliverableSpec => !!x && !builtIds.has(x.id));
  return { locked: missing.length > 0, missing };
}

export const lockReason = (info: LockInfo): string =>
  info.locked ? `ابتدا بساز: ${info.missing.map((m) => `«${m.title}»`).join('، ')}` : '';

export interface SpecIssue { path: string; message: string }

/** Everything that must hold before a spec is saved (editor and server). */
export function validateSpec(spec: WorkstreamSpec): SpecIssue[] {
  const issues: SpecIssue[] = [];
  if (!spec.title.trim()) issues.push({ path: 'title', message: 'عنوان جریان کار لازم است.' });
  if (!spec.target.trim()) issues.push({ path: 'target', message: 'هدف جریان کار لازم است.' });
  if (spec.deliverables.length === 0) issues.push({ path: 'deliverables', message: 'حداقل یک خروجی لازم است.' });
  const ids = new Set<string>();
  for (const d of spec.deliverables) {
    if (ids.has(d.id)) issues.push({ path: `deliverables.${d.id}`, message: 'شناسهٔ خروجی تکراری است.' });
    ids.add(d.id);
    if (!d.title.trim()) issues.push({ path: `deliverables.${d.id}`, message: 'عنوان هر خروجی لازم است.' });
    if (d.acceptanceCriteria.every((c) => !c.trim())) issues.push({ path: `deliverables.${d.id}`, message: `«${d.title || 'خروجی'}» حداقل یک معیار پذیرش می‌خواهد.` });
  }
  for (const d of spec.deliverables) {
    for (const dep of d.dependsOn ?? []) {
      if (!ids.has(dep)) issues.push({ path: `deliverables.${d.id}`, message: `وابستگی «${dep}» در این spec وجود ندارد.` });
      if (dep === d.id) issues.push({ path: `deliverables.${d.id}`, message: `«${d.title}» نمی‌تواند به خودش وابسته باشد.` });
    }
  }
  const cycle = findCycle(spec.deliverables);
  if (cycle) {
    const name = (id: string) => spec.deliverables.find((d) => d.id === id)?.title || id;
    issues.push({ path: 'deliverables', message: `وابستگی چرخه‌ای است: ${cycle.map(name).map((n) => `«${n}»`).join(' ← ')}` });
  }
  return issues;
}
