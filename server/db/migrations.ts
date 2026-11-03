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
