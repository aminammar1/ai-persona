import { applyStateDials } from "./dials.ts";
import { detectPersonaState } from "./detector.ts";
import { loadProfile, type LoadProfileOptions } from "./profile.ts";
import { readLastSettingsKey, readLastState, writeLastState } from "./state-store.ts";
import { getLearnedDialOverride } from "./learning.ts";
import type { PersonaState, PromptContext, PromptTransition } from "./types.ts";

const STATE_BEHAVIOR: Record<PersonaState, string> = {
  init: "orient to the project and ask before setup changes",
  flow: "act on the task and keep updates brief",
  debug: "focus on the failure, limit retries, and ask at most one question",
  explore: "explain options and tradeoffs before editing",
  careful: "surface the plan and ask before risky actions",
};

function buildHint(state: PersonaState, verbosity: string, nativeMode?: string): string {
  const modeName = nativeMode?.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 24);
  const modeNote = modeName
    ? `Respect the active built-in ${modeName} mode, tools, and permissions.`
    : "Respect built-in modes, tools, and permissions.";
  const verbosityNote = verbosity === "low" ? " Keep it concise." : "";
  return `Persona ${state}: ${STATE_BEHAVIOR[state]}.${verbosityNote} Keep the developer's task unchanged. ${modeNote}`;
}

/**
 * Classify a prompt, derive its dials from profile.md, emit a hint only for a
 * persona-state or dial change, and persist both for the current project.
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
  const dials = applyStateDials(profile.baseline, state);
  const learnedVerbosity = getLearnedDialOverride(projectRoot, state, "verbosity");
  if (learnedVerbosity) dials.verbosity = learnedVerbosity;
  const settingsKey = JSON.stringify(dials);
  const changed = state !== previousState || settingsKey !== readLastSettingsKey(projectRoot);
  const result: PromptTransition = {
    state,
    changed,
    dials,
    hint: changed ? buildHint(state, dials.verbosity, context.nativeMode) : null,
  };
  writeLastState(projectRoot, state, settingsKey);
  return result;
}
