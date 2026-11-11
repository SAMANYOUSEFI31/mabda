import type Database from 'better-sqlite3';

/**
 * Forward-only, versioned migrations. Every table carries user_id + workspace_id so the same schema moves to
 * Postgres later (swap the driver behind `Repo`, keep the SQL portable: no SQLite-only functions in migrations).
 * Never edit a released migration — append a new one.
 */
export interface Migration {
  version: number;
  name: string;
  up(db: Database.Database): void;
}

type LegacyThinkingItem = { kind: 'idea' | 'question' | 'assumption' | 'open_decision'; inferred?: boolean; text: string; line: number; hash: string };
const LEGACY_MARKS = '\\u200c\\u200d\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff';
const LEGACY_LEAD = new RegExp(`^[\\s${LEGACY_MARKS}]*(?:[-*•–—]|[\\d۰-۹٠-٩]+[.)])?[\\s${LEGACY_MARKS}]*`);
const LEGACY_MARKER = new RegExp(`^\\[[\\s${LEGACY_MARKS}]*(ایده|سؤال|سوال|فرض|تصمیم[\\s${LEGACY_MARKS}]*باز|idea|question|assumption|open[\\s${LEGACY_MARKS}]*decision)[\\s${LEGACY_MARKS}]*\\][\\s${LEGACY_MARKS}]*[:：\\-–—]?[\\s${LEGACY_MARKS}]*`, 'i');
const legacyNormalizeFa = (text: string) => text.replace(/[\u064B-\u065F\u0670\u0654]/g, '').replace(/\u200c/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();
const legacyLineHash = (text: string) => {
  const marks = new RegExp(`[${LEGACY_MARKS}]`, 'g');
  const normalized = legacyNormalizeFa(text.replace(/\u200c/g, '')).replace(marks, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) { hash ^= normalized.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(36);
};
const LEGACY_STOP_WORDS = new Set(['و', 'در', 'به', 'از', 'برای', 'با', 'را', 'یا', 'که', 'این', 'آن', 'هر', 'یک']);
const legacyTitleTokens = (text: string) => new Set(legacyNormalizeFa(text).replace(/[^\p{L}\p{N} ]/gu, ' ').split(' ').filter((word) => word.length >= 2 && !LEGACY_STOP_WORDS.has(word)));
const legacySimilarity = (a: string, b: string) => {
  const left = legacyTitleTokens(a), right = legacyTitleTokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / (left.size + right.size - intersection);
};
const legacyKind = (raw: string): LegacyThinkingItem['kind'] => {
  const word = raw.replace(new RegExp(`[\\s${LEGACY_MARKS}]`, 'g'), '').toLowerCase();
  if (word === 'ایده' || word === 'idea') return 'idea';
  if (word === 'سؤال' || word === 'سوال' || word === 'question') return 'question';
  if (word === 'فرض' || word === 'assumption') return 'assumption';
  return 'open_decision';
};
function parseLegacyThinking(content: string): LegacyThinkingItem[] {
  const out: LegacyThinkingItem[] = [];
  let open: LegacyThinkingItem | undefined;
  const hardBreak = /\\[ \t]*$/;
  const tail = new RegExp(`[\\s${LEGACY_MARKS}»"')\\]}”’]*$`);
  const question = (line: string) => {
    const text = line.replace(tail, '');
    if (!/[؟?]$/.test(text)) return false;
    const body = line.replace(LEGACY_LEAD, '').trim();
    return !(!/\s/.test(body) && body.includes('://')) && !body.startsWith('#') && /[\p{L}\p{N}]/u.test(text.slice(0, -1));
  };
  content.split(/\r?\n/).forEach((raw, line) => {
    if (open) {
      open.text = `${open.text}\n${raw.replace(hardBreak, '').trim()}`;
      open.hash = legacyLineHash(open.text);
      if (!hardBreak.test(raw)) open = undefined;
      return;
    }
    const rest = raw.replace(LEGACY_LEAD, '');
    const marker = LEGACY_MARKER.exec(rest);
    if (!marker) {
      if (question(rest)) out.push({ kind: 'question', inferred: true, text: rest.trim(), line, hash: legacyLineHash(rest) });
      return;
    }
    const continues = hardBreak.test(rest);
    const text = rest.slice(marker[0].length).replace(hardBreak, '').trim();
    if (!text) return;
    const item = { kind: legacyKind(marker[1]), text, line, hash: legacyLineHash(text) };
    out.push(item);
    if (continues) open = item;
  });
  return out;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'base: workspaces, tree, context objects, relationships, assets, ledger, chats, specs',
    up(db) {
      db.exec(`
        CREATE TABLE workspaces (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          data TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_workspaces_user ON workspaces(user_id);

        CREATE TABLE tree_nodes (
          id TEXT NOT NULL, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          parent_id TEXT, label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          is_system INTEGER NOT NULL DEFAULT 0, ord INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (workspace_id, id)
        );

        CREATE TABLE context_objects (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          type TEXT NOT NULL, status TEXT NOT NULL, provenance TEXT NOT NULL,
          title TEXT NOT NULL, content TEXT NOT NULL, node_id TEXT NOT NULL,
          superseded_by_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_objects_ws ON context_objects(workspace_id, node_id);

        CREATE TABLE context_relationships (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          source_id TEXT NOT NULL, target_id TEXT NOT NULL, type TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_rel_ws ON context_relationships(workspace_id);

        CREATE TABLE deliverables (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          data TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_deliverables_ws ON deliverables(workspace_id, created_at);

        CREATE TABLE ledger (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          data TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_ledger_ws ON ledger(workspace_id, created_at);

        CREATE TABLE chat_sessions (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          data TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_chats_ws ON chat_sessions(workspace_id, updated_at);

        CREATE TABLE specs (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          data TEXT NOT NULL, created_at TEXT NOT NULL
        );

        CREATE TABLE kv (
          user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
          PRIMARY KEY (user_id, key)
        );
      `);
    },
  },
  {
    version: 2,
    name: 'object versions + free-form notes',
    up(db) {
      db.exec(`
        ALTER TABLE context_objects ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

        CREATE TABLE context_object_versions (
          object_id TEXT NOT NULL, version INTEGER NOT NULL,
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY (object_id, version)
        );

        CREATE TABLE notes (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          node_id TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_notes_ws ON notes(workspace_id, node_id);

        -- version 1 snapshot for rows that existed before this migration
        INSERT INTO context_object_versions (object_id, version, user_id, workspace_id, type, title, content, created_at)
          SELECT id, 1, user_id, workspace_id, type, title, content, created_at FROM context_objects;
      `);
    },
  },
  {
    version: 3,
    name: 'files: uploads, chunks, monthly processing usage',
    up(db) {
      db.exec(`
        CREATE TABLE files (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          node_id TEXT, name TEXT NOT NULL, mime TEXT NOT NULL, size_bytes INTEGER NOT NULL,
          status TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0, summary TEXT, error TEXT,
          raw_text TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_files_ws ON files(workspace_id, created_at);

        CREATE TABLE file_chunks (
          file_id TEXT NOT NULL, idx INTEGER NOT NULL,
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          text TEXT NOT NULL, tokens INTEGER NOT NULL,
          PRIMARY KEY (file_id, idx)
        );
        CREATE INDEX idx_chunks_ws ON file_chunks(workspace_id);

        CREATE TABLE file_usage (
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, period TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (workspace_id, period)
        );
      `);
    },
  },
  {
    version: 4,
    name: 'decision-layer judgments (gap ambiguity per object version) + daily usage counters (Context Coach)',
    up(db) {
      db.exec(`
        CREATE TABLE context_judgments (
          object_id TEXT NOT NULL, version INTEGER NOT NULL, kind TEXT NOT NULL,
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          ambiguous INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY (object_id, version, kind)
        );
        CREATE INDEX idx_judgments_ws ON context_judgments(workspace_id);

        CREATE TABLE daily_usage (
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (workspace_id, day, kind)
        );
      `);
    },
  },
  {
    version: 5,
    name: 'MCP: per-workspace tokens, Context packs (lineage of pasted answers), proposal source on objects',
    up(db) {
      db.exec(`
        ALTER TABLE context_objects ADD COLUMN source TEXT;

        CREATE TABLE mcp_tokens (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          label TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, last4 TEXT NOT NULL,
          created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT
        );
        CREATE INDEX idx_mcp_tokens_ws ON mcp_tokens(workspace_id);

        CREATE TABLE context_packs (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          title TEXT NOT NULL, spec_id TEXT, deliverable_id TEXT, refs TEXT NOT NULL, tokens INTEGER NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_packs_ws ON context_packs(workspace_id, created_at);
      `);
    },
  },
  {
    version: 6,
    name: 'explicit slot binding: context_objects.slot_key (which Gap item an object fills)',
    up(db) {
      db.exec(`
        ALTER TABLE context_objects ADD COLUMN slot_key TEXT;
        CREATE INDEX idx_objects_slot ON context_objects(workspace_id, slot_key);
      `);
    },
  },
  {
    version: 7,
    name: 'semantic contradictions: judgement per object-version pair + the user\'s resolution',
    up(db) {
      db.exec(`
        CREATE TABLE contradiction_judgments (
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          pair_key TEXT NOT NULL, a_id TEXT NOT NULL, a_version INTEGER NOT NULL, b_id TEXT NOT NULL, b_version INTEGER NOT NULL,
          conflict INTEGER NOT NULL, reason TEXT NOT NULL, resolution TEXT, created_at TEXT NOT NULL,
          PRIMARY KEY (workspace_id, pair_key)
        );
      `);
    },
  },
  {
    version: 8,
    name: 'Asset is no longer a context type: old Asset objects become Fact (provenance, version and history kept)',
    up(db) {
      // type change without a version bump: lineage (usedContext id+version) of existing assets stays valid
      db.exec(`
        UPDATE context_objects SET type = 'Fact' WHERE type = 'Asset';
        UPDATE context_object_versions SET type = 'Fact' WHERE type = 'Asset';
      `);
    },
  },
  {
    version: 9,
    name: 'context_changes: append-only change log (rebuilt from versions); replacement reasons leave the object text',
    up(db) {
      db.exec(`
        CREATE TABLE context_changes (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, object_id TEXT NOT NULL,
          from_version INTEGER NOT NULL, to_version INTEGER NOT NULL,
          kind TEXT NOT NULL, actor TEXT NOT NULL, actor_label TEXT, reason TEXT, before TEXT, after TEXT, at TEXT NOT NULL
        );
        CREATE INDEX idx_changes_ws ON context_changes(workspace_id, at);
        CREATE INDEX idx_changes_obj ON context_changes(workspace_id, object_id, at);
      `);
      // This migration is self-contained on purpose (a later edit of src/core must not change what an old database becomes).
      const TAIL = /\n*\[دلیل جایگزینی: ([\s\S]*)\]\s*$/;
      const reasons = new Map<string, string>(); // object id → reason glued to its text
      const objs = db.prepare("SELECT id, content FROM context_objects WHERE content LIKE '%[دلیل جایگزینی:%'").all() as Array<{ id: string; content: string }>;
      for (const o of objs) {
        const m = TAIL.exec(o.content);
        if (!m) continue;
        reasons.set(o.id, m[1].trim());
        db.prepare('UPDATE context_objects SET content = ? WHERE id = ?').run(o.content.slice(0, m.index), o.id);
      }
      const vers = db.prepare("SELECT object_id, version, content FROM context_object_versions WHERE content LIKE '%[دلیل جایگزینی:%'").all() as Array<{ object_id: string; version: number; content: string }>;
      for (const v of vers) {
        const m = TAIL.exec(v.content);
        if (!m) continue;
        if (!reasons.has(v.object_id)) reasons.set(v.object_id, m[1].trim());
        db.prepare('UPDATE context_object_versions SET content = ? WHERE object_id = ? AND version = ?').run(v.content.slice(0, m.index), v.object_id, v.version);
      }

      const ins = db.prepare('INSERT OR IGNORE INTO context_changes (id,user_id,workspace_id,object_id,from_version,to_version,kind,actor,actor_label,reason,before,after,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const LABEL = 'بازسازی از نسخه‌ها';
      const rows = db.prepare('SELECT object_id, version, user_id, workspace_id, type, title, content, created_at FROM context_object_versions ORDER BY object_id, version').all() as Array<Record<string, any>>;
      const prev = new Map<string, Record<string, any>>();
      const supersedeReasonFor = new Set<string>();
      for (const r of rows) {
        const p = prev.get(r.object_id);
        if (!p) {
          ins.run(`chg_bf_${r.object_id}_${r.version}`, r.user_id, r.workspace_id, r.object_id, 0, r.version, 'created', 'system', LABEL, null, null, JSON.stringify({ type: r.type, title: r.title }), r.created_at);
        } else {
          const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
          for (const f of ['type', 'title', 'content']) if (p[f] !== r[f]) { before[f] = p[f]; after[f] = r[f]; }
          ins.run(`chg_bf_${r.object_id}_${r.version}`, r.user_id, r.workspace_id, r.object_id, p.version, r.version, 'edited', 'system', LABEL, null, JSON.stringify(before), JSON.stringify(after), r.created_at);
        }
        prev.set(r.object_id, r);
      }
      // every «supersedes» edge → a `superseded` change on the replaced object; the reason that used to be glued to the new text goes here
      const rels = db.prepare("SELECT source_id, target_id, user_id, workspace_id, created_at FROM context_relationships WHERE type = 'supersedes'").all() as Array<Record<string, any>>;
      for (const r of rels) {
        const old = db.prepare('SELECT version FROM context_objects WHERE id = ?').get(r.target_id) as { version: number } | undefined;
        const neu = db.prepare('SELECT version FROM context_objects WHERE id = ?').get(r.source_id) as { version: number } | undefined;
        if (!old || !neu) continue;
        const reason = reasons.get(r.source_id) ?? null;
        if (reason) supersedeReasonFor.add(r.source_id);
        ins.run(`chg_bf_sup_${r.target_id}`, r.user_id, r.workspace_id, r.target_id, old.version, neu.version, 'superseded', 'system', LABEL, reason, null, JSON.stringify({ status: 'Superseded', supersededById: r.source_id }), r.created_at);
      }
      // a reason whose object superseded nothing stays with that object's own «created» record
      for (const [id, reason] of reasons) {
        if (supersedeReasonFor.has(id)) continue;
        db.prepare("UPDATE context_changes SET reason = ? WHERE kind = 'created' AND object_id = ?").run(reason, id);
      }
      const archived = db.prepare("SELECT id, user_id, workspace_id, version, updated_at FROM context_objects WHERE status = 'Archived'").all() as Array<Record<string, any>>;
      for (const a of archived) ins.run(`chg_bf_arch_${a.id}`, a.user_id, a.workspace_id, a.id, a.version, a.version, 'archived', 'system', LABEL, null, null, JSON.stringify({ status: 'Archived' }), a.updated_at);
    },
  },
  {
    version: 10,
    name: 'canvas_view_items: declared position on the boards (lane + rank for the decision board, x/y for free notes) — display only',
    up(db) {
      db.exec(`
        CREATE TABLE canvas_view_items (
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          view TEXT NOT NULL, item_ref TEXT NOT NULL,
          lane TEXT, rank REAL, x REAL, y REAL,
          PRIMARY KEY (workspace_id, view, item_ref)
        );
      `);
    },
  },
  {
    version: 11,
    name: 'context_objects.reach / valid_until: how far an object applies (global | position) and until when. NULL = the type default (Constraint: global) and no end — old data is untouched',
    up(db) {
      db.exec(`
        ALTER TABLE context_objects ADD COLUMN reach TEXT;
        ALTER TABLE context_objects ADD COLUMN valid_until TEXT;
      `);
    },
  },
  {
    version: 12,
    name: 'context_objects.assumption / review_by / decision_record: a Fact can be a working assumption with a review date; a Decision can carry its record (question, options weighed + why rejected, expectation, review date). NULL = none — old data is untouched',
    up(db) {
      db.exec(`
        ALTER TABLE context_objects ADD COLUMN assumption INTEGER;
        ALTER TABLE context_objects ADD COLUMN review_by TEXT;
        ALTER TABLE context_objects ADD COLUMN decision_record TEXT;
      `);
    },
  },
  {
    version: 13,
    name: 'facets + sample flag on objects; saved_packs (a named selection resolved through the effective context); templates (a user\'s own node / workstream, reusable). NULL / empty = none — old data is untouched',
    up(db) {
      db.exec(`
        ALTER TABLE context_objects ADD COLUMN facets TEXT;
        ALTER TABLE context_objects ADD COLUMN sample INTEGER;
        CREATE INDEX idx_objects_sample ON context_objects(workspace_id, sample);
        CREATE TABLE saved_packs (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          name TEXT NOT NULL, selection TEXT NOT NULL, instruction TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_saved_packs_ws ON saved_packs(workspace_id, updated_at);
        CREATE TABLE templates (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, /* the workspace it was saved from: a template belongs to the USER and can be applied anywhere */
          kind TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_templates_user ON templates(user_id, created_at);
      `);
    },
  },
  {
    version: 14,
    name: 'metrics + measurements (real results, not Context objects): a Metric (name, unit, direction, target), a Measurement (value, date, note, source, status Confirmed / Proposed, optional decision). A decision\'s metric expectation lives in its record JSON. Every change writes a Change with object_id metric:<id>',
    up(db) {
      db.exec(`
        CREATE TABLE metrics (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', direction TEXT NOT NULL, target REAL, archived INTEGER,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_metrics_ws ON metrics(workspace_id, created_at);
        CREATE TABLE measurements (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, metric_id TEXT NOT NULL,
          value REAL NOT NULL, at TEXT NOT NULL, note TEXT, source TEXT NOT NULL, status TEXT NOT NULL, decision_id TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_measurements_metric ON measurements(workspace_id, metric_id, at);
      `);
    },
  },
  {
    version: 15,
    name: 'saved_packs: kind + template — a saved «درخواست برای AI» (the kind of work and the user\'s one line) lives in the same table as the packs. NULL = a plain pack',
    up(db) {
      db.exec(`
        ALTER TABLE saved_packs ADD COLUMN kind TEXT;
        ALTER TABLE saved_packs ADD COLUMN template TEXT;
      `);
    },
  },
  {
    version: 16,
    name: 'usage_events: a counter per feature KEY (catalog in src/core/usage.ts), this install only — no text, title or id is ever stored',
    up(db) {
      db.exec(`
        CREATE TABLE usage_events (
          user_id TEXT NOT NULL, feature TEXT NOT NULL, count INTEGER NOT NULL, last_at TEXT NOT NULL,
          PRIMARY KEY (user_id, feature)
        );
      `);
    },
  },
  {
    version: 17,
    name: 'context_objects.examples: up to three right / wrong examples of a red line (a JSON array of {kind, text}). NULL = none — old data is untouched',
    up(db) {
      db.exec('ALTER TABLE context_objects ADD COLUMN examples TEXT;');
    },
  },
  {
    version: 18,
    name: 'tree_nodes.is_system is retired: no node is locked any more (the five default nodes are an ordinary starting point). The column stays, always 0 — nothing is deleted',
    up(db) {
      db.exec('UPDATE tree_nodes SET is_system = 0;');
    },
  },
  {
    version: 19,
    name: 'context_objects.draft: an edit of confirmed knowledge waits ON the object as a draft (JSON {title, content, examples, at, reason}); the columns above stay the approved truth. NULL = no draft — old data is untouched',
    up(db) {
      db.exec('ALTER TABLE context_objects ADD COLUMN draft TEXT;');
    },
  },
  {
    version: 20,
    name: 'removal_batches: a node removal that can be undone (the rows and the moves it made, as JSON) — «حذف‌های اخیر» and the «برگرداندن» toast read it; kept until it is undone or purged',
    up(db) {
      db.exec(`
        CREATE TABLE removal_batches (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          kind TEXT NOT NULL, label TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, undone_at TEXT
        );
        CREATE INDEX idx_removals_ws ON removal_batches(workspace_id, created_at);
      `);
    },
  },
  {
    version: 21,
    name: 'persisted Thoughts: stable identity, semantic revisions, explicit derivation, and legacy note-line backfill',
    up(db) {
      db.exec(`
        CREATE TABLE thoughts (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          node_id TEXT NOT NULL, kind TEXT, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
          source_note_id TEXT, source_line INTEGER, source_line_key TEXT, source_quote TEXT,
          inferred INTEGER NOT NULL DEFAULT 0, resolved_object_id TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          CHECK (status IN ('open', 'resolved'))
        );
        CREATE INDEX idx_thoughts_ws ON thoughts(workspace_id, user_id, status, node_id);
        CREATE INDEX idx_thoughts_note ON thoughts(workspace_id, user_id, source_note_id);

        CREATE TABLE thought_revisions (
          thought_id TEXT NOT NULL, revision INTEGER NOT NULL,
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
          before_text TEXT NOT NULL, after_text TEXT NOT NULL, at TEXT NOT NULL,
          PRIMARY KEY (thought_id, revision)
        );
        CREATE INDEX idx_thought_revisions_ws ON thought_revisions(workspace_id, user_id, thought_id, revision);

        CREATE TABLE thought_derivations (
          parent_id TEXT NOT NULL, child_id TEXT NOT NULL,
          user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY (parent_id, child_id),
          CHECK (parent_id <> child_id)
        );
        CREATE INDEX idx_thought_derivations_child ON thought_derivations(workspace_id, user_id, child_id);
      `);

      type LegacyNote = { id: string; user_id: string; workspace_id: string; node_id: string; content: string; created_at: string; updated_at: string };
      type LegacySource = { kind?: string; noteId?: string; thoughtId?: string; lineKey?: string; quote?: string };
      type LegacyObject = { id: string; status: string; source: string | null };
      const notes = db.prepare('SELECT id,user_id,workspace_id,node_id,content,created_at,updated_at FROM notes ORDER BY workspace_id,user_id,id').all() as LegacyNote[];
      const objects = db.prepare("SELECT id,status,source FROM context_objects WHERE source IS NOT NULL AND status <> 'Archived'").all() as LegacyObject[];
      const refs = objects.flatMap((o) => {
        const source = JSON.parse(o.source!) as LegacySource;
        return source.kind === 'note' && source.noteId ? [{ objectId: o.id, status: o.status, ...source }] : [];
      });
      const insert = db.prepare(`INSERT OR IGNORE INTO thoughts
        (id,user_id,workspace_id,node_id,kind,text,status,source_note_id,source_line,source_line_key,source_quote,inferred,resolved_object_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const note of notes) {
        const parsed = parseLegacyThinking(note.content);
        const used = new Set<number>();
        let ordinal = 0;
        for (const item of parsed) {
          const candidates = refs.filter((r) => r.noteId === note.id && !used.has(refs.indexOf(r)));
          const exact = candidates.find((r) => r.lineKey === item.hash && (!r.quote || legacyLineHash(r.quote) === item.hash));
          const byText = candidates.find((r) => !!r.quote && legacyNormalizeFa(r.quote) === legacyNormalizeFa(item.text));
          const soft = candidates
            .map((r) => ({ r, score: r.quote ? legacySimilarity(r.quote, item.text) : 0 }))
            .filter((x) => x.score >= 0.6)
            .sort((a, b) => b.score - a.score)[0]?.r;
          const source = exact ?? byText ?? soft;
          let resolvedObjectId: string | null = null;
          if (source) {
            const refIndex = refs.indexOf(source);
            used.add(refIndex);
            resolvedObjectId = source.objectId;
          }
          const id = `legacy_thought_${note.id}_${ordinal++}`;
          insert.run(id, note.user_id, note.workspace_id, note.node_id, item.kind, item.text, resolvedObjectId ? 'resolved' : 'open',
            note.id, item.line, item.hash, item.text, item.inferred ? 1 : 0, resolvedObjectId, note.created_at, note.updated_at);
        }

        // The legacy "made a section" action stripped the marker and wrote this receipt in-place.
        // It preserved the text and resolved state, but not the original kind; keep that kind unknown.
        const lines = note.content.split(/\r?\n/);
        for (let line = 0; line < lines.length; line++) {
          const receipt = /^(.*?)\s+✓\s+\(بخش «[^»\n]+» از همین ساخته شد\)\s*$/.exec(lines[line]);
          if (!receipt || !receipt[1].trim()) continue;
          const text = receipt[1].trim();
          const inferred = /[؟?]$/.test(text);
          insert.run(`legacy_thought_${note.id}_receipt_${line}`, note.user_id, note.workspace_id, note.node_id,
            inferred ? 'question' : null, text, 'resolved', note.id, line, legacyLineHash(text), text,
            inferred ? 1 : 0, null, note.created_at, note.updated_at);
        }
      }
    },
  },
  {
    version: 22,
    name: 'revoke legacy MCP tokens while retaining their historical records',
    up(db) {
      db.prepare('UPDATE mcp_tokens SET revoked_at = ? WHERE revoked_at IS NULL').run(new Date().toISOString());
    },
  },
  {
    version: 23,
    name: 'thought_about durable relations and thought_events history',
    up(db) {
      db.exec(`
        CREATE TABLE thought_about (
          thought_id TEXT NOT NULL,
          target_kind TEXT NOT NULL,
          target_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (thought_id, target_kind, target_id)
        );
        CREATE INDEX idx_thought_about_target ON thought_about(workspace_id, user_id, target_kind, target_id);
        CREATE INDEX idx_thought_about_thought ON thought_about(workspace_id, user_id, thought_id);

        CREATE TABLE thought_events (
          id TEXT PRIMARY KEY,
          thought_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          event_kind TEXT NOT NULL,
          before_value TEXT,
          after_value TEXT,
          actor TEXT NOT NULL DEFAULT 'user',
          at TEXT NOT NULL
        );
        CREATE INDEX idx_thought_events ON thought_events(workspace_id, user_id, thought_id, at);
      `);

      const thoughts = db.prepare('SELECT id, user_id, workspace_id, text, created_at FROM thoughts').all() as Array<{ id: string; user_id: string; workspace_id: string; text: string; created_at: string }>;
      const objects = db.prepare("SELECT id, workspace_id, title FROM context_objects WHERE status <> 'Archived' AND status <> 'Superseded'").all() as Array<{ id: string; workspace_id: string; title: string }>;
      const nodes = db.prepare('SELECT id, workspace_id, label FROM tree_nodes').all() as Array<{ id: string; workspace_id: string; label: string }>;

      const TOKEN = /@«([^»\n]+)»/g;
      const insertAbout = db.prepare('INSERT OR IGNORE INTO thought_about (thought_id, target_kind, target_id, user_id, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');

      for (const t of thoughts) {
        if (!t.text.includes('@«')) continue;
        const matches = [...t.text.matchAll(TOKEN)];
        for (const m of matches) {
          const k = legacyNormalizeFa(m[1]);
          const wsObjs = objects.filter((o) => o.workspace_id === t.workspace_id && legacyNormalizeFa(o.title) === k);
          if (wsObjs.length === 1) {
            insertAbout.run(t.id, 'object', wsObjs[0].id, t.user_id, t.workspace_id, t.created_at);
            continue;
          }
          if (wsObjs.length > 1) continue; // ambiguous title: never guess
          const wsNodes = nodes.filter((n) => n.workspace_id === t.workspace_id && legacyNormalizeFa(n.label) === k);
          if (wsNodes.length === 1) {
            insertAbout.run(t.id, 'node', wsNodes[0].id, t.user_id, t.workspace_id, t.created_at);
          }
        }
      }

      const notesWithReceipts = db.prepare("SELECT id, user_id, workspace_id, node_id, content, created_at, updated_at FROM notes WHERE content LIKE '%(بخش «% از همین ساخته شد)%'").all() as Array<{ id: string; user_id: string; workspace_id: string; node_id: string; content: string; created_at: string; updated_at: string }>;
      const insReceipt = db.prepare(`INSERT OR IGNORE INTO thoughts
        (id,user_id,workspace_id,node_id,kind,text,status,source_note_id,source_line,source_line_key,source_quote,inferred,resolved_object_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const n of notesWithReceipts) {
        const lines = n.content.split(/\r?\n/);
        for (let l = 0; l < lines.length; l++) {
          const m = /^(.*?)\s+✓\s+\(بخش «[^»\n]+» از همین ساخته شد\)\s*$/.exec(lines[l]);
          if (!m || !m[1].trim()) continue;
          const text = m[1].trim();
          const inferred = /[؟?]$/.test(text);
          const thId = `legacy_thought_${n.id}_receipt_${l}`;
          insReceipt.run(thId, n.user_id, n.workspace_id, n.node_id, inferred ? 'question' : null, text, 'resolved', n.id, l, legacyLineHash(text), text, inferred ? 1 : 0, null, n.created_at, n.updated_at);
        }
      }
    },
  },
  {
    version: 24,
    name: 'thoughts keep a visible origin state (line/note gone) and a «converted knowledge was erased» mark',
    up(db) {
      // null = the origin is fine; 'line_deleted' = the line was removed from its note; 'note_deleted' = the note itself is gone.
      // The thought is the user's: it stays open and says where it came from instead of being closed or erased in silence.
      db.exec('ALTER TABLE thoughts ADD COLUMN source_state TEXT');
      // 1 = the knowledge this thought became was permanently deleted; resolved_object_id is cleared (not even an id stays)
      db.exec('ALTER TABLE thoughts ADD COLUMN resolved_removed INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: 25,
    name: 'intelligence layer: derived embeddings (by item + text hash), suggestions and the user reaction to them',
    up(db) {
      // The intelligence layer is a side axis: it only READS knowledge / thoughts / notes and writes ONLY these three tables.
      // Nothing here is truth, a relation or structure. Without a key the tables stay empty and the product works as before.
      db.exec(`
        CREATE TABLE intelligence_embeddings (
          workspace_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          item_kind TEXT NOT NULL,       -- 'object' | 'thought' | 'note' | 'file'
          item_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          text_hash TEXT NOT NULL,       -- hash of the text + chunker version + model id: a changed text is never served an old vector
          model_key TEXT NOT NULL,
          dims INTEGER NOT NULL,
          vector BLOB NOT NULL,          -- float32[]; a derived value, never shown
          created_at TEXT NOT NULL,
          PRIMARY KEY (workspace_id, user_id, item_kind, item_id, chunk_index, text_hash, model_key)
        );
        CREATE INDEX idx_intel_emb_item ON intelligence_embeddings(workspace_id, user_id, item_kind, item_id);

        -- «a suggestion»: what the layer proposed. It holds ids, labels and scores — never the user's text.
        CREATE TABLE intelligence_suggestions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          recipe TEXT NOT NULL,
          recipe_version INTEGER NOT NULL,
          kind TEXT NOT NULL,            -- related | thought_kind | knowledge_type | certainty | placement | duplicate | contradiction
          subject_kind TEXT NOT NULL,    -- thought | object | note | file | text
          subject_id TEXT,
          subject_hash TEXT,             -- hash of the subject text when it was suggested (to know it is out of date)
          suggestion TEXT NOT NULL,      -- JSON: the proposed value(s) — ids / labels / scores
          specialists TEXT NOT NULL,     -- JSON: which models and rules produced it (model keys + versions)
          confidence REAL,
          tier TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_intel_sug_ws ON intelligence_suggestions(workspace_id, user_id, kind, created_at);
        CREATE INDEX idx_intel_sug_subject ON intelligence_suggestions(workspace_id, user_id, subject_kind, subject_id);

        -- «the user's reaction»: accepted / rejected / changed (+ what she chose instead). Append-only; the user is always the final judge.
        CREATE TABLE intelligence_reactions (
          id TEXT PRIMARY KEY,
          suggestion_id TEXT NOT NULL REFERENCES intelligence_suggestions(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          reaction TEXT NOT NULL CHECK (reaction IN ('accepted', 'rejected', 'changed')),
          final_value TEXT,              -- JSON: what the user ended up with (ids / labels), only for 'changed'
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_intel_react_sug ON intelligence_reactions(suggestion_id);
        CREATE INDEX idx_intel_react_ws ON intelligence_reactions(workspace_id, user_id, created_at);
      `);
      // Derived data goes with its root on EVERY delete path (permanent delete, workspace delete, erase): a trigger, not a call site to remember.
      for (const [table, kind] of [['context_objects', 'object'], ['thoughts', 'thought'], ['notes', 'note'], ['files', 'file']] as const) {
        db.exec(`
          CREATE TRIGGER trg_intel_${kind}_gone AFTER DELETE ON ${table}
          BEGIN
            DELETE FROM intelligence_embeddings WHERE workspace_id = OLD.workspace_id AND item_kind = '${kind}' AND item_id = OLD.id;
            DELETE FROM intelligence_suggestions WHERE workspace_id = OLD.workspace_id AND subject_kind = '${kind}' AND subject_id = OLD.id;
          END;
        `);
      }
    },
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Applies pending migrations inside one transaction each. Returns the versions applied. */
export function migrate(db: Database.Database, target = LATEST_VERSION): number[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const done = new Set((db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (m.version > target || done.has(m.version)) continue;
    db.transaction(() => {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, new Date().toISOString());
    })();
    applied.push(m.version);
  }
  return applied;
}

export const currentVersion = (db: Database.Database): number => {
  try { return (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }).v ?? 0; } catch { return 0; }
};
