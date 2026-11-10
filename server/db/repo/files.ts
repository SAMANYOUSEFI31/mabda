/**
 * Uploaded files, their chunks and the monthly file usage.
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { Scope, StoredChunk, newId, now, rowToFile } from './shared.ts';
import type { FileStatus, StoredFile } from '../../../src/types/index.ts';

export const filesMethods = {
  importFile(this: Repo, s: Scope, f: { id: string; nodeId: string; name: string; mime: string; rawText: string; summary: string; tokens: number; createdAt: string; chunks: Array<{ index: number; text: string; tokens: number }> }) {
    this.db.prepare("INSERT OR REPLACE INTO files (id, user_id, workspace_id, node_id, name, mime, size_bytes, status, tokens, raw_text, summary, created_at) VALUES (?,?,?,?,?,?,?,'ready',?,?,?,?)")
      .run(f.id, s.userId, s.workspaceId, f.nodeId, f.name, f.mime, Buffer.byteLength(f.rawText), f.tokens, f.rawText, f.summary, f.createdAt);
    this.saveChunks(s, f.id, f.chunks);
  },

  chunkCount(this: Repo, fileId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM file_chunks WHERE file_id = ?').get(fileId) as { n: number }).n;
  },

  createFile(this: Repo, s: Scope, f: { name: string; mime: string; sizeBytes: number; nodeId?: string; rawText: string; tokens: number }): StoredFile {
    this.assertWorkspace(s);
    if (f.nodeId) this.requireNode(s, f.nodeId);
    const id = newId('file');
    const t = now();
    this.db.prepare('INSERT INTO files (id, user_id, workspace_id, node_id, name, mime, size_bytes, status, tokens, raw_text, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, s.userId, s.workspaceId, f.nodeId ?? null, f.name, f.mime, f.sizeBytes, 'uploaded', f.tokens, f.rawText, t);
    return this.getFile(s, id)!;
  },

  getFile(this: Repo, s: Scope, id: string): StoredFile | undefined {
    const r = this.db.prepare('SELECT * FROM files WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? rowToFile(r, this.chunkCount(id)) : undefined;
  },

  getFileText(this: Repo, s: Scope, id: string): string | undefined {
    const r = this.db.prepare('SELECT raw_text FROM files WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as { raw_text: string | null } | undefined;
    return r?.raw_text ?? undefined;
  },

  listFiles(this: Repo, s: Scope): StoredFile[] {
    return (this.db.prepare('SELECT * FROM files WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map((r) => rowToFile(r, this.chunkCount(r.id as string)));
  },

  setFileStatus(this: Repo, s: Scope, id: string, status: FileStatus, extra: { summary?: string; error?: string } = {}) {
    this.db.prepare('UPDATE files SET status = ?, summary = COALESCE(?, summary), error = ? WHERE id = ? AND workspace_id = ? AND user_id = ?')
      .run(status, extra.summary ?? null, extra.error ?? null, id, s.workspaceId, s.userId);
  },

  saveChunks(this: Repo, s: Scope, fileId: string, chunks: Array<{ index: number; text: string; tokens: number }>) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM file_chunks WHERE file_id = ? AND workspace_id = ?').run(fileId, s.workspaceId);
      const ins = this.db.prepare('INSERT INTO file_chunks (file_id, idx, user_id, workspace_id, text, tokens) VALUES (?,?,?,?,?,?)');
      for (const c of chunks) ins.run(fileId, c.index, s.userId, s.workspaceId, c.text, c.tokens);
    })();
  },

  /** chunks of READY files only (a file that failed or is still processing is never injected) */
  listReadyChunks(this: Repo, s: Scope): StoredChunk[] {
    return (this.db.prepare(`SELECT c.file_id, c.idx, c.text, c.tokens FROM file_chunks c JOIN files f ON f.id = c.file_id
      WHERE c.workspace_id = ? AND c.user_id = ? AND f.status = 'ready' ORDER BY c.file_id, c.idx`).all(s.workspaceId, s.userId) as Array<Record<string, unknown>>)
      .map((r) => ({ fileId: r.file_id as string, index: r.idx as number, text: r.text as string, tokens: r.tokens as number }));
  },

  deleteFile(this: Repo, s: Scope, id: string) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM file_chunks WHERE file_id = ? AND workspace_id = ?').run(id, s.workspaceId);
      this.db.prepare('DELETE FROM files WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
    })();
  },

  fileUsage(this: Repo, s: Scope, period: string): number {
    const r = this.db.prepare('SELECT tokens FROM file_usage WHERE workspace_id = ? AND period = ? AND user_id = ?').get(s.workspaceId, period, s.userId) as { tokens: number } | undefined;
    return r?.tokens ?? 0;
  },

  addFileUsage(this: Repo, s: Scope, period: string, tokens: number): number {
    this.db.prepare('INSERT INTO file_usage (user_id, workspace_id, period, tokens) VALUES (?,?,?,?) ON CONFLICT(workspace_id, period) DO UPDATE SET tokens = tokens + excluded.tokens').run(s.userId, s.workspaceId, period, tokens);
    return this.fileUsage(s, period);
  },
};
