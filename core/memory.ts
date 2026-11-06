import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

export type MemoryKind = "decision" | "correction" | "open_problem";

export interface CompactionSummary {
  decisions?: string[];
  corrections?: string[];
  /** Full current snapshot; an empty array clears the previous open problems. */
  openProblems: string[];
}

export interface MemoryNote {
  kind: MemoryKind;
  content: string;
  updatedAt: string;
  occurrences: number;
}

export type GuardDefinition =
  | { kind: "no_commit" }
  | { kind: "no_push" }
  | { kind: "deny_command"; command: string }
  | { kind: "protected_paths"; paths: string[] }
  | { kind: "required_mcp"; server: string };

export interface ActiveGuard {
  id: number;
  rule: string;
  definition: GuardDefinition;
}

const MEMORY_DIRECTORY = ".ai-persona";
const MEMORY_FILE = "memory.sqlite";
const MAX_NOTE_CHARS = 240;
const MAX_NOTES_PER_KIND_PER_COMPACTION = 10;

function memoryPath(projectRoot: string): string {
  return resolve(projectRoot, MEMORY_DIRECTORY, MEMORY_FILE);
}

function cleanNote(note: string): string {
  const clean = note.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const characters = Array.from(clean);
  return characters.length > MAX_NOTE_CHARS
    ? `${characters.slice(0, MAX_NOTE_CHARS - 1).join("")}…`
    : clean;
}

