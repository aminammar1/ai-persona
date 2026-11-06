import { realpathSync, statSync } from "node:fs";
import { resolve, isAbsolute, sep } from "node:path";
import type Database from "better-sqlite3";
import { withProjectDatabase } from "./memory.ts";
import type { PersonaState } from "./types.ts";

export type LearnedAction =
  | { type: "habit"; text: string }
  | { type: "dial_override"; state: "debug"; dial: "verbosity"; value: "low" }
  | { type: "deny_command"; command: string }
  | { type: "permission_preference"; action: string; resource: string };

export interface LearningSuggestion {
  id: number;
  change: string;
  reason: string;
  createdAt: string;
}

export interface AppliedChange {
  id: number;
  suggestionId: number;
  action: string;
  details: string;
  createdAt: string;
  undoneAt: string | null;
}

export interface SuggestionReviewResult {
  changed: boolean;
  changeId?: number;
  confirmationRequired?: boolean;
}

function clean(value: string, limit = 240): string {
  const characters = [...value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()];
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

function createSuggestion(
  database: Database.Database,
  sourceKey: string,
  change: string,
  reason: string,
  action: LearnedAction,
): void {
  database.prepare(`
    INSERT OR IGNORE INTO suggestions (change_text, reason, action_json, source_key, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(clean(change), clean(reason), JSON.stringify(action), sourceKey, new Date().toISOString());
}

function correctionAction(note: string): { change: string; action: LearnedAction } {
  const shorter = /\b(?:shorter|more concise|less detail|stop explaining|be brief)\b/i.test(note);
  if (shorter) {
    return {
      change: "Make debug state shorter.",
      action: { type: "dial_override", state: "debug", dial: "verbosity", value: "low" },
    };
  }
  const run = note.match(/^(?:please\s+)?(?:don['’]t|do not|never|stop)\s+(?:run|execute)\s+(.+)$/i);
  const command = run?.[1]?.replace(/^['"`]|['"`]$/g, "").replace(/[.!?]+$/, "").trim();
  if (command && command.length <= 100 && /^[\w./:@+-]+(?:\s+[\w./:@+-]+)*$/.test(command)) {
    return { change: `Add rule: never run ${command}.`, action: { type: "deny_command", command } };
  }
  const text = clean(note, 180);
  return { change: `Remember this preference: ${text}`, action: { type: "habit", text } };
}

function suggestRepeatedCorrection(database: Database.Database, note: string, count: number): number | null {
  if (count < 2) return null;
  const { change, action } = correctionAction(note);
  const sourceKey = `correction:${note.toLocaleLowerCase()}`;
  createSuggestion(database, sourceKey, change, `This correction was recorded ${count} times.`, action);
  const row = database.prepare("SELECT id FROM suggestions WHERE source_key = ? AND status = 'pending'").get(sourceKey) as { id: number } | undefined;
  return row?.id ?? null;
}

/** Create one reviewable suggestion only after an identical correction repeats. */
export function considerCorrection(projectRoot: string, correction: string): number | null {
  const note = clean(correction);
  if (!note) return null;
  return withProjectDatabase(projectRoot, (database) => {
    const memory = database.prepare(`
      SELECT occurrences FROM memories WHERE kind = 'correction' AND content = ?
    `).get(note) as { occurrences: number } | undefined;
    return memory ? suggestRepeatedCorrection(database, note, memory.occurrences) : null;
  });
}

/** Count only developer interruptions; repeated interruptions suggest a shorter debug style. */
export function recordInterruption(projectRoot: string, reason: string, eventId?: string): number | null {
  if (reason !== "user") return null;
  return withProjectDatabase(projectRoot, (database) => {
    const now = new Date().toISOString();
    if (eventId) {
      const inserted = database.prepare(`
        INSERT OR IGNORE INTO seen_learning_events (event_id, kind, created_at) VALUES (?, 'interruption', ?)
      `).run(eventId, now);
      if (inserted.changes === 0) return null;
    }
    database.prepare(`
      INSERT INTO learning_signals (kind, signal_key, total_count, created_at, updated_at)
      VALUES ('interruption', 'user', 1, ?, ?)
      ON CONFLICT(kind, signal_key) DO UPDATE SET
        total_count = learning_signals.total_count + 1,
        updated_at = excluded.updated_at
    `).run(now, now);
    const signal = database.prepare(`
      SELECT total_count AS count FROM learning_signals WHERE kind = 'interruption' AND signal_key = 'user'
    `).get() as { count: number };
    if (signal.count < 2) return null;
    const sourceKey = "interruption:user:debug-shorter";
    createSuggestion(
      database,
      sourceKey,
      "Make debug state shorter.",
      `The agent was interrupted ${signal.count} times by the developer.`,
      { type: "dial_override", state: "debug", dial: "verbosity", value: "low" },
    );
    const row = database.prepare("SELECT id FROM suggestions WHERE source_key = ?").get(sourceKey) as { id: number } | undefined;
    return row?.id ?? null;
  });
}

export function recordPermissionAsked(
  projectRoot: string,
  requestId: string,
  action: string,
  resources: string[],
): void {
  withProjectDatabase(projectRoot, (database) => {
    database.prepare(`
      INSERT OR REPLACE INTO pending_permissions (request_id, action, resources_json, created_at)
      VALUES (?, ?, ?, ?)
    `).run(requestId, clean(action, 100), JSON.stringify(resources.map((resource) => clean(resource, 200))), new Date().toISOString());
  });
}

function narrowPermission(projectRoot: string, action: string, resources: string[]): string | null {
  const cleanAction = clean(action, 100);
  if (!cleanAction || /[*?\[\]]/.test(cleanAction) || resources.length !== 1) return null;
  const resource = clean(resources[0], 200);
  if (!resource || /[*?\[\]]/.test(resource)) return null;
  if (/^(?:bash|shell|execute|run|command)$/i.test(cleanAction)) {
    return resource.split(/\s+/).length >= 2 && /^[\w./:@+-]+(?:\s+[\w./:@+-]+)*$/.test(resource)
      ? resource
      : null;
  }
  const root = resolve(projectRoot);
  const target = isAbsolute(resource) ? resolve(resource) : resolve(root, resource);
  if (target === root || !target.startsWith(`${root}${sep}`)) return null;
  try {
    const realRoot = realpathSync(root);
    const realTarget = realpathSync(target);
    if (!realTarget.startsWith(`${realRoot}${sep}`) || !statSync(realTarget).isFile()) return null;
  } catch {
    return null;
  }
  return resource;
}

/** Pair an approval with its request; suggest only after two exact one-time approvals and no rejection. */
export function recordPermissionReply(projectRoot: string, requestId: string, reply: "once" | "always" | "reject"): number | null {
  return withProjectDatabase(projectRoot, (database) => {
    const pending = database.prepare(`
      SELECT action, resources_json AS resourcesJson FROM pending_permissions WHERE request_id = ?
    `).get(requestId) as { action: string; resourcesJson: string } | undefined;
    if (!pending) return null;
    database.prepare("DELETE FROM pending_permissions WHERE request_id = ?").run(requestId);
    const resources = JSON.parse(pending.resourcesJson) as string[];
    const resource = narrowPermission(projectRoot, pending.action, resources);
    const key = JSON.stringify({ action: pending.action, resource: resources[0] });
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO learning_signals (kind, signal_key, total_count, approved_count, rejected_count, always_count, created_at, updated_at)
      VALUES ('permission', ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, signal_key) DO UPDATE SET
        total_count = learning_signals.total_count + 1,
        approved_count = learning_signals.approved_count + excluded.approved_count,
        rejected_count = learning_signals.rejected_count + excluded.rejected_count,
        always_count = learning_signals.always_count + excluded.always_count,
        updated_at = excluded.updated_at
    `).run(key, reply === "once" || reply === "always" ? 1 : 0, reply === "reject" ? 1 : 0, reply === "always" ? 1 : 0, now, now);
    const signal = database.prepare(`
      SELECT total_count AS totalCount, approved_count AS approvedCount, rejected_count AS rejectedCount, always_count AS alwaysCount
      FROM learning_signals WHERE kind = 'permission' AND signal_key = ?
    `).get(key) as { totalCount: number; approvedCount: number; rejectedCount: number; alwaysCount: number };
    const sourceKey = `permission:${key}`;
    if (signal.rejectedCount > 0 || signal.alwaysCount > 0) {
      database.prepare("UPDATE suggestions SET status = 'rejected' WHERE source_key = ? AND status = 'pending'").run(sourceKey);
      return null;
    }
    if (!resource || signal.totalCount < 2 || signal.approvedCount !== signal.totalCount) return null;
    const payload = { type: "permission_preference", action: pending.action, resource } satisfies LearnedAction;
    createSuggestion(
      database,
      sourceKey,
      `Allow ${pending.action} on ${resource} in this project.`,
      `This exact permission was approved ${signal.approvedCount} times and never rejected.`,
      payload,
    );
    const row = database.prepare("SELECT id FROM suggestions WHERE source_key = ?").get(sourceKey) as { id: number } | undefined;
    return row?.id ?? null;
  });
}

export function listLearningSuggestions(projectRoot: string, limit = 3): LearningSuggestion[] {
  const safeLimit = Math.max(0, Math.min(3, Math.floor(limit)));
  return withProjectDatabase(projectRoot, (database) => {
    const corrections = database.prepare(`
      SELECT content, occurrences FROM memories WHERE kind = 'correction' AND occurrences >= 2
    `).all() as Array<{ content: string; occurrences: number }>;
    for (const correction of corrections) {
      suggestRepeatedCorrection(database, correction.content, correction.occurrences);
    }

    const interruption = database.prepare(`
      SELECT total_count AS count FROM learning_signals WHERE kind = 'interruption' AND signal_key = 'user'
    `).get() as { count: number } | undefined;
    if (interruption && interruption.count >= 2) {
      createSuggestion(
        database,
        "interruption:user:debug-shorter",
        "Make debug state shorter.",
        `The agent was interrupted ${interruption.count} times by the developer.`,
        { type: "dial_override", state: "debug", dial: "verbosity", value: "low" },
      );
    }

    const approvedPermissions = database.prepare(`
      SELECT signal_key AS signalKey, total_count AS totalCount, approved_count AS approvedCount
      FROM learning_signals WHERE kind = 'permission'
        AND total_count >= 2 AND total_count = approved_count AND rejected_count = 0 AND always_count = 0
    `).all() as Array<{ signalKey: string; totalCount: number; approvedCount: number }>;
    for (const signal of approvedPermissions) {
      const pair = JSON.parse(signal.signalKey) as { action: string; resource?: string };
      const resource = narrowPermission(projectRoot, pair.action, pair.resource ? [pair.resource] : []);
      if (!resource) continue;
      const action: LearnedAction = { type: "permission_preference", action: pair.action, resource };
      createSuggestion(
        database,
        `permission:${signal.signalKey}`,
        `Allow ${pair.action} on ${resource} in this project.`,
        `This exact permission was approved ${signal.approvedCount} times and never rejected.`,
        action,
      );
    }

    return database.prepare(`
      SELECT id, change_text AS change, COALESCE(reason, '') AS reason, created_at AS createdAt
      FROM suggestions WHERE status = 'pending' AND action_json IS NOT NULL
      ORDER BY id ASC LIMIT ?
    `).all(safeLimit) as LearningSuggestion[];
  });
}

/** Only an exact developer reply can authorize a suggestion review through MCP. */
export function recordLearningConfirmation(projectRoot: string, prompt: string): number | null {
  const match = prompt.trim().match(/^(yes|no)\s+(\d+)\s*[.!]?$/i);
  if (!match) return null;
  const suggestionId = Number(match[2]);
  if (!Number.isSafeInteger(suggestionId) || suggestionId < 1) return null;
  return withProjectDatabase(projectRoot, (database) => {
    const pending = database.prepare(
      "SELECT 1 FROM suggestions WHERE id = ? AND status = 'pending' AND action_json IS NOT NULL",
    ).get(suggestionId);
    if (!pending) return null;
    database.prepare(`
      INSERT OR REPLACE INTO learning_confirmations (suggestion_id, accepted, created_at) VALUES (?, ?, ?)
    `).run(suggestionId, match[1].toLocaleLowerCase() === "yes" ? 1 : 0, new Date().toISOString());
    return suggestionId;
  });
}

export function reviewLearningSuggestion(projectRoot: string, suggestionId: number, approved: boolean): SuggestionReviewResult {
  return withProjectDatabase(projectRoot, (database) => {
    const apply = database.transaction(() => {
      const suggestion = database.prepare(`
        SELECT change_text AS change, action_json AS actionJson FROM suggestions WHERE id = ? AND status = 'pending'
      `).get(suggestionId) as { change: string; actionJson: string | null } | undefined;
      if (!suggestion || !suggestion.actionJson) return { changed: false };
      const confirmation = database.prepare(
        "SELECT accepted FROM learning_confirmations WHERE suggestion_id = ?",
      ).get(suggestionId) as { accepted: number } | undefined;
      if (!confirmation || Boolean(confirmation.accepted) !== approved) {
        return { changed: false, confirmationRequired: true };
      }
      database.prepare("DELETE FROM learning_confirmations WHERE suggestion_id = ?").run(suggestionId);
      if (!approved) {
        database.prepare("UPDATE suggestions SET status = 'rejected' WHERE id = ?").run(suggestionId);
        return { changed: true };
      }

      const action = JSON.parse(suggestion.actionJson) as LearnedAction;
      const now = new Date().toISOString();
      let targetId: number;
      switch (action.type) {
        case "habit": {
          const result = database.prepare(`
            INSERT INTO learned_preferences (kind, preference_key, value, created_at) VALUES ('habit', 'habit', ?, ?)
          `).run(clean(action.text, 180), now);
          targetId = Number(result.lastInsertRowid);
          break;
        }
        case "permission_preference": {
          const text = `Permission preference: ${action.action} on ${action.resource} is approved in this project.`;
          const result = database.prepare(`
            INSERT INTO learned_preferences (kind, preference_key, value, created_at) VALUES ('habit', 'permission_preference', ?, ?)
          `).run(clean(text, 180), now);
          targetId = Number(result.lastInsertRowid);
          break;
        }
        case "dial_override": {
          const key = `${action.state}.${action.dial}`;
          const result = database.prepare(`
            INSERT INTO learned_preferences (kind, preference_key, value, created_at) VALUES ('dial_override', ?, ?, ?)
          `).run(key, action.value, now);
          targetId = Number(result.lastInsertRowid);
          break;
        }
        case "deny_command": {
          const definition = { kind: "deny_command", command: action.command };
          const result = database.prepare(`
            INSERT OR IGNORE INTO guards (rule_text, definition_json, created_at) VALUES (?, ?, ?)
          `).run(`Never run ${action.command}.`, JSON.stringify(definition), now);
          if (result.changes === 0) throw new Error("That command rule is already active.");
          targetId = Number(result.lastInsertRowid);
          break;
        }
      }
      const result = database.prepare(`
        INSERT INTO applied_changes (suggestion_id, action_type, payload_json, target_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(suggestionId, action.type, JSON.stringify(action), targetId, now);
      database.prepare("UPDATE suggestions SET status = 'approved' WHERE id = ?").run(suggestionId);
      return { changed: true, changeId: Number(result.lastInsertRowid) };
    });
    return apply();
  });
}

export function listAppliedChanges(projectRoot: string, limit = 3, beforeId = Number.MAX_SAFE_INTEGER): AppliedChange[] {
  const safeLimit = Math.max(0, Math.min(3, Math.floor(limit)));
  return withProjectDatabase(projectRoot, (database) => database.prepare(`
    SELECT id, suggestion_id AS suggestionId, action_type AS action,
      payload_json AS payloadJson, created_at AS createdAt, undone_at AS undoneAt
    FROM applied_changes WHERE id < ? ORDER BY id DESC LIMIT ?
  `).all(beforeId, safeLimit).map((row: any) => {
    const action = JSON.parse(row.payloadJson) as LearnedAction;
    const details = action.type === "deny_command"
      ? `Never run ${action.command}`
      : action.type === "permission_preference"
        ? `Remember approval preference for ${action.action} on ${action.resource}`
        : action.type === "dial_override"
          ? "Make debug state shorter"
          : `Remember: ${action.text}`;
    return {
      id: row.id,
      suggestionId: row.suggestionId,
      action: row.action,
      details,
      createdAt: row.createdAt,
      undoneAt: row.undoneAt,
    };
  }) as AppliedChange[]);
}

export function undoAppliedChange(projectRoot: string, changeId: number): boolean {
  return withProjectDatabase(projectRoot, (database) => {
    const undo = database.transaction(() => {
      const change = database.prepare(`
        SELECT action_type AS action, target_id AS targetId FROM applied_changes WHERE id = ? AND undone_at IS NULL
      `).get(changeId) as { action: string; targetId: number } | undefined;
      if (!change) return false;
      if (change.action === "deny_command") database.prepare("DELETE FROM guards WHERE id = ?").run(change.targetId);
      else database.prepare("DELETE FROM learned_preferences WHERE id = ?").run(change.targetId);
      database.prepare("UPDATE applied_changes SET undone_at = ? WHERE id = ?").run(new Date().toISOString(), changeId);
      return true;
    });
    return undo();
  });
}


export function getLearnedHabits(projectRoot: string, limit = 2): string[] {
  const safeLimit = Math.max(0, Math.min(2, Math.floor(limit)));
  return withProjectDatabase(projectRoot, (database) => database.prepare(`
    SELECT value FROM learned_preferences WHERE kind = 'habit' ORDER BY id DESC LIMIT ?
  `).all(safeLimit).map((row: any) => row.value as string));
}

export function getLearnedDialOverride(projectRoot: string, state: PersonaState, dial: "verbosity"): "low" | null {
  return withProjectDatabase(projectRoot, (database) => {
    const row = database.prepare(`
      SELECT value FROM learned_preferences
      WHERE kind = 'dial_override' AND preference_key = ? ORDER BY id DESC LIMIT 1
    `).get(`${state}.${dial}`) as { value: string } | undefined;
    return row?.value === "low" ? "low" : null;
  });
}

