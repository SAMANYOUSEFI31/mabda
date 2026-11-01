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