export function withProjectDatabase<T>(projectRoot: string, action: (database: Database.Database) => T): T {
  const directory = resolve(projectRoot, MEMORY_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const database = new Database(memoryPath(projectRoot));
  try {
    database.pragma("journal_mode = WAL");
    database.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('decision', 'correction', 'open_problem')),
        content TEXT NOT NULL,
        occurrences INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (kind, content)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS memories_recent
        ON memories (kind, updated_at DESC);

      CREATE TABLE IF NOT EXISTS suggestions (
        id INTEGER PRIMARY KEY,
        change_text TEXT NOT NULL,
        reason TEXT,
        action_json TEXT,
        source_key TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS guard_proposals (
        id INTEGER PRIMARY KEY,
        rule_text TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'active', 'rejected')),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS guards (
        id INTEGER PRIMARY KEY,
        rule_text TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (definition_json)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS learning_signals (
        kind TEXT NOT NULL CHECK (kind IN ('interruption', 'permission')),
        signal_key TEXT NOT NULL,
        total_count INTEGER NOT NULL DEFAULT 0,
        approved_count INTEGER NOT NULL DEFAULT 0,
        rejected_count INTEGER NOT NULL DEFAULT 0,
        always_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (kind, signal_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS pending_permissions (
        request_id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        resources_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS learning_confirmations (
        suggestion_id INTEGER PRIMARY KEY,
        accepted INTEGER NOT NULL CHECK (accepted IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (suggestion_id) REFERENCES suggestions(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS seen_learning_events (
        event_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS learned_preferences (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('habit', 'dial_override')),
        preference_key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS applied_changes (
        id INTEGER PRIMARY KEY,
        suggestion_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        undone_at TEXT,
        FOREIGN KEY (suggestion_id) REFERENCES suggestions(id)
      ) STRICT;
    `);
    const suggestionColumns = database.pragma("table_info(suggestions)") as Array<{ name: string }>;
    const migrations: Array<[string, string, Array<{ name: string }>]> = [
      ["reason", "TEXT", suggestionColumns],
      ["action_json", "TEXT", suggestionColumns],
      ["source_key", "TEXT", suggestionColumns],
      ["always_count", "INTEGER NOT NULL DEFAULT 0", database.pragma("table_info(learning_signals)") as Array<{ name: string }>],
    ];
    for (const [name, definition, columns] of migrations) {
      if (!columns.some((column) => column.name === name)) {
        const table = name === "always_count" ? "learning_signals" : "suggestions";
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
    database.exec("CREATE UNIQUE INDEX IF NOT EXISTS suggestions_source_key ON suggestions(source_key) WHERE source_key IS NOT NULL");
    return action(database);
  } finally {
    database.close();
  }
}

function upsertMemory(
  database: Database.Database,
  kind: MemoryKind,
  rawContent: string,
  now: string,
): boolean {
  const content = cleanNote(rawContent);
  if (!content) return false;

  database.prepare(`
    INSERT INTO memories (kind, content, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(kind, content) DO UPDATE SET
      occurrences = memories.occurrences + 1,
      updated_at = excluded.updated_at
  `).run(kind, content, now, now);
  return true;
}

/** Store only concise structured notes from a compaction; transcript fields are never read. */
export function recordCompactionSummary(projectRoot: string, summary: CompactionSummary): number {
  if (!summary || !Array.isArray(summary.openProblems)) {
    throw new Error("Compaction summaries must include the full openProblems snapshot, even when empty.");
  }
  return withProjectDatabase(projectRoot, (database) => {
    const insertBatch = database.transaction(() => {
      const now = new Date().toISOString();
      let saved = 0;
      // Open problems describe current project state, so replace that snapshot.
      database.prepare("DELETE FROM memories WHERE kind = 'open_problem'").run();
      const groups: Array<[MemoryKind, string[] | undefined]> = [
        ["decision", summary.decisions],
        ["correction", summary.corrections],
        ["open_problem", summary.openProblems],
      ];
      for (const [kind, notes] of groups) {
        for (const note of (Array.isArray(notes) ? notes : []).slice(0, MAX_NOTES_PER_KIND_PER_COMPACTION)) {
          if (typeof note === "string" && upsertMemory(database, kind, note, now)) saved++;
        }
      }
      return saved;
    });
    return insertBatch();
  });
}

export function recordCorrection(projectRoot: string, note: string): void {
  withProjectDatabase(projectRoot, (database) => {
    upsertMemory(database, "correction", note, new Date().toISOString());
  });
}

/** Save a suggestion for later review; it never edits the project profile. */
export function proposeUpdate(projectRoot: string, change: string): number {
  return withProjectDatabase(projectRoot, (database) => {
    const text = cleanNote(change);
    if (!text) throw new Error("A proposed change cannot be empty.");
    const result = database.prepare(
      "INSERT INTO suggestions (change_text, reason, action_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(text, "Manually proposed for developer review.", JSON.stringify({ type: "habit", text }), new Date().toISOString());
    return Number(result.lastInsertRowid);
  });
}

export function getRecentMemories(projectRoot: string, limit = 3): MemoryNote[] {
  const safeLimit = Math.max(0, Math.min(3, Math.floor(limit)));
  return withProjectDatabase(projectRoot, (database) => database.prepare(`
    SELECT kind, content, updated_at AS updatedAt, occurrences
    FROM memories
    ORDER BY CASE kind WHEN 'open_problem' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT ?
  `).all(safeLimit) as MemoryNote[]);
}

export function saveGuardProposal(
  projectRoot: string,
  rule: string,
  definition: GuardDefinition,
): number {
  return withProjectDatabase(projectRoot, (database) => {
    const result = database.prepare(`
      INSERT INTO guard_proposals (rule_text, definition_json, created_at)
      VALUES (?, ?, ?)
    `).run(cleanNote(rule), JSON.stringify(definition), new Date().toISOString());
    return Number(result.lastInsertRowid);
  });
}

export function confirmGuardProposal(projectRoot: string, proposalId: number, accepted: boolean): boolean {
  return withProjectDatabase(projectRoot, (database) => {
    const finish = database.transaction(() => {
      const proposal = database.prepare(`
        SELECT id, rule_text AS rule, definition_json AS definitionJson
        FROM guard_proposals
        WHERE id = ? AND status = 'pending'
      `).get(proposalId) as { id: number; rule: string; definitionJson: string } | undefined;
      if (!proposal) return false;

      if (accepted) {
        database.prepare(`
          INSERT OR IGNORE INTO guards (rule_text, definition_json, created_at)
          VALUES (?, ?, ?)
        `).run(proposal.rule, proposal.definitionJson, new Date().toISOString());
      }
      database.prepare("UPDATE guard_proposals SET status = ? WHERE id = ?")
        .run(accepted ? "active" : "rejected", proposalId);
      return true;
    });
    return finish();
  });
}

export function getActiveGuards(projectRoot: string): ActiveGuard[] {
  const file = memoryPath(projectRoot);
  if (!existsSync(file)) return [];
  const database = new Database(file, { readonly: true });
  try {
    const table = database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'guards'",
    ).get();
    if (!table) return [];
    const rows = database.prepare(`
      SELECT id, rule_text AS rule, definition_json AS definitionJson
      FROM guards
      ORDER BY id ASC
    `).all() as Array<{ id: number; rule: string; definitionJson: string }>;
    return rows.map((row) => ({
      id: row.id,
      rule: row.rule,
      definition: JSON.parse(row.definitionJson) as GuardDefinition,
    }));
  } finally {
    database.close();
  }
}
