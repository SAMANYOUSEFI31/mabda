/**
 * Thoughts: stable identity, revisions, about, derivation, promotion (docs/spine.md → قرارداد Thinking).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { RepoError, Scope, newId, now, rowToThought } from './shared.ts';
import { jaccard, normalizeFa, titleTokens } from '../../../src/core/contextEngine.ts';
import { lineHash, parseThinking } from '../../../src/core/thinkingMarkers.ts';
import type { ContextObject, Note, ObjectSource, Thought, ThoughtKind, ThoughtRevision } from '../../../src/types/index.ts';

export const thoughtsMethods = {
  listThoughts(this: Repo, s: Scope, opts: { includeResolved?: boolean } = {}): Thought[] {
    const status = opts.includeResolved ? '' : " AND status = 'open'";
    const rows = this.db.prepare(`SELECT * FROM thoughts WHERE workspace_id = ? AND user_id = ?${status} ORDER BY created_at, id`).all(s.workspaceId, s.userId) as Array<Record<string, unknown>>;
    const aboutMap = new Map<string, { objectIds: string[]; nodeIds: string[] }>();
    const aboutRows = this.db.prepare('SELECT thought_id, target_kind, target_id FROM thought_about WHERE workspace_id = ? AND user_id = ?').all(s.workspaceId, s.userId) as Array<{ thought_id: string; target_kind: string; target_id: string }>;
    for (const a of aboutRows) {
      let cur = aboutMap.get(a.thought_id);
      if (!cur) { cur = { objectIds: [], nodeIds: [] }; aboutMap.set(a.thought_id, cur); }
      if (a.target_kind === 'object') cur.objectIds.push(a.target_id);
      else if (a.target_kind === 'node') cur.nodeIds.push(a.target_id);
    }
    return rows.map((r) => rowToThought(r, aboutMap.get(r.id as string)));
  },

  getThought(this: Repo, s: Scope, id: string): Thought | undefined {
    const r = this.db.prepare('SELECT * FROM thoughts WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    if (!r) return undefined;
    let about: { objectIds: string[]; nodeIds: string[] } | undefined;
    const aboutRows = this.db.prepare('SELECT target_kind, target_id FROM thought_about WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').all(id, s.workspaceId, s.userId) as Array<{ target_kind: string; target_id: string }>;
    about = {
      objectIds: aboutRows.filter((a) => a.target_kind === 'object').map((a) => a.target_id),
      nodeIds: aboutRows.filter((a) => a.target_kind === 'node').map((a) => a.target_id),
    };
    return rowToThought(r, about);
  },

  insertThought(this: Repo, s: Scope, input: { id?: string; nodeId: string; kind: ThoughtKind | null; text: string; sourceNoteId?: string; sourceLine?: number; sourceLineKey?: string; sourceQuote?: string; inferred?: boolean; status?: Thought['status']; resolvedObjectId?: string; at?: string; about?: Array<{ kind: 'object' | 'node'; id: string }> }): Thought {
    if (!input.text.trim()) throw new RepoError('invalid', 'متن فکر لازم است.');
    this.requireNode(s, input.nodeId);
    if (input.sourceNoteId && !this.getNote(s, input.sourceNoteId)) throw new RepoError('not_found', 'یادداشت منبع پیدا نشد.');
    const at = input.at ?? now();
    const thought: Thought = {
      id: input.id ?? newId('thought'), workspaceId: s.workspaceId, nodeId: input.nodeId, kind: input.kind,
      text: input.text, status: input.status ?? 'open',
      ...(input.sourceNoteId ? { sourceNoteId: input.sourceNoteId } : {}),
      ...(input.sourceLine !== undefined ? { sourceLine: input.sourceLine } : {}),
      ...(input.sourceLineKey ? { sourceLineKey: input.sourceLineKey } : {}),
      ...(input.sourceQuote ? { sourceQuote: input.sourceQuote } : {}),
      ...(input.inferred ? { inferred: true } : {}),
      ...(input.resolvedObjectId ? { resolvedObjectId: input.resolvedObjectId } : {}),
      createdAt: at, updatedAt: at,
    };
    this.db.prepare(`INSERT INTO thoughts (id,user_id,workspace_id,node_id,kind,text,status,source_note_id,source_line,source_line_key,source_quote,inferred,resolved_object_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(thought.id, s.userId, s.workspaceId, thought.nodeId, thought.kind, thought.text, thought.status,
      thought.sourceNoteId ?? null, thought.sourceLine ?? null, thought.sourceLineKey ?? null, thought.sourceQuote ?? null, thought.inferred ? 1 : 0,
      thought.resolvedObjectId ?? null, thought.createdAt, thought.updatedAt);

    this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(newId('th_ev'), thought.id, s.userId, s.workspaceId, 'created', null, thought.text, 'user', at);

    const insAbout = this.db.prepare('INSERT OR IGNORE INTO thought_about (thought_id,target_kind,target_id,user_id,workspace_id,created_at) VALUES (?,?,?,?,?,?)');
    if (input.about?.length) {
      for (const target of input.about) insAbout.run(thought.id, target.kind, target.id, s.userId, s.workspaceId, at);
    } else if (input.text.includes('@«')) {
      const TOKEN = /@«([^»\n]+)»/g;
      const matches = [...input.text.matchAll(TOKEN)];
      if (matches.length > 0) {
        const objects = this.listObjects(s);
        const nodes = this.listNodes(s);
        for (const m of matches) {
          const k = normalizeFa(m[1].replace(/\s+/g, ' ').trim());
          const wsObjs = objects.filter((o) => normalizeFa(o.title.replace(/\s+/g, ' ').trim()) === k);
          if (wsObjs.length === 1) {
            insAbout.run(thought.id, 'object', wsObjs[0].id, s.userId, s.workspaceId, at);
            continue;
          }
          if (wsObjs.length > 1) continue;
          const wsNodes = nodes.filter((n) => normalizeFa(n.label.replace(/\s+/g, ' ').trim()) === k);
          if (wsNodes.length === 1) {
            insAbout.run(thought.id, 'node', wsNodes[0].id, s.userId, s.workspaceId, at);
          }
        }
      }
    }

    return this.getThought(s, thought.id)!;
  },

  /**
   * Note lines ↔ Thoughts (docs/spine.md → «یادداشت ماده است، فکر هویت دارد»). A note line is matched to a Thought in this order:
   *   1. the same line with the same text (or the same text moved to another line) — nothing changes except where it sits;
   *   2. an EDITED line: an open, unconverted Thought of this note whose anchor (its line, its original words) is close to the new
   *      line — the same line and ≥ 25% shared words, or ≥ 50% shared words anywhere — is REVISED (same id; a purely cosmetic
   *      change records no revision), never duplicated;
   *   3. a resolved (converted) Thought that matches the same way is left alone: editing the note neither changes it nor makes a twin;
   *   4. only a line that matches nothing makes a new Thought.
   * A Thought whose line is gone stays OPEN (it is the user's) with `sourceState = 'line_deleted'`; it is never closed or erased in silence.
   */
  syncNoteThoughts(this: Repo, s: Scope, note: Note, deterministicIds = false): void {
    const current = this.db.prepare('SELECT * FROM thoughts WHERE workspace_id = ? AND user_id = ? AND source_note_id = ? ORDER BY source_line,id').all(s.workspaceId, s.userId, note.id) as Array<Record<string, unknown>>;
    const anchored = current.filter((t) => t.source_line !== null).map((r) => rowToThought(r));
    const used = new Set<string>();
    const pairs = parseThinking(note.content).map((item, ordinal) => ({ item, ordinal, thought: undefined as Thought | undefined, edited: false }));
    for (const p of pairs) { // 1. exact
      const hit = anchored.find((t) => !used.has(t.id) && t.sourceLine === p.item.line && t.sourceLineKey === p.item.hash)
        ?? anchored.find((t) => !used.has(t.id) && t.sourceLineKey === p.item.hash);
      if (hit) { used.add(hit.id); p.thought = hit; }
    }
    const words = (x: string) => titleTokens(x);
    for (const p of pairs) { // 2 & 3. an edited line
      if (p.thought) continue;
      let best: { t: Thought; sim: number; gap: number } | undefined;
      for (const t of anchored) {
        if (used.has(t.id)) continue;
        const sim = Math.max(jaccard(words(p.item.text), words(t.sourceQuote ?? t.text)), jaccard(words(p.item.text), words(t.text)));
        const near = t.sourceLine === p.item.line;
        if (!((near && sim >= 0.25) || sim >= 0.5)) continue;
        const gap = Math.abs((t.sourceLine ?? 0) - p.item.line);
        if (!best || sim > best.sim || (sim === best.sim && gap < best.gap)) best = { t, sim, gap };
      }
      if (best) { used.add(best.t.id); p.thought = best.t; p.edited = true; }
    }
    const at = now();
    for (const p of pairs) {
      const { item, thought } = p;
      if (!thought) { // 4. really new
        this.insertThought(s, {
          ...(deterministicIds && current.length === 0 ? { id: `imported_thought_${note.id}_${p.ordinal}` } : {}), nodeId: note.nodeId, kind: item.kind, text: item.text, sourceNoteId: note.id,
          sourceLine: item.line, sourceLineKey: item.hash, sourceQuote: item.text, inferred: item.inferred,
          at: note.createdAt,
        });
        continue;
      }
      if (p.edited) {
        if (thought.status === 'open') this.reviseThought(s, thought.id, item.text); // same id; cosmetic changes record nothing
        this.db.prepare('UPDATE thoughts SET kind = ?, inferred = ?, source_line = ?, source_line_key = ?, source_quote = ?, source_state = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?')
          .run(thought.status === 'open' ? item.kind : thought.kind, thought.status === 'open' ? (item.inferred ? 1 : 0) : (thought.inferred ? 1 : 0), item.line, item.hash, item.text, at, thought.id, s.workspaceId, s.userId);
        continue;
      }
      if (thought.kind !== item.kind || thought.inferred !== item.inferred || thought.sourceLine !== item.line || thought.sourceState) {
        this.db.prepare('UPDATE thoughts SET kind = ?, inferred = ?, source_line = ?, source_state = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?')
          .run(item.kind, item.inferred ? 1 : 0, item.line, at, thought.id, s.workspaceId, s.userId);
      }
    }
    for (const t of anchored) { // the line is gone: the thought stays, open, and says so
      if (used.has(t.id) || t.sourceState === 'line_deleted') continue;
      this.db.prepare("UPDATE thoughts SET source_state = 'line_deleted', updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?").run(at, t.id, s.workspaceId, s.userId);
      this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(newId('th_ev'), t.id, s.userId, s.workspaceId, 'source_line_deleted', null, null, 'user', at);
    }
  },

  /**
   * Erase thoughts for good: the row, every revision, every event, what they were about and their derivation links — and the pointer
   * knowledge keeps to them (`source.thoughtId`). Used by «حذف یادداشت با فکرهایش» and by the permanent delete of knowledge.
   */
  eraseThoughts(this: Repo, s: Scope, ids: string[]): number {
    const set = [...new Set(ids)];
    if (!set.length) return 0;
    const w = s.workspaceId, u = s.userId;
    let n = 0;
    this.db.transaction(() => {
      for (const id of set) {
        n += this.db.prepare('DELETE FROM thoughts WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u).changes;
        this.db.prepare('DELETE FROM thought_revisions WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u);
        this.db.prepare('DELETE FROM thought_events WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u);
        this.db.prepare('DELETE FROM thought_about WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').run(id, w, u);
        this.db.prepare('DELETE FROM thought_derivations WHERE workspace_id = ? AND user_id = ? AND (parent_id = ? OR child_id = ?)').run(w, u, id, id);
      }
      // knowledge that came from an erased thought keeps its own text but not the pointer
      for (const o of this.db.prepare("SELECT id, source FROM context_objects WHERE workspace_id = ? AND user_id = ? AND source LIKE '%thoughtId%'").all(w, u) as Array<{ id: string; source: string }>) {
        const src = JSON.parse(o.source) as ObjectSource;
        if (!src.thoughtId || !set.includes(src.thoughtId)) continue;
        const { thoughtId: _t, ...rest } = src;
        this.db.prepare('UPDATE context_objects SET source = ? WHERE id = ? AND workspace_id = ?').run(JSON.stringify(rest), o.id, w);
      }
    })();
    return n;
  },

  reviseThought(this: Repo, s: Scope, id: string, text: string): { thought: Thought; revisions: ThoughtRevision[] } {
    const cur = this.getThought(s, id);
    if (!cur) throw new RepoError('not_found', 'فکر پیدا نشد.');
    if (!text.trim()) throw new RepoError('invalid', 'متن فکر لازم است.');
    const at = now();
    if (lineHash(cur.text) !== lineHash(text)) {
      const nextRevision = (this.db.prepare('SELECT COALESCE(MAX(revision),0)+1 AS n FROM thought_revisions WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as { n: number }).n;
      this.db.prepare('INSERT INTO thought_revisions (thought_id,revision,user_id,workspace_id,before_text,after_text,at) VALUES (?,?,?,?,?,?,?)')
        .run(id, nextRevision, s.userId, s.workspaceId, cur.text, text, at);
      this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(newId('th_ev'), id, s.userId, s.workspaceId, 'revised', cur.text, text, 'user', at);
    }
    if (text.includes('@«')) {
      const TOKEN = /@«([^»\n]+)»/g;
      const matches = [...text.matchAll(TOKEN)];
      if (matches.length > 0) {
        const objects = this.listObjects(s);
        const nodes = this.listNodes(s);
        const insAbout = this.db.prepare('INSERT OR IGNORE INTO thought_about (thought_id,target_kind,target_id,user_id,workspace_id,created_at) VALUES (?,?,?,?,?,?)');
        for (const m of matches) {
          const k = normalizeFa(m[1].replace(/\s+/g, ' ').trim());
          const wsObjs = objects.filter((o) => normalizeFa(o.title.replace(/\s+/g, ' ').trim()) === k);
          if (wsObjs.length === 1) {
            insAbout.run(id, 'object', wsObjs[0].id, s.userId, s.workspaceId, at);
            continue;
          }
          if (wsObjs.length > 1) continue;
          const wsNodes = nodes.filter((n) => normalizeFa(n.label.replace(/\s+/g, ' ').trim()) === k);
          if (wsNodes.length === 1) {
            insAbout.run(id, 'node', wsNodes[0].id, s.userId, s.workspaceId, at);
          }
        }
      }
    }
    this.db.prepare('UPDATE thoughts SET text = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(text, at, id, s.workspaceId, s.userId);
    return { thought: this.getThought(s, id)!, revisions: this.listThoughtRevisions(s, id) };
  },

  reclassifyThought(this: Repo, s: Scope, id: string, kind: ThoughtKind): Thought {
    const cur = this.getThought(s, id);
    if (!cur) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const at = now();
    this.db.prepare('UPDATE thoughts SET kind = ?, inferred = 0, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?')
      .run(kind, at, id, s.workspaceId, s.userId);
    this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(newId('th_ev'), id, s.userId, s.workspaceId, 'reclassified', cur.kind, kind, 'user', at);
    return this.getThought(s, id)!;
  },

  setThoughtAbout(this: Repo, s: Scope, thoughtId: string, targets: Array<{ kind: 'object' | 'node'; id: string }>): Thought {
    const cur = this.getThought(s, thoughtId);
    if (!cur) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const at = now();
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM thought_about WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').run(thoughtId, s.workspaceId, s.userId);
      const ins = this.db.prepare('INSERT OR IGNORE INTO thought_about (thought_id, target_kind, target_id, user_id, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const t of targets) {
        ins.run(thoughtId, t.kind, t.id, s.userId, s.workspaceId, at);
      }
      this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(newId('th_ev'), thoughtId, s.userId, s.workspaceId, 'about_updated', null, JSON.stringify(targets), 'user', at);
    })();
    return this.getThought(s, thoughtId)!;
  },

  getThoughtAbout(this: Repo, s: Scope, thoughtId: string): { objectIds: string[]; nodeIds: string[] } {
    const rows = this.db.prepare('SELECT target_kind, target_id FROM thought_about WHERE thought_id = ? AND workspace_id = ? AND user_id = ?').all(thoughtId, s.workspaceId, s.userId) as Array<{ target_kind: string; target_id: string }>;
    return {
      objectIds: rows.filter((r) => r.target_kind === 'object').map((r) => r.target_id),
      nodeIds: rows.filter((r) => r.target_kind === 'node').map((r) => r.target_id),
    };
  },

  listThoughtsAbout(this: Repo, s: Scope, objectId: string): Thought[] {
    const targetThoughtIds = (this.db.prepare("SELECT thought_id FROM thought_about WHERE target_kind = 'object' AND target_id = ? AND workspace_id = ? AND user_id = ?").all(objectId, s.workspaceId, s.userId) as Array<{ thought_id: string }>).map((r) => r.thought_id);
    const seen = new Set(targetThoughtIds);
    const all = this.listThoughts(s, { includeResolved: true });
    const obj = this.getObject(s, objectId);
    if (obj) {
      const token = `@«${obj.title}»`;
      for (const t of all) {
        if (!seen.has(t.id) && t.text.includes(token)) {
          seen.add(t.id);
        }
      }
    }
    return [...seen].map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
  },

  listThoughtsInScope(this: Repo, s: Scope, nodeIds: string[]): Thought[] {
    const set = new Set(nodeIds);
    const all = this.listThoughts(s, { includeResolved: true });
    const objects = this.listObjects(s);
    const nodes = this.listNodes(s);
    return all.filter((t) => {
      if (set.has(t.nodeId)) return true;
      if (t.aboutNodeIds?.some((id) => set.has(id))) return true;
      const at = new Map(objects.map((o) => [o.id, o.nodeId]));
      if (t.aboutObjectIds?.some((id) => { const n = at.get(id); return !!n && set.has(n); })) return true;
      return false;
    });
  },

  deriveThought(this: Repo, s: Scope, input: { parentIds: string[]; nodeId: string; kind: ThoughtKind; text: string }): { thought: Thought; derivedFrom: string[] } {
    const parents = [...new Set(input.parentIds)];
    if (!parents.length) throw new RepoError('invalid', 'فکر تازه باید دست‌کم یک فکر مبدأ داشته باشد.');
    const parentThoughts = parents.map((id) => this.getThought(s, id));
    if (parentThoughts.some((t) => !t)) throw new RepoError('not_found', 'یکی از فکرهای مبدأ پیدا نشد.');
    this.requireNode(s, input.nodeId);
    return this.db.transaction(() => {
      const child = this.insertThought(s, { nodeId: input.nodeId, kind: input.kind, text: input.text });
      const at = now();
      const edge = this.db.prepare('INSERT INTO thought_derivations (parent_id,child_id,user_id,workspace_id,created_at) VALUES (?,?,?,?,?)');
      for (const parentId of parents) edge.run(parentId, child.id, s.userId, s.workspaceId, at);
      return { thought: child, derivedFrom: parents };
    })();
  },

  listThoughtRevisions(this: Repo, s: Scope, thoughtId: string): ThoughtRevision[] {
    return (this.db.prepare('SELECT thought_id,revision,before_text,after_text,at FROM thought_revisions WHERE thought_id = ? AND workspace_id = ? AND user_id = ? ORDER BY revision').all(thoughtId, s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ thoughtId: r.thought_id as string, revision: r.revision as number, beforeText: r.before_text as string, afterText: r.after_text as string, at: r.at as string }));
  },

  listThoughtParents(this: Repo, s: Scope, thoughtId: string): string[] {
    return (this.db.prepare('SELECT parent_id FROM thought_derivations WHERE child_id = ? AND workspace_id = ? AND user_id = ? ORDER BY created_at,parent_id').all(thoughtId, s.workspaceId, s.userId) as Array<{ parent_id: string }>).map((r) => r.parent_id);
  },

  listDerivedThoughts(this: Repo, s: Scope, thoughtId: string): Thought[] {
    const childIds = (this.db.prepare('SELECT child_id FROM thought_derivations WHERE parent_id = ? AND workspace_id = ? AND user_id = ? ORDER BY created_at').all(thoughtId, s.workspaceId, s.userId) as Array<{ child_id: string }>).map((r) => r.child_id);
    return childIds.map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
  },

  getThoughtSources(this: Repo, s: Scope, thoughtId: string): { note?: Note; parents: Thought[]; quote?: string; inferred?: boolean } {
    const thought = this.getThought(s, thoughtId);
    if (!thought) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const note = thought.sourceNoteId ? this.getNote(s, thought.sourceNoteId) : undefined;
    const parents = this.listThoughtParents(s, thoughtId).map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
    return {
      note,
      parents,
      quote: thought.sourceQuote,
      inferred: thought.inferred,
    };
  },

  getProposedKnowledgeFromThought(this: Repo, s: Scope, thoughtId: string): ContextObject | undefined {
    const thought = this.getThought(s, thoughtId);
    if (thought?.resolvedObjectId) {
      const obj = this.getObject(s, thought.resolvedObjectId);
      if (obj) return obj;
    }
    const objects = this.listObjects(s);
    return objects.find((o) => o.source?.thoughtId === thoughtId);
  },

  getSynthesisLineage(this: Repo, s: Scope, thoughtId: string): { thought: Thought; parentThoughts: Thought[] } {
    const thought = this.getThought(s, thoughtId);
    if (!thought) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const parentThoughts = this.listThoughtParents(s, thoughtId).map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
    return { thought, parentThoughts };
  },

  splitThought(this: Repo, s: Scope, parentId: string, children: Array<{ text: string; kind: ThoughtKind; nodeId?: string }>): { parent: Thought; children: Thought[] } {
    const parent = this.getThought(s, parentId);
    if (!parent) throw new RepoError('not_found', 'فکر مبدأ پیدا نشد.');
    if (!children.length) throw new RepoError('invalid', 'دست‌کم یک فکر تازه برای تفکیک لازم است.');
    const created: Thought[] = [];
    this.db.transaction(() => {
      for (const c of children) {
        const derived = this.deriveThought(s, {
          parentIds: [parentId],
          nodeId: c.nodeId ?? parent.nodeId,
          kind: c.kind,
          text: c.text,
        });
        created.push(derived.thought);
      }
    })();
    return { parent: this.getThought(s, parentId)!, children: created };
  },

  getThoughtHistory(this: Repo, s: Scope, thoughtId: string): import('../../../src/types/index.ts').ThoughtHistoryReport {
    const thought = this.getThought(s, thoughtId);
    if (!thought) throw new RepoError('not_found', 'فکر پیدا نشد.');
    const revisions = this.listThoughtRevisions(s, thoughtId);
    const events = (this.db.prepare('SELECT event_kind, before_value, after_value, actor, at FROM thought_events WHERE thought_id = ? AND workspace_id = ? AND user_id = ? ORDER BY at').all(thoughtId, s.workspaceId, s.userId) as Array<{ event_kind: string; before_value: string | null; after_value: string | null; actor: string; at: string }>);
    const parents = this.listThoughtParents(s, thoughtId).map((id) => this.getThought(s, id)).filter((t): t is Thought => !!t);
    const derivedThoughts = this.listDerivedThoughts(s, thoughtId);
    const proposedObject = this.getProposedKnowledgeFromThought(s, thoughtId);

    const entries: import('../../../src/types/index.ts').ThoughtHistoryEntry[] = [
      {
        kind: 'created',
        at: thought.createdAt,
        actor: 'user',
        details: {
          afterText: thought.text,
          afterKind: thought.kind,
          sourceNoteId: thought.sourceNoteId,
          sourceQuote: thought.sourceQuote,
          parentIds: parents.map((p) => p.id),
        },
      },
    ];

    for (const r of revisions) {
      entries.push({
        kind: 'revision',
        at: r.at,
        actor: 'user',
        details: { beforeText: r.beforeText, afterText: r.afterText },
      });
    }

    for (const ev of events) {
      if (ev.event_kind === 'reclassified') {
        entries.push({
          kind: 'reclassification',
          at: ev.at,
          actor: ev.actor,
          details: { beforeKind: ev.before_value as ThoughtKind, afterKind: ev.after_value as ThoughtKind },
        });
      } else if (ev.event_kind === 'source_line_deleted' || ev.event_kind === 'source_note_deleted') {
        entries.push({ kind: ev.event_kind, at: ev.at, actor: ev.actor, details: {} });
      } else if (ev.event_kind === 'resolved') {
        entries.push({
          kind: 'resolved',
          at: ev.at,
          actor: ev.actor,
          details: { objectId: ev.after_value ?? undefined },
        });
      }
    }

    entries.sort((a, b) => a.at.localeCompare(b.at));

    return {
      thought,
      entries,
      derivedThoughts,
      proposedObject,
    };
  },

  resolveThought(this: Repo, s: Scope, id: string, resolution: { objectId?: string; nodeId?: string }): Thought {
    const cur = this.getThought(s, id);
    if (!cur) throw new RepoError('not_found', 'فکر پیدا نشد.');
    if (resolution.objectId) {
      const object = this.getObject(s, resolution.objectId);
      if (!object || object.status !== 'Proposed') throw new RepoError('invalid', 'فکر فقط با دانش پیشنهادی می‌تواند تبدیل شود.');
    } else if (resolution.nodeId) this.requireNode(s, resolution.nodeId);
    else throw new RepoError('invalid', 'نتیجهٔ تبدیل فکر مشخص نیست.');
    const at = now();
    this.db.prepare("UPDATE thoughts SET status = 'resolved', resolved_object_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?")
      .run(resolution.objectId ?? null, at, id, s.workspaceId, s.userId);
    this.db.prepare('INSERT INTO thought_events (id,thought_id,user_id,workspace_id,event_kind,before_value,after_value,actor,at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(newId('th_ev'), id, s.userId, s.workspaceId, 'resolved', 'open', resolution.objectId ?? resolution.nodeId, 'user', at);
    return this.getThought(s, id)!;
  },
};
