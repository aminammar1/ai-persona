import { createHash } from "node:crypto";
import { applyStateDials } from "./dials.ts";
import { detectPersonaState } from "./detector.ts";
import { loadProfile, type LoadProfileOptions } from "./profile.ts";
import { readLastState, readPromptSignals, writeLastState } from "./state-store.ts";
import { getLearnedDialOverride } from "./learning.ts";
import type { PersonaState, PromptContext, PromptTransition } from "./types.ts";

const STATE_BEHAVIOR: Record<PersonaState, string> = {
  init: "orient to the project and ask before setup changes",
  flow: "act on the task and keep updates brief",
  debug: "focus on the failure, limit retries, and ask at most one question",
  explore: "explain options and tradeoffs before editing",
  careful: "surface the plan and ask before risky actions",
};

function buildHint(state: PersonaState, dials: { verbosity: string; autonomy: string; caution: string; exploration: string }): string {
  return `Persona ${state}: verbosity ${dials.verbosity}, autonomy ${dials.autonomy}, caution ${dials.caution}, exploration ${dials.exploration}. ${STATE_BEHAVIOR[state]}. Keep the developer's task unchanged; respect active agent modes, tools, and permissions.`;
}

function promptFingerprint(prompt: string): string {
  const normalized = prompt.toLocaleLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return createHash("sha256").update(normalized).digest("hex");
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
  const promptSignals = readPromptSignals(projectRoot);
  const fingerprint = promptFingerprint(prompt);
  const state = detectPersonaState(prompt, {
    ...context,
    repeated: context.repeated ?? promptSignals.hashes.includes(fingerprint),
    interrupted: context.interrupted ?? promptSignals.interrupted,
    firstPrompt: context.firstPrompt ?? previousState === null,
  });
  const profile = loadProfile(projectRoot, profileOptions);
  const dials = applyStateDials(profile.baseline, state);
  const learnedVerbosity = getLearnedDialOverride(projectRoot, state, "verbosity");
  if (learnedVerbosity) dials.verbosity = learnedVerbosity;
  const settingsKey = JSON.stringify(dials);
  const changed = state !== previousState;
  const result: PromptTransition = {
    state,
    changed,
    dials,
    hint: changed ? buildHint(state, dials) : null,
  };
  writeLastState(projectRoot, state, settingsKey, {
    hashes: [...promptSignals.hashes, fingerprint],
    interrupted: false,
  });
  return result;
}
