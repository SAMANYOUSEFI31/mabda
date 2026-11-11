import type Database from 'better-sqlite3';
import { embeddingKeyId, type EmbeddingKey, type EmbeddingStore } from './types.ts';

/** حافظه (آزمون و اسکریپت ارزیابی) */
export class MemoryEmbeddingStore implements EmbeddingStore {
  private readonly rows = new Map<string, { key: EmbeddingKey; vector: Float32Array }>();
  async getMany(keys: EmbeddingKey[]): Promise<Map<string, Float32Array>> {
    const out = new Map<string, Float32Array>();
    for (const k of keys) { const r = this.rows.get(embeddingKeyId(k)); if (r) out.set(embeddingKeyId(k), r.vector); }
    return out;
  }
  async putMany(rows: Array<{ key: EmbeddingKey; vector: Float32Array }>): Promise<void> {
    for (const r of rows) this.rows.set(embeddingKeyId(r.key), r);
  }
  async dropStale(workspaceId: string, userId: string, itemKind: string, itemId: string, keepHashes: string[]): Promise<number> {
    const keep = new Set(keepHashes);
    let n = 0;
    for (const [id, r] of this.rows) {
      const k = r.key;
      if (k.workspaceId === workspaceId && k.userId === userId && k.itemKind === itemKind && k.itemId === itemId && !keep.has(k.textHash)) { this.rows.delete(id); n++; }
    }
    return n;
  }
  get size(): number { return this.rows.size; }
}

const toBlob = (v: Float32Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const fromBlob = (b: Buffer): Float32Array => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

/**
 * SQLite (جدول `intelligence_embeddings`، migration 25). کلید = (فضا، چیز، تکه، هش متن، مدل):
 * با تغییر متن یا نسخهٔ تکه‌کننده یا مدل، بردار قدیمی دیگر خوانده نمی‌شود و دوباره محاسبه می‌شود (پایداری و هزینه).
 * بردار فقط یک مشتق است و هیچ‌جا حقیقت نیست.
 */
export class SqliteEmbeddingStore implements EmbeddingStore {
  constructor(private readonly db: Database.Database) {}

  async getMany(keys: EmbeddingKey[]): Promise<Map<string, Float32Array>> {
    const out = new Map<string, Float32Array>();
    const stmt = this.db.prepare('SELECT vector FROM intelligence_embeddings WHERE workspace_id = ? AND user_id = ? AND item_kind = ? AND item_id = ? AND chunk_index = ? AND text_hash = ? AND model_key = ?');
    for (const k of keys) {
      const r = stmt.get(k.workspaceId, k.userId, k.itemKind, k.itemId, k.chunkIndex, k.textHash, k.modelKey) as { vector: Buffer } | undefined;
      if (r) out.set(embeddingKeyId(k), fromBlob(r.vector));
    }
    return out;
  }

  async putMany(rows: Array<{ key: EmbeddingKey; vector: Float32Array }>): Promise<void> {
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO intelligence_embeddings
      (workspace_id, user_id, item_kind, item_id, chunk_index, text_hash, model_key, dims, vector, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const at = new Date().toISOString();
    this.db.transaction(() => { for (const { key: k, vector } of rows) stmt.run(k.workspaceId, k.userId, k.itemKind, k.itemId, k.chunkIndex, k.textHash, k.modelKey, vector.length, toBlob(vector), at); })();
  }

  async dropStale(workspaceId: string, userId: string, itemKind: string, itemId: string, keepHashes: string[]): Promise<number> {
    const rows = this.db.prepare('SELECT DISTINCT text_hash AS h FROM intelligence_embeddings WHERE workspace_id = ? AND user_id = ? AND item_kind = ? AND item_id = ?').all(workspaceId, userId, itemKind, itemId) as Array<{ h: string }>;
    const keep = new Set(keepHashes);
    const del = this.db.prepare('DELETE FROM intelligence_embeddings WHERE workspace_id = ? AND user_id = ? AND item_kind = ? AND item_id = ? AND text_hash = ?');
    let n = 0;
    for (const { h } of rows) if (!keep.has(h)) n += del.run(workspaceId, userId, itemKind, itemId, h).changes;
    return n;
  }
}
