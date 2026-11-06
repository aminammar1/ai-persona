import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONA_STATES, type PersonaState } from "./types.ts";

const STATE_DIRECTORY = ".ai-persona";
const STATE_FILE = "state.json";

function statePath(projectRoot: string): string {
  return resolve(projectRoot, STATE_DIRECTORY, STATE_FILE);
}

/** Return null when no valid project state has been saved yet. */
export function readLastState(projectRoot: string): PersonaState | null {
  const path = statePath(projectRoot);
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value !== "object" || value === null || !("lastState" in value)) return null;
    const lastState = (value as { lastState: unknown }).lastState;
    return typeof lastState === "string" && PERSONA_STATES.includes(lastState as PersonaState)
      ? (lastState as PersonaState)
      : null;
  } catch {
    return null;
  }
}

/** Atomically persist the last state in this project, separate from the profile. */
export function writeLastState(projectRoot: string, state: PersonaState): void {
  const directory = resolve(projectRoot, STATE_DIRECTORY);
  const destination = statePath(projectRoot);
  const temporary = `${destination}.tmp`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(temporary, `${JSON.stringify({ lastState: state }, null, 2)}\n`, "utf8");
  renameSync(temporary, destination);
}
