export { applyStateDials } from "./dials.ts";
export { detectPersonaState, parseManualOverride } from "./detector.ts";
export { loadProfile, parseProfileMarkdown } from "./profile.ts";
export type { LoadProfileOptions } from "./profile.ts";
export { processPrompt } from "./transition.ts";
export { readLastState, writeLastState } from "./state-store.ts";
export { getPersonaContext } from "./persona-context.ts";
export {
  getRecentMemories,
  proposeUpdate,
  recordCompactionSummary,
  recordCorrection,
} from "./memory.ts";
export type {
  Autonomy,
  DialLevel,
  PersonaDials,
  PersonaProfile,
  PersonaState,
  PromptContext,
  PromptTransition,
} from "./types.ts";
export type { CompactionSummary, MemoryKind, MemoryNote } from "./memory.ts";
