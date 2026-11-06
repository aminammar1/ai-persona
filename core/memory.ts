import { mkdirSync } from "node:fs";
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

function withDatabase<T>(projectRoot: string, action: (database: Database.Database) => T): T {
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
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TEXT NOT NULL
      ) STRICT;
    `);
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
  return withDatabase(projectRoot, (database) => {
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
  withDatabase(projectRoot, (database) => {
    upsertMemory(database, "correction", note, new Date().toISOString());
  });
}

/** Save a suggestion for later review; it never edits the project profile. */
export function proposeUpdate(projectRoot: string, change: string): number {
  return withDatabase(projectRoot, (database) => {
    const text = cleanNote(change);
    if (!text) throw new Error("A proposed change cannot be empty.");
    const result = database.prepare(
      "INSERT INTO suggestions (change_text, created_at) VALUES (?, ?)",
    ).run(text, new Date().toISOString());
    return Number(result.lastInsertRowid);
  });
}

export function getRecentMemories(projectRoot: string, limit = 3): MemoryNote[] {
  const safeLimit = Math.max(0, Math.min(3, Math.floor(limit)));
  return withDatabase(projectRoot, (database) => database.prepare(`
    SELECT kind, content, updated_at AS updatedAt, occurrences
    FROM memories
    ORDER BY CASE kind WHEN 'open_problem' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT ?
  `).all(safeLimit) as MemoryNote[]);
}
