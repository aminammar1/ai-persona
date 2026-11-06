import { applyStateDials } from "./dials.ts";
import { detectPersonaState } from "./detector.ts";
import { loadProfile, type LoadProfileOptions } from "./profile.ts";
import { readLastState, writeLastState } from "./state-store.ts";
import type { PersonaState, PromptContext, PromptTransition } from "./types.ts";

const STATE_BEHAVIOR: Record<PersonaState, string> = {
  init: "orient to the project and ask before setup changes",
  flow: "act on the task and keep updates brief",
  debug: "focus on the failure, limit retries, and ask at most one question",
  explore: "explain options and tradeoffs before editing",
  careful: "surface the plan and ask before risky actions",
};

function buildHint(state: PersonaState, nativeMode?: string): string {
  const modeName = nativeMode?.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 24);
  const modeNote = modeName
    ? `Respect the active built-in ${modeName} mode, tools, and permissions.`
    : "Respect built-in modes, tools, and permissions.";
  return `Persona ${state}: ${STATE_BEHAVIOR[state]}. Keep the developer's task unchanged. ${modeNote}`;
}

/**
 * Classify a prompt, derive its dials from profile.md, emit a hint only for a
 * state change, and persist that state for the current project.
 */
export function processPrompt(
  projectRoot: string,
  prompt: string,
  context: PromptContext = {},
  profileOptions: LoadProfileOptions = {},
): PromptTransition {
  const previousState = readLastState(projectRoot);
  const state = detectPersonaState(prompt, {
    ...context,
    firstPrompt: context.firstPrompt ?? previousState === null,
  });
  const profile = loadProfile(projectRoot, profileOptions);
  const changed = state !== previousState;
  const result: PromptTransition = {
    state,
    changed,
    dials: applyStateDials(profile.baseline, state),
    hint: changed ? buildHint(state, context.nativeMode) : null,
  };
  writeLastState(projectRoot, state);
  return result;
}
