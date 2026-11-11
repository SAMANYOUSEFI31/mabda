/**
 * Document import: preview (nothing is saved) → commit (one transaction).
 *
 * Nothing is lost: the whole normalised text is kept as a source file, and every note made from it records the character
 * range of its passage in that file. Importing the same text again (pasted or from a file; compared by a hash of the
 * normalised text) makes nothing new. Notes are the user's Material: nothing here makes knowledge, a relation or truth.
 * Smart suggestions (kind of a chunk, suggested section, semantic duplicate) are read from the OFF-by-default slots in
 * src/core/suggestionSlots.ts; with no provider registered the preview carries none.
 */
import path from 'node:path';
import type { Note, StoredFile, Thought, TreeNode } from '../../src/types/index.ts';
import { defaultNodeId } from '../../src/core/nodeTree.ts';
import { estimateTokens } from '../../src/core/tokens.ts';
import { getSlotProvider } from '../../src/core/suggestionSlots.ts';
import type { SlotSuggestion, SuggestionSlot } from '../../src/core/suggestionSlots.ts';
import { RepoError, newId } from '../db/repo.ts';
import type { Repo, Scope } from '../db/repo.ts';
import { MAX_IMPORT_CHUNKS, locateInSource, planChunks } from './plan.ts';
import type { DraftChunk } from './plan.ts';
import { hashDocText, normalizeDocText, readDocument } from './readers.ts';

export interface DuplicateInfo { fileId: string; name: string; importedAt: string; noteCount: number }
export interface PreviewChunk extends DraftChunk { suggestions?: SlotSuggestion[] }
export interface PreviewResult {
  name: string;
  /** the normalised text: the client sends it back unchanged on commit */
  text: string;
  hash: string;
  chars: number;
  chunks: PreviewChunk[];
  /** distinct candidate section names, in order (offered only if the user asks for sections) */
  headings: string[];
  duplicate?: DuplicateInfo;
}
export interface CommitChunk { text: string; /** a section name the user accepted (a new/reused section under the default place) */ section?: string }
export interface CommitResult {
  duplicate: boolean;
  file: StoredFile;
  notes: Note[];
  thoughts: Thought[];
  nodes: TreeNode[];
}

