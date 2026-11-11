import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

/**
 * «پیشنهاد» و «واکنش کاربر به پیشنهاد» (migration 25). فقط جدول‌های خود لایهٔ هوش؛ هیچ حقیقت، رابطه یا ساختاری نمی‌نویسد.
 * پیشنهاد فقط شناسه، برچسب و امتیاز نگه می‌دارد، نه متن کاربر. این داده‌ها بعداً برای ارزیابی و بهبود لازم‌اند
 * (چند درصد پیشنهادها پذیرفته شد؟ کاربر به‌جایش چه برگزید؟).
 */

export interface Scope { userId: string; workspaceId: string }

export type SuggestionKind = 'related' | 'thought_kind' | 'knowledge_type' | 'certainty' | 'placement' | 'duplicate' | 'contradiction';
export type SubjectKind = 'thought' | 'object' | 'note' | 'file' | 'text';
export type Reaction = 'accepted' | 'rejected' | 'changed';

export interface SuggestionInput {
  recipe: string;
  recipeVersion: number;
  kind: SuggestionKind;
  subjectKind: SubjectKind;
  subjectId?: string;
  subjectHash?: string;
  /** مقدار(های) پیشنهادی: شناسه‌ها، برچسب‌ها، امتیازها */
  suggestion: unknown;
  /** کدام مدل‌ها و قاعده‌ها ساختندش */
  specialists: unknown;
  confidence?: number;
  tier?: string;
}

export interface SuggestionRow {
  id: string; recipe: string; recipeVersion: number; kind: SuggestionKind; subjectKind: SubjectKind; subjectId: string | null; subjectHash: string | null;
  suggestion: unknown; specialists: unknown; confidence: number | null; tier: string | null; createdAt: string;
  /** آخرین واکنش (اگر بود) */
  reaction: Reaction | null; finalValue: unknown | null;
}

export class IntelligenceStore {
  constructor(private readonly db: Database.Database, private readonly now: () => string = () => new Date().toISOString()) {}

  recordSuggestion(s: Scope, input: SuggestionInput): string {
    const id = `sug_${randomUUID()}`;
    this.db.prepare(`INSERT INTO intelligence_suggestions
      (id, user_id, workspace_id, recipe, recipe_version, kind, subject_kind, subject_id, subject_hash, suggestion, specialists, confidence, tier, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, s.userId, s.workspaceId, input.recipe, input.recipeVersion, input.kind, input.subjectKind, input.subjectId ?? null, input.subjectHash ?? null,
        JSON.stringify(input.suggestion), JSON.stringify(input.specialists), input.confidence ?? null, input.tier ?? null, this.now());
    return id;
  }

  /** واکنش افزودنی (تاریخچه می‌ماند). پیشنهاد باید از همین کاربر و فضا باشد. */
  recordReaction(s: Scope, suggestionId: string, reaction: Reaction, finalValue?: unknown): string {
    const own = this.db.prepare('SELECT 1 FROM intelligence_suggestions WHERE id = ? AND user_id = ? AND workspace_id = ?').get(suggestionId, s.userId, s.workspaceId);
    if (!own) throw new Error('پیشنهاد پیدا نشد.');
    const id = `rea_${randomUUID()}`;
    this.db.prepare('INSERT INTO intelligence_reactions (id, suggestion_id, user_id, workspace_id, reaction, final_value, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, suggestionId, s.userId, s.workspaceId, reaction, finalValue === undefined ? null : JSON.stringify(finalValue), this.now());
    return id;
  }

  list(s: Scope, filter: { kind?: SuggestionKind; subjectKind?: SubjectKind; subjectId?: string } = {}): SuggestionRow[] {
    const where = ['s.user_id = ?', 's.workspace_id = ?'];
    const args: unknown[] = [s.userId, s.workspaceId];
    if (filter.kind) { where.push('s.kind = ?'); args.push(filter.kind); }
    if (filter.subjectKind) { where.push('s.subject_kind = ?'); args.push(filter.subjectKind); }
    if (filter.subjectId) { where.push('s.subject_id = ?'); args.push(filter.subjectId); }
    const rows = this.db.prepare(`
      SELECT s.*, (SELECT r.reaction FROM intelligence_reactions r WHERE r.suggestion_id = s.id ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS reaction,
             (SELECT r.final_value FROM intelligence_reactions r WHERE r.suggestion_id = s.id ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS final_value
      FROM intelligence_suggestions s WHERE ${where.join(' AND ')} ORDER BY s.created_at, s.rowid`).all(...args) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string, recipe: r.recipe as string, recipeVersion: r.recipe_version as number, kind: r.kind as SuggestionKind, subjectKind: r.subject_kind as SubjectKind,
      subjectId: (r.subject_id as string | null) ?? null, subjectHash: (r.subject_hash as string | null) ?? null,
      suggestion: JSON.parse(r.suggestion as string), specialists: JSON.parse(r.specialists as string),
      confidence: (r.confidence as number | null) ?? null, tier: (r.tier as string | null) ?? null, createdAt: r.created_at as string,
      reaction: (r.reaction as Reaction | null) ?? null, finalValue: r.final_value ? JSON.parse(r.final_value as string) : null,
    }));
  }

  /** پذیرفته/ردشده/عوض‌شده به‌تفکیک نوع پیشنهاد (برای ارزیابی پس از عرضه) */
  reactionStats(s: Scope): Array<{ kind: SuggestionKind; shown: number; accepted: number; rejected: number; changed: number }> {
    const all = this.list(s);
    const by = new Map<SuggestionKind, { kind: SuggestionKind; shown: number; accepted: number; rejected: number; changed: number }>();
    for (const r of all) {
      const e = by.get(r.kind) ?? { kind: r.kind, shown: 0, accepted: 0, rejected: 0, changed: 0 };
      e.shown++;
      if (r.reaction) e[r.reaction]++;
      by.set(r.kind, e);
    }
    return [...by.values()];
  }
}
