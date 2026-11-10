/**
 * Recorded Context packs and named, saved packs.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { RepoError, Scope, cleanFacets, newId, now } from './shared.ts';
import { REQUEST_MAX_CHARS, isRequestKind } from '../../../src/core/aiRequest.ts';
import type { PackSelection, SavedPack } from '../../../src/types/index.ts';

export const packsMethods = {
  savePack(this: Repo, s: Scope, p: { title: string; specId?: string; deliverableId?: string; refs: Array<{ id: string; version: number }>; tokens: number }, id: string = newId('pack')): { id: string; createdAt: string } {
    const createdAt = now();
    this.db.prepare('INSERT INTO context_packs (id, user_id, workspace_id, title, spec_id, deliverable_id, refs, tokens, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, s.userId, s.workspaceId, p.title, p.specId ?? null, p.deliverableId ?? null, JSON.stringify(p.refs), p.tokens, createdAt);
    return { id, createdAt };
  },

  getPack(this: Repo, s: Scope, id: string): { id: string; title: string; specId?: string; deliverableId?: string; refs: Array<{ id: string; version: number }>; tokens: number; createdAt: string } | undefined {
    const r = this.db.prepare('SELECT * FROM context_packs WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? { id: r.id as string, title: r.title as string, ...(r.spec_id ? { specId: r.spec_id as string } : {}), ...(r.deliverable_id ? { deliverableId: r.deliverable_id as string } : {}), refs: JSON.parse(r.refs as string), tokens: r.tokens as number, createdAt: r.created_at as string } : undefined;
  },

  listPacks(this: Repo, s: Scope, limit = 10) {
    return (this.db.prepare('SELECT id, title, tokens, created_at FROM context_packs WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?').all(s.workspaceId, s.userId, limit) as Array<Record<string, unknown>>)
      .map((r) => ({ id: r.id as string, title: r.title as string, tokens: r.tokens as number, createdAt: r.created_at as string }));
  },

  cleanSelection(this: Repo, s: Scope, sel: Partial<PackSelection> | undefined): PackSelection {
    const nodes = new Set(this.listNodes(s).map((n) => n.id));
    return {
      nodeIds: [...new Set((Array.isArray(sel?.nodeIds) ? sel!.nodeIds : []).filter((n): n is string => typeof n === 'string' && nodes.has(n)))].slice(0, 40),
      facets: cleanFacets(sel?.facets) ?? [],
      statuses: (['Proposed', 'Needs Review'] as const).filter((st) => Array.isArray(sel?.statuses) && (sel!.statuses as string[]).includes(st)),
      includeAssumptions: sel?.includeAssumptions !== false,
      withChildren: sel?.withChildren === true,
    };
  },

  rowToPack(this: Repo, r: Record<string, unknown>): SavedPack {
    return { id: r.id as string, workspaceId: r.workspace_id as string, name: r.name as string, selection: JSON.parse(r.selection as string) as PackSelection, instruction: (r.instruction as string) ?? '', createdAt: r.created_at as string, updatedAt: r.updated_at as string, ...(isRequestKind(r.kind) ? { kind: r.kind, template: (r.template as string) ?? '' } : {}) };
  },

  listSavedPacks(this: Repo, s: Scope): SavedPack[] {
    return (this.db.prepare('SELECT * FROM saved_packs WHERE workspace_id = ? AND user_id = ? ORDER BY updated_at DESC, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map((r) => this.rowToPack(r));
  },

  getSavedPack(this: Repo, s: Scope, id: string): SavedPack | undefined {
    const r = this.db.prepare('SELECT * FROM saved_packs WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? this.rowToPack(r) : undefined;
  },

  saveSavedPack(this: Repo, s: Scope, input: { id?: string; name: string; selection?: Partial<PackSelection>; instruction?: string; kind?: unknown; template?: unknown }): SavedPack {
    this.assertWorkspace(s);
    const name = input.name?.trim().slice(0, 80);
    if (!name) throw new RepoError('invalid', 'نام بسته لازم است.');
    const selection = JSON.stringify(this.cleanSelection(s, input.selection));
    const instruction = (input.instruction ?? '').trim().slice(0, 1000);
    const kind = isRequestKind(input.kind) ? input.kind : null;
    const template = kind ? String(input.template ?? '').trim().slice(0, REQUEST_MAX_CHARS) : null;
    const t = now();
    if (input.id) {
      const r = this.db.prepare('UPDATE saved_packs SET name = ?, selection = ?, instruction = ?, kind = ?, template = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(name, selection, instruction, kind, template, t, input.id, s.workspaceId, s.userId);
      if (!r.changes) throw new RepoError('not_found', 'بسته پیدا نشد.');
      return this.getSavedPack(s, input.id)!;
    }
    const id = newId('pk');
    this.db.prepare('INSERT INTO saved_packs (id, user_id, workspace_id, name, selection, instruction, kind, template, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, s.userId, s.workspaceId, name, selection, instruction, kind, template, t, t);
    return this.getSavedPack(s, id)!;
  },

  /** a pack that is still being built: cleaned the way a saved one is, never stored (the live preview) */
  draftSavedPack(this: Repo, s: Scope, input: { selection?: Partial<PackSelection>; instruction?: string; kind?: unknown; template?: unknown }): Pick<SavedPack, 'selection' | 'instruction' | 'kind' | 'template'> {
    const kind = isRequestKind(input.kind) ? input.kind : undefined;
    return { selection: this.cleanSelection(s, input.selection), instruction: (input.instruction ?? '').trim().slice(0, 1000), ...(kind ? { kind, template: String(input.template ?? '').trim().slice(0, REQUEST_MAX_CHARS) } : {}) };
  },

  /** the demo builder: raw insert with explicit timestamps */
  importSavedPack(this: Repo, s: Scope, p: SavedPack) {
    this.db.prepare('INSERT OR REPLACE INTO saved_packs (id, user_id, workspace_id, name, selection, instruction, kind, template, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(p.id, s.userId, s.workspaceId, p.name, JSON.stringify(this.cleanSelection(s, p.selection)), p.instruction, p.kind ?? null, p.kind ? (p.template ?? '') : null, p.createdAt, p.updatedAt);
  },

  deleteSavedPack(this: Repo, s: Scope, id: string) {
    this.db.prepare('DELETE FROM saved_packs WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
  },
};
