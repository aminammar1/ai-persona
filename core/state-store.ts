import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONA_STATES, type PersonaState } from "./types.ts";

interface SavedState {
  lastState?: unknown;
  settingsKey?: unknown;
  promptHashes?: unknown;
  interrupted?: unknown;
}

function readSavedState(projectRoot: string): SavedState {
  try {
    const value: unknown = JSON.parse(readFileSync(statePath(projectRoot), "utf8"));
    return typeof value === "object" && value !== null ? value as SavedState : {};
  } catch {
    return {};
  }
}

const STATE_DIRECTORY = ".ai-persona";
const STATE_FILE = "state.json";

function statePath(projectRoot: string): string {
  return resolve(projectRoot, STATE_DIRECTORY, STATE_FILE);
}

/** Return null when no valid project state has been saved yet. */
export function readLastState(projectRoot: string): PersonaState | null {
  const lastState = readSavedState(projectRoot).lastState;
  return typeof lastState === "string" && PERSONA_STATES.includes(lastState as PersonaState)
    ? lastState as PersonaState
    : null;
}

export function readLastSettingsKey(projectRoot: string): string | null {
  const settingsKey = readSavedState(projectRoot).settingsKey;
  return typeof settingsKey === "string" ? settingsKey : null;
}

export function readPromptSignals(projectRoot: string): { hashes: string[]; interrupted: boolean } {
  const saved = readSavedState(projectRoot);
  const hashes = Array.isArray(saved.promptHashes)
    ? saved.promptHashes.filter((value): value is string => typeof value === "string").slice(-3)
    : [];
  return { hashes, interrupted: saved.interrupted === true };
}

/** Save only short one-way prompt fingerprints, never prompt text. */
export function markPromptInterrupted(projectRoot: string): void {
  const saved = readSavedState(projectRoot);
  writeSavedState(projectRoot, { ...saved, interrupted: true });
}

export function resetPromptSignals(projectRoot: string): void {
  const saved = readSavedState(projectRoot);
  writeSavedState(projectRoot, { ...saved, promptHashes: [], interrupted: false });
}

/** Atomically persist the last state in this project, separate from the profile. */
export function writeLastState(
  projectRoot: string,
  state: PersonaState,
  settingsKey?: string,
  promptSignals?: { hashes: string[]; interrupted: boolean },
): void {
  const saved = readSavedState(projectRoot);
  writeSavedState(projectRoot, {
    ...saved,
    lastState: state,
    ...(settingsKey ? { settingsKey } : {}),
    ...(promptSignals ? { promptHashes: promptSignals.hashes.slice(-3), interrupted: promptSignals.interrupted } : {}),
  });
}

function writeSavedState(projectRoot: string, value: SavedState): void {
  const directory = resolve(projectRoot, STATE_DIRECTORY);
  const destination = statePath(projectRoot);
  const temporary = `${destination}.tmp`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, destination);
}
