/**
 * Knowledge (Context Objects): versions, drafts, samples, supersede, outcome, the impact each write reports.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { CONTEXT_TYPES, ChangeMeta, ImpactResult, ObjectInput, RepoError, Scope, cleanFacets, newId, now, rowToObject, scopeFields, thinkingFields } from './shared.ts';
import { diffFields, statusChangeKind } from '../../../src/core/changeLog.ts';
import { can, objectLimitMessage } from '../../../src/core/entitlements.ts';
import { computeStaleAssets, newlyStale } from '../../../src/core/impactEngine.ts';
import type { StaleAsset } from '../../../src/core/impactEngine.ts';
import { resolveNodeId } from '../../../src/core/nodeTree.ts';
import { canHaveExamples, cleanExamples } from '../../../src/core/redlineExamples.ts';
import { reasonAllowed } from '../../../src/core/versionHistory.ts';
import type { ContextChange, ContextObject, ContextType, ExpectationVerdict, GeneratedDeliverable, ObjectDraft } from '../../../src/types/index.ts';

export const objectsMethods = {
  setDraft(this: Repo, s: Scope, id: string, draft: ObjectDraft | null) {
    this.db.prepare('UPDATE context_objects SET draft = ? WHERE id = ? AND workspace_id = ?').run(draft ? JSON.stringify(draft) : null, id, s.workspaceId);
  },

  /** «تأیید»: the draft REPLACES the text — a normal confirmed edit (version + 1, a milestone in the history, the reason the user gave) */
  approveDraft(this: Repo, s: Scope, id: string, meta?: ChangeMeta): { object: ContextObject; impact: ImpactResult } {
    const cur = this.getObjectAny(s, id);
    if (!cur?.draft) throw new RepoError('not_found', 'پیش‌نویسی برای تأیید نیست.');
    const d = cur.draft;
    this.setDraft(s, id, null);
    return this.updateObject(s, id, { title: d.title, content: d.content, examples: d.examples ?? null }, { ...meta, reason: meta?.reason ?? d.reason });
  },

  /** «رد»: the draft is thrown away; the approved text never changed */
  rejectDraft(this: Repo, s: Scope, id: string): ContextObject {
    const cur = this.getObjectAny(s, id);
    if (!cur?.draft) throw new RepoError('not_found', 'پیش‌نویسی برای رد نیست.');
    this.setDraft(s, id, null);
    return this.getObjectAny(s, id)!;
  },

  /**
   * THE one door to the user's knowledge for every AI path and every engine (injection, packs, Gap, Readiness,
   * contradictions, the validator, impact …): SAMPLES ARE NOT HERE. A sample (starter / template example) is only visible
   * through `listSampleObjects`, which only the UI's state reads.
   */
  listObjects(this: Repo, s: Scope): ContextObject[] {
    return (this.db.prepare('SELECT * FROM context_objects WHERE workspace_id = ? AND user_id = ? AND (sample IS NULL OR sample = 0) ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToObject);
  },

  /** the examples that came with a starter / template — for display only (grey, «نمونه») */
  listSampleObjects(this: Repo, s: Scope): ContextObject[] {
    return (this.db.prepare('SELECT * FROM context_objects WHERE workspace_id = ? AND user_id = ? AND sample = 1 ORDER BY created_at DESC, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map(rowToObject);
  },

  /** hides samples (same door as `listObjects`) */
  getObject(this: Repo, s: Scope, id: string): ContextObject | undefined {
    const o = this.getObjectAny(s, id);
    return o && !o.sample ? o : undefined;
  },

  /** includes samples: only for the editor of an example (replacing it makes it the user's own) and for deleting examples */
  getObjectAny(this: Repo, s: Scope, id: string): ContextObject | undefined {
    const r = this.db.prepare('SELECT * FROM context_objects WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? rowToObject(r) : undefined;
  },

  /**
   * An example from a starter or a template: grey in the UI, invisible to every AI path and engine, no cap, no Change.
   * Applying the same starter twice does not duplicate it (same node + title).
   */
  createSample(this: Repo, s: Scope, input: { id?: string; at?: string; type: ContextType; title: string; content: string; nodeId: string; facets?: string[]; slotKey?: string }): ContextObject | undefined {
    this.assertWorkspace(s);
    this.requireNode(s, input.nodeId);
    const dup = this.db.prepare('SELECT 1 FROM context_objects WHERE workspace_id = ? AND user_id = ? AND node_id = ? AND title = ? AND sample = 1').get(s.workspaceId, s.userId, input.nodeId, input.title.trim());
    if (dup) return undefined;
    const t = input.at ?? now();
    const o: ContextObject = { id: input.id ?? newId('smp'), workspaceId: s.workspaceId, type: input.type, status: 'Confirmed', provenance: 'User Input', title: input.title.trim(), content: input.content, nodeId: input.nodeId, version: 1, sample: true, ...(input.slotKey?.trim() ? { slotKey: input.slotKey.trim() } : {}), ...(cleanFacets(input.facets) ? { facets: cleanFacets(input.facets) } : {}), createdAt: t, updatedAt: t };
    this.insertObject(s, o);
    return o;
  },

  /** remove the examples (all, or only those in some nodes) — they were never knowledge, so nothing is archived */
  deleteSamples(this: Repo, s: Scope, nodeIds?: string[]): number {
    const ids = (this.db.prepare('SELECT id, node_id FROM context_objects WHERE workspace_id = ? AND user_id = ? AND sample = 1').all(s.workspaceId, s.userId) as Array<{ id: string; node_id: string }>).filter((r) => !nodeIds || nodeIds.includes(r.node_id)).map((r) => r.id);
    this.db.transaction(() => {
      for (const id of ids) {
        this.db.prepare('DELETE FROM context_object_versions WHERE object_id = ? AND workspace_id = ?').run(id, s.workspaceId);
        this.db.prepare('DELETE FROM context_objects WHERE id = ? AND workspace_id = ? AND sample = 1').run(id, s.workspaceId);
      }
    })();
    return ids.length;
  },

  listVersions(this: Repo, s: Scope, objectId: string): Array<{ version: number; type: string; title: string; content: string; createdAt: string }> {
    return (this.db.prepare('SELECT * FROM context_object_versions WHERE object_id = ? AND workspace_id = ? AND user_id = ? ORDER BY version DESC').all(objectId, s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ version: r.version as number, type: r.type as string, title: r.title as string, content: r.content as string, createdAt: r.created_at as string }));
  },

  snapshot(this: Repo, s: Scope, o: Pick<ContextObject, 'id' | 'version' | 'type' | 'title' | 'content'>, at: string) {
    this.db.prepare('INSERT OR REPLACE INTO context_object_versions (object_id, version, user_id, workspace_id, type, title, content, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(o.id, o.version, s.userId, s.workspaceId, o.type, o.title, o.content, at);
  },

  insertObject(this: Repo, s: Scope, o: ContextObject) {
    this.db.prepare(`INSERT INTO context_objects (id, user_id, workspace_id, type, status, provenance, title, content, node_id, superseded_by_id, created_at, updated_at, version, source, slot_key, reach, valid_until, assumption, review_by, decision_record, facets, sample, examples, draft)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(o.id, s.userId, s.workspaceId, o.type, o.status, o.provenance, o.title, o.content, o.nodeId, o.supersededById ?? null, o.createdAt, o.updatedAt, o.version, o.source ? JSON.stringify(o.source) : null, o.slotKey ?? null, o.reach ?? null, o.validUntil ?? null, o.assumption ? 1 : null, o.reviewBy ?? null, o.record ? JSON.stringify(o.record) : null, o.facets ? JSON.stringify(o.facets) : null, o.sample ? 1 : null, o.examples ? JSON.stringify(o.examples) : null, o.draft ? JSON.stringify(o.draft) : null);
    this.snapshot(s, o, o.createdAt);
  },

  /** impact of a mutation = assets that are stale after it but were not before */
  withImpact<T>(this: Repo, s: Scope, run: () => T): { value: T; impact: ImpactResult } {
    if (!this.impactEnabled(s)) return { value: run(), impact: { count: 0, assets: [] } };
    const dels = this.listDeliverables(s);
    const before = this.computeStale(s, dels);
    const value = run();
    const after = this.computeStale(s, dels);
    return { value, impact: this.describeImpact(newlyStale(before, after), dels) };
  },

  /** stale assets with every reason: changed versions AND decisions they rest on (depends_on) that changed unreviewed */
  computeStale(this: Repo, s: Scope, dels: GeneratedDeliverable[] = this.listDeliverables(s)): StaleAsset[] {
    return computeStaleAssets(dels.filter((d) => !d.archivedAt), this.listObjects(s), { relationships: this.listRelationships(s), changes: this.listChanges(s) });
  },

  describeImpact(this: Repo, list: StaleAsset[], dels: GeneratedDeliverable[]): ImpactResult {
    return { count: list.length, assets: list.map((a) => ({ id: a.deliverableId, title: dels.find((d) => d.id === a.deliverableId)?.title ?? a.deliverableId, reasons: a.reasons.map((r) => r.message) })) };
  },

  createObject(this: Repo, s: Scope, input: ObjectInput & { id?: string }, meta?: ChangeMeta): ContextObject {
    this.assertWorkspace(s);
    if (input.source?.kind === 'mcp') throw new RepoError('invalid', 'این نوع منشأ فقط برای خواندن داده‌های تاریخی پشتیبانی می‌شود.');
    input = { ...input, nodeId: this.placeNode(s, input.nodeId) };
    if (!input.title.trim()) throw new RepoError('invalid', 'عنوان لازم است.');
    if (!CONTEXT_TYPES.includes(input.type)) throw new RepoError('invalid', 'نوع Context باید واقعیت، تصمیم یا خط قرمز باشد؛ خروجی‌ها Context نیستند.');
    if (!input.provenance) throw new RepoError('invalid', 'هیچ Objectی بدون منبع (provenance) ذخیره نمی‌شود.');
    const promotedThought = input.source?.thoughtId ? this.getThought(s, input.source.thoughtId) : undefined;
    if (input.source?.thoughtId && !promotedThought) throw new RepoError('not_found', 'فکر مبدأ پیدا نشد.');
    if (promotedThought) {
      if (promotedThought.status !== 'open') throw new RepoError('invalid', 'این فکر قبلاً به نتیجه رسیده است.');
      if (input.status && input.status !== 'Proposed') throw new RepoError('forbidden', 'فکر فقط می‌تواند دانش پیشنهادی بسازد؛ تأیید با کاربر است.');
      if (promotedThought.kind === 'assumption' && input.type !== 'Fact') throw new RepoError('invalid', 'فرض فقط به‌صورت واقعیتِ برچسب‌خورده به دانش می‌رود.');
      if (promotedThought.kind === 'open_decision' && input.type !== 'Decision') throw new RepoError('invalid', 'تصمیم باز فقط به‌صورت تصمیم به دانش می‌رود.');
      const source = {
        ...input.source!,
        kind: promotedThought.sourceNoteId ? 'note' as const : 'user' as const,
        thoughtId: promotedThought.id,
        ...(promotedThought.sourceNoteId ? { noteId: promotedThought.sourceNoteId } : {}),
        ...(promotedThought.sourceLineKey ? { lineKey: promotedThought.sourceLineKey } : {}),
        quote: promotedThought.text,
      };
      if (!promotedThought.sourceNoteId) { delete source.noteId; delete source.lineKey; }
      input = {
        ...input, status: 'Proposed',
        source,
        ...(promotedThought.kind === 'assumption' ? { assumption: true } : {}),
      };
    }
    if (this.objectSlots(s) <= 0) throw new RepoError('forbidden', objectLimitMessage(this.planOf(s)));
    const t = now();
    const o: ContextObject = { id: input.id ?? newId('ctx'), workspaceId: s.workspaceId, type: input.type, status: input.status ?? 'Confirmed', provenance: input.provenance, title: input.title.trim(), content: input.content, nodeId: input.nodeId, version: 1, ...(input.source ? { source: input.source } : {}), ...(input.slotKey?.trim() ? { slotKey: input.slotKey.trim() } : {}), ...scopeFields(input), ...thinkingFields(input), ...(cleanFacets(input.facets) ? { facets: cleanFacets(input.facets) } : {}), ...(canHaveExamples({ type: input.type, reach: scopeFields(input).reach }) && cleanExamples(input.examples) ? { examples: cleanExamples(input.examples) } : {}), createdAt: t, updatedAt: t };
    this.db.transaction(() => {
      this.insertObject(s, o);
      this.recordChange(s, { objectId: o.id, fromVersion: 0, toVersion: 1, kind: o.provenance === 'Imported' ? 'imported' : 'created', meta, after: { type: o.type, title: o.title, nodeId: o.nodeId, status: o.status }, source: o.source });
      if (promotedThought) this.resolveThought(s, promotedThought.id, { objectId: o.id });
    })();
    return o;
  },

  /** Raw insert for the one-time localStorage import: keeps id, status, timestamps and version as they were. */
  importObject(this: Repo, s: Scope, o: ContextObject, opts: { silent?: boolean } = {}) {
    const node = resolveNodeId(this.listNodes(s), o.nodeId);
    // old localStorage data may carry the retired «Asset» type
    const type = CONTEXT_TYPES.includes(o.type) ? o.type : 'Fact';
    this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM context_objects WHERE id = ?').get(o.id)) return;
      this.insertObject(s, { ...o, type, nodeId: node, version: o.version ?? 1 });
      if (!opts.silent) this.recordChange(s, { objectId: o.id, fromVersion: 0, toVersion: o.version ?? 1, kind: 'created', meta: { actor: 'system', label: 'ورود داده‌های قدیمی' }, at: o.createdAt, after: { type, title: o.title, nodeId: node, status: o.status } });
    })();
  },

  importVersion(this: Repo, s: Scope, v: { objectId: string; version: number; type: string; title: string; content: string; at: string }) {
    this.db.prepare('INSERT OR REPLACE INTO context_object_versions (object_id, version, user_id, workspace_id, type, title, content, created_at) VALUES (?,?,?,?,?,?,?,?)').run(v.objectId, v.version, s.userId, s.workspaceId, v.type, v.title, v.content, v.at);
  },

  /** Edit in place. title / content / type changes bump `version`; status or node moves do not. */
  updateObject(this: Repo, s: Scope, id: string, patch: Partial<Pick<ContextObject, 'type' | 'title' | 'content' | 'nodeId' | 'status' | 'provenance' | 'slotKey' | 'reach' | 'validUntil'>> & { reach?: unknown; validUntil?: unknown; assumption?: unknown; reviewBy?: unknown; record?: unknown; facets?: unknown; examples?: unknown; /** keep a change of the text as a DRAFT (only for Confirmed knowledge); the approved text stays the truth */ asDraft?: boolean }, meta?: ChangeMeta): { object: ContextObject; impact: ImpactResult } {
    const cur = this.getObjectAny(s, id); // an example can be edited: writing over it makes it the user's own
    if (!cur) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (patch.asDraft && cur.status === 'Confirmed' && !cur.sample) {
      // the TEXT (title, text, examples) of confirmed knowledge becomes a draft; the rest of the patch (where it lives, status, reach …) applies as before
      const title = typeof patch.title === 'string' ? patch.title.trim() || cur.title : cur.title;
      const content = typeof patch.content === 'string' ? patch.content : cur.content;
      const examples = 'examples' in patch ? cleanExamples(patch.examples) : cur.draft?.examples ?? cur.examples;
      const same = title === cur.title && content === cur.content && JSON.stringify(examples ?? null) === JSON.stringify(cur.examples ?? null);
      const { title: _t, content: _c, examples: _e, asDraft: _d, ...rest } = patch;
      void _t; void _c; void _e; void _d;
      this.setDraft(s, id, same ? null : { title, content, ...(examples ? { examples } : {}), at: now(), ...(meta?.reason ? { reason: meta.reason } : {}) });
      return this.updateObject(s, id, rest, { ...meta, reason: undefined });
    }
    // writing the text directly replaces it AND whatever draft was waiting (a draft never survives a direct replace)
    if (cur.draft && ('content' in patch || 'title' in patch)) this.setDraft(s, id, null);
    if (patch.nodeId) this.requireNode(s, patch.nodeId);
    if (patch.type && !CONTEXT_TYPES.includes(patch.type)) throw new RepoError('invalid', 'نوع Context باید واقعیت، تصمیم یا خط قرمز باشد.');
    const { value, impact } = this.withImpact(s, () => this.db.transaction(() => {
      const next: ContextObject = { ...cur, ...(patch as Partial<ContextObject>), title: (patch.title ?? cur.title).trim() || cur.title, updatedAt: now() };
      if (!next.slotKey?.trim()) delete next.slotKey; else next.slotKey = next.slotKey.trim();
      // scope: only when the patch mentions it (null / '' clears); invalid values are ignored
      delete next.reach; delete next.validUntil;
      const sc = scopeFields('reach' in patch ? patch : cur), sd = scopeFields('validUntil' in patch ? patch : cur);
      if (sc.reach) next.reach = sc.reach;
      if (sd.validUntil) next.validUntil = sd.validUntil;
      // assumption (a Fact only), its review date, a Decision's record: only when the patch mentions them (null / false clears)
      delete next.assumption; delete next.reviewBy; delete next.record;
      const th = thinkingFields({ type: next.type, assumption: 'assumption' in patch ? patch.assumption : cur.assumption, reviewBy: 'reviewBy' in patch ? patch.reviewBy : cur.reviewBy, record: 'record' in patch ? patch.record : cur.record });
      Object.assign(next, th);
      // facets: only when the patch mentions them (null / [] clears)
      delete next.facets;
      const fc = cleanFacets('facets' in patch ? patch.facets : cur.facets);
      if (fc) next.facets = fc;
      // examples of a red line: only when the patch mentions them (null / [] clears); only a red line keeps them
      delete next.examples;
      const ex = cleanExamples('examples' in patch ? patch.examples : cur.examples);
      if (ex && canHaveExamples(next)) next.examples = ex;
      // an example the user edits (text, type, status) is hers from now on; it enters every engine and AI path only then
      delete next.sample;
      const stillSample = !!cur.sample && next.title === cur.title && next.content === cur.content && next.type === cur.type && next.status === cur.status && JSON.stringify(next.examples ?? null) === JSON.stringify(cur.examples ?? null);
      if (stillSample) next.sample = true;
      else if (cur.sample && this.objectSlots(s) <= 0) throw new RepoError('forbidden', objectLimitMessage(this.planOf(s)));
      const contentChanged = (!!next.assumption !== !!cur.assumption) || JSON.stringify(next.record ?? null) !== JSON.stringify(cur.record ?? null) || next.title !== cur.title || next.content !== cur.content || next.type !== cur.type || JSON.stringify(next.examples ?? null) !== JSON.stringify(cur.examples ?? null) || next.reach !== cur.reach || next.validUntil !== cur.validUntil;
      if (contentChanged) next.version = cur.version + 1;
      this.db.prepare('UPDATE context_objects SET type=?, status=?, provenance=?, title=?, content=?, node_id=?, version=?, updated_at=?, slot_key=?, reach=?, valid_until=?, assumption=?, review_by=?, decision_record=?, facets=?, sample=?, examples=? WHERE id=? AND workspace_id=?')
        .run(next.type, next.status, next.provenance, next.title, next.content, next.nodeId, next.version, next.updatedAt, next.slotKey ?? null, next.reach ?? null, next.validUntil ?? null, next.assumption ? 1 : null, next.reviewBy ?? null, next.record ? JSON.stringify(next.record) : null, next.facets ? JSON.stringify(next.facets) : null, next.sample ? 1 : null, next.examples ? JSON.stringify(next.examples) : null, id, s.workspaceId);
      if (contentChanged) this.snapshot(s, next, next.updatedAt);
      // one record for a status transition, one for everything else that changed (edit / move / slot) — never silent
      const st = diffFields({ status: cur.status }, { status: next.status }, ['status']);
      if (st) this.recordChange(s, { objectId: id, fromVersion: cur.version, toVersion: cur.version, kind: statusChangeKind(cur.status, next.status), meta, before: st.before, after: st.after });
      const rest = diffFields(cur, next, ['type', 'title', 'content', 'nodeId', 'slotKey', 'provenance', 'reach', 'validUntil', 'assumption', 'reviewBy', 'record', 'facets', 'examples']);
      // a reason belongs to an edit of CONFIRMED knowledge; a draft (Proposed / Needs Review …) carries none (src/core/versionHistory.ts)
      if (rest) this.recordChange(s, { objectId: id, fromVersion: cur.version, toVersion: next.version, kind: meta?.kind ?? 'edited', meta: reasonAllowed(cur.status) ? meta : { ...meta, reason: undefined }, before: rest.before, after: rest.after });
      return next;
    })());
    return { object: value, impact };
  },

  /** A new object that replaces `oldId`: version = old + 1, relationship `supersedes`, old becomes Superseded (never deleted). */
  supersedeObject(this: Repo, s: Scope, oldId: string, input: ObjectInput, meta?: ChangeMeta): { object: ContextObject; previous: ContextObject; impact: ImpactResult } {
    const old = this.getObject(s, oldId);
    if (!old) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (old.status === 'Superseded') throw new RepoError('invalid', 'این مورد قبلاً جایگزین شده است.');
    this.requireNode(s, input.nodeId);
    const { value, impact } = this.withImpact(s, () => this.db.transaction(() => {
      const t = now();
      const created: ContextObject = { id: newId('ctx'), workspaceId: s.workspaceId, type: input.type, status: input.status ?? 'Confirmed', provenance: input.provenance, title: input.title.trim(), content: input.content, nodeId: input.nodeId, version: old.version + 1, ...((input.slotKey ?? old.slotKey) ? { slotKey: (input.slotKey ?? old.slotKey)! } : {}), ...scopeFields({ reach: input.reach ?? old.reach, validUntil: input.validUntil ?? old.validUntil }), ...thinkingFields({ type: input.type, assumption: input.assumption ?? old.assumption, reviewBy: input.reviewBy ?? old.reviewBy, record: input.record ?? old.record }), ...(canHaveExamples({ type: input.type, reach: input.reach ?? old.reach }) && cleanExamples(input.examples ?? old.examples) ? { examples: cleanExamples(input.examples ?? old.examples) } : {}), createdAt: t, updatedAt: t };
      this.insertObject(s, created);
      this.db.prepare("UPDATE context_objects SET status='Superseded', superseded_by_id=?, updated_at=? WHERE id=? AND workspace_id=?").run(created.id, t, oldId, s.workspaceId);
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(newId('rel'), s.userId, s.workspaceId, created.id, oldId, 'supersedes', t);
      this.carryDependencies(s, oldId, created.id);
      this.recordChange(s, { objectId: oldId, fromVersion: old.version, toVersion: created.version, kind: 'superseded', meta, before: { status: old.status }, after: { status: 'Superseded', supersededById: created.id }, source: created.source });
      this.recordChange(s, { objectId: created.id, fromVersion: old.version, toVersion: created.version, kind: 'created', meta: { ...meta, reason: undefined }, after: { type: created.type, title: created.title, nodeId: created.nodeId, status: created.status, supersedes: oldId }, source: created.source });
      return created;
    })());
    return { object: value, previous: this.getObject(s, oldId)!, impact };
  },

  /** «بدون تغییر بپذیر»: the user looked at an object whose dependency changed and keeps it as it is. */
  acceptReview(this: Repo, s: Scope, objectId: string, meta?: ChangeMeta): ContextChange {
    const o = this.getObject(s, objectId);
    if (!o) throw new RepoError('not_found', 'Context پیدا نشد.');
    this.recordChange(s, { objectId, fromVersion: o.version, toVersion: o.version, kind: 'review_accepted', meta: { actor: 'user', ...meta } });
    const all = this.listChanges(s, { objectId });
    return all[all.length - 1];
  },

  /**
   * «نتیجه چه شد؟»: the answer to a due decision is a Change (kind `outcome_noted`); the text is for people, never for a model.
   * With a metric expectation the user's verdict (met / partial / missed) is written into the Change, with the metric and the
   * last confirmed number it was read against — the data a later analysis would need, nothing derived from it here.
   */
  noteOutcome(this: Repo, s: Scope, objectId: string, text: string, meta?: ChangeMeta, verdict?: ExpectationVerdict): ContextChange {
    const o = this.getObject(s, objectId);
    if (!o) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (o.type !== 'Decision') throw new RepoError('invalid', 'نتیجه فقط برای تصمیم ثبت می‌شود.');
    if (verdict !== undefined && verdict !== 'met' && verdict !== 'partial' && verdict !== 'missed') throw new RepoError('invalid', 'داوری معتبر نیست.');
    const t = text.trim();
    if (!t && !verdict) throw new RepoError('invalid', 'نتیجه را بنویس.');
    const exp = o.record?.metricExpectation;
    const last = verdict && exp ? this.listMeasurements(s, { metricId: exp.metricId, status: 'Confirmed' }).filter((m) => m.at <= exp.by).at(-1) : undefined;
    const VERDICT_FA = { met: 'به انتظار رسید', partial: 'نیمه', missed: 'نرسید' } as const;
    this.recordChange(s, { objectId, fromVersion: o.version, toVersion: o.version, kind: 'outcome_noted', meta: { ...meta, reason: (t || (verdict ? VERDICT_FA[verdict] : '')).slice(0, 1000) },
      ...(verdict ? { after: { verdict, ...(exp ? { metricId: exp.metricId } : {}), ...(last ? { measurementId: last.id, value: last.value, valueAt: last.at } : {}) } } : {}) });
    const all = this.listChanges(s, { objectId });
    return all[all.length - 1];
  },

  /** «keep» — the other object becomes Superseded by the kept one (never deleted); the history stays. */
  supersedeBy(this: Repo, s: Scope, loserId: string, winnerId: string, meta?: ChangeMeta): { loser: ContextObject; impact: ImpactResult } {
    const loser = this.getObject(s, loserId);
    const winner = this.getObject(s, winnerId);
    if (!loser || !winner) throw new RepoError('not_found', 'Context پیدا نشد.');
    if (loserId === winnerId) throw new RepoError('invalid', 'دو مورد یکی نیستند.');
    const { value, impact } = this.withImpact(s, () => this.db.transaction(() => {
      const t = now();
      this.db.prepare("UPDATE context_objects SET status='Superseded', superseded_by_id=?, updated_at=? WHERE id=? AND workspace_id=?").run(winnerId, t, loserId, s.workspaceId);
      this.db.prepare('INSERT INTO context_relationships (id, user_id, workspace_id, source_id, target_id, type, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('rel'), s.userId, s.workspaceId, winnerId, loserId, 'supersedes', t);
      this.carryDependencies(s, loserId, winnerId);
      this.recordChange(s, { objectId: loserId, fromVersion: loser.version, toVersion: loser.version, kind: meta?.kind ?? 'contradiction_resolved', meta, before: { status: loser.status }, after: { status: 'Superseded', supersededById: winnerId } });
      if (winner.status !== 'Confirmed') {
        this.db.prepare("UPDATE context_objects SET status='Confirmed', updated_at=? WHERE id=? AND workspace_id=?").run(t, winnerId, s.workspaceId);
        this.recordChange(s, { objectId: winnerId, fromVersion: winner.version, toVersion: winner.version, kind: statusChangeKind(winner.status, 'Confirmed'), meta, before: { status: winner.status }, after: { status: 'Confirmed' } });
      }
      return this.getObject(s, loserId)!;
    })());
    return { loser: value, impact };
  },
};