const SLOT_TIMEOUT_MS = 1500;
const SLOT_CHUNK_LIMIT = 60;
const norm = (s: string) => s.replace(/‌/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export class DocImportService {
  constructor(private readonly repo: Repo) {}

  findDuplicate(s: Scope, hash: string): DuplicateInfo | undefined {
    const r = this.repo.db.prepare('SELECT id, name, created_at FROM files WHERE workspace_id = ? AND user_id = ? AND content_hash = ? ORDER BY created_at LIMIT 1').get(s.workspaceId, s.userId, hash) as { id: string; name: string; created_at: string } | undefined;
    if (!r) return undefined;
    const n = (this.repo.db.prepare('SELECT COUNT(*) AS n FROM notes WHERE workspace_id = ? AND user_id = ? AND source_file_id = ?').get(s.workspaceId, s.userId, r.id) as { n: number }).n;
    return { fileId: r.id, name: r.name, importedAt: r.created_at, noteCount: n };
  }

  async preview(s: Scope, input: { text?: string; name?: string; file?: { name: string; buffer: Buffer } }): Promise<PreviewResult> {
    this.repo.assertWorkspace(s);
    const doc = await readDocument(input);
    const chunks: PreviewChunk[] = planChunks(doc.text);
    if (chunks.length > MAX_IMPORT_CHUNKS) throw new RepoError('invalid', 'سند بیش از حد بزرگ است؛ آن را در چند بخش وارد کن.');
    await this.attachSuggestions(chunks, defaultNodeId(this.repo.listNodes(s)));
    const name = (input.file?.name ?? input.name ?? '').trim() || 'متن چسبانده‌شده.txt';
    return { name, text: doc.text, hash: doc.hash, chars: doc.text.length, chunks, headings: [...new Set(chunks.flatMap((c) => (c.heading ? [c.heading] : [])))], duplicate: this.findDuplicate(s, doc.hash) };
  }

  /** the off-by-default intelligence slots: a failure or a slow provider means «no suggestion», never an error for the import */
  private async attachSuggestions(chunks: PreviewChunk[], nodeId: string): Promise<void> {
    const slots: SuggestionSlot[] = ['kind', 'place', 'duplicate'];
    const providers = slots.map((slot) => [slot, getSlotProvider(slot)] as const).filter((x): x is [SuggestionSlot, NonNullable<ReturnType<typeof getSlotProvider>>] => x[1] !== null);
    if (!providers.length) return;
    await Promise.all(chunks.slice(0, SLOT_CHUNK_LIMIT).map(async (c) => {
      const got = await Promise.all(providers.map(async ([, p]) => {
        try {
          return await Promise.race([p({ text: c.text, nodeId }), new Promise<SlotSuggestion[]>((r) => setTimeout(() => r([]), SLOT_TIMEOUT_MS))]);
        } catch { return []; }
      }));
      const all = got.flat();
      if (all.length) c.suggestions = all;
    }));
  }

  commit(s: Scope, input: { name?: string; text: string; chunks: CommitChunk[] }): CommitResult {
    this.repo.assertWorkspace(s);
    const text = normalizeDocText(String(input.text ?? ''));
    if (!text) throw new RepoError('invalid', 'متن سند خالی است.');
    const hash = hashDocText(text);
    const nodesNow = this.repo.listNodes(s);
    const dup = this.findDuplicate(s, hash);
    if (dup) {
      // importing the same document again makes nothing: the answer is what the first import left
      return { duplicate: true, file: this.repo.getFile(s, dup.fileId)!, notes: this.repo.listNotes(s).filter((n) => this.noteSourceFile(s, n.id) === dup.fileId), thoughts: this.repo.listThoughts(s, { includeResolved: true }), nodes: nodesNow };
    }
    const chunks = (Array.isArray(input.chunks) ? input.chunks : []).map((c) => ({ text: String(c?.text ?? '').trim(), section: typeof c?.section === 'string' ? c.section.trim().slice(0, 80) : '' })).filter((c) => c.text);
    if (!chunks.length) throw new RepoError('invalid', 'دست‌کم یک تکه را برای وارد شدن نگه دار.');
    if (chunks.length > MAX_IMPORT_CHUNKS) throw new RepoError('invalid', 'تکه‌ها بیش از حدند؛ سند را در چند بخش وارد کن.');
    if (new Set(chunks.map((c) => c.section).filter(Boolean)).size > 60) throw new RepoError('invalid', 'بخش‌های پیشنهادی بیش از حدند.');

    const home = defaultNodeId(nodesNow);
    const rawName = (input.name ?? '').trim().slice(0, 200) || 'متن چسبانده‌شده.txt';
    const ext = path.extname(rawName).toLowerCase();
    const mime = ext === '.md' ? 'text/markdown' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === '.pdf' ? 'application/pdf' : 'text/plain';
    const at = new Date().toISOString();
    const fileId = newId('file');

    const notes: Note[] = this.repo.db.transaction(() => {
      // the source: the whole text, status «ready» but with NO retrieval chunks, so it is never injected into a request by itself
      this.repo.db.prepare("INSERT INTO files (id, user_id, workspace_id, node_id, name, mime, size_bytes, status, tokens, summary, raw_text, content_hash, created_at) VALUES (?,?,?,?,?,?,?,'ready',?,?,?,?,?)")
        .run(fileId, s.userId, s.workspaceId, home || null, rawName, mime, Buffer.byteLength(text), estimateTokens(text), `سند وارد‌شده؛ ${chunks.length} یادداشت از آن ساخته شد. متن کامل اینجا نگه داشته می‌شود.`, text, hash, at);
      const sectionNode = new Map<string, string>();
      const nodeFor = (label: string): string => {
        if (!label) return home;
        const key = norm(label);
        if (!sectionNode.has(key)) {
          const live = this.repo.listNodes(s);
          const same = live.find((n) => (n.parentId ?? '') === (home ?? '') && norm(n.label) === key);
          sectionNode.set(key, same ? same.id : this.repo.createNode(s, { parentId: home, label }).id);
        }
        return sectionNode.get(key)!;
      };
      const setSource = this.repo.db.prepare('UPDATE notes SET source_file_id = ?, source_start = ?, source_end = ? WHERE id = ? AND workspace_id = ? AND user_id = ?');
      let cursor = 0;
      return chunks.map((c) => {
        const note = this.repo.createNote(s, nodeFor(c.section), c.text);
        const where = locateInSource(text, c.text, cursor);
        if (where) cursor = where.start + 1;
        setSource.run(fileId, where?.start ?? null, where?.end ?? null, note.id, s.workspaceId, s.userId);
        return note;
      });
    })();
    return { duplicate: false, file: this.repo.getFile(s, fileId)!, notes, thoughts: this.repo.listThoughts(s, { includeResolved: true }), nodes: this.repo.listNodes(s) };
  }

  private noteSourceFile(s: Scope, noteId: string): string | undefined {
    return (this.repo.db.prepare('SELECT source_file_id AS f FROM notes WHERE id = ? AND workspace_id = ? AND user_id = ?').get(noteId, s.workspaceId, s.userId) as { f: string | null } | undefined)?.f ?? undefined;
  }

  /** a note's passage in its source file, with a little context; undefined when the note has no source (or the file was deleted) */
  sourceOf(s: Scope, noteId: string): { fileId: string; fileName: string; start: number | null; end: number | null; excerpt: string | null } | undefined {
    const r = this.repo.db.prepare('SELECT n.source_file_id AS fid, n.source_start AS st, n.source_end AS en, f.name AS name, f.raw_text AS txt FROM notes n JOIN files f ON f.id = n.source_file_id WHERE n.id = ? AND n.workspace_id = ? AND n.user_id = ?').get(noteId, s.workspaceId, s.userId) as { fid: string; st: number | null; en: number | null; name: string; txt: string | null } | undefined;
    if (!r) return undefined;
    return { fileId: r.fid, fileName: r.name, start: r.st, end: r.en, excerpt: r.txt !== null && r.st !== null && r.en !== null ? r.txt.slice(r.st, r.en) : null };
  }
}
