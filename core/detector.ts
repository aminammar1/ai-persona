import type { PersonaState, PromptContext } from "./types.ts";

const ERROR_PATTERN = /\b(?:error|exception|traceback|stack trace|panic|segmentation fault)\b|\bTS\d{3,5}\b|\bat\s+[\w$.<>]+\s*\([^\n]+:\d+(?::\d+)?\)/i;
const CAREFUL_PATTERN = /\b(?:production|prod|deploy(?:ment)?|delete|remove|drop|migrat(?:e|ion)|rollback|release|ship\s+to\s+prod)\b/i;
const DEBUG_PATTERN = /\b(?:still not working|still broken|still failing|not fixed|didn['’]?t work|same issue|keeps? failing|again(?:\s+and\s+again)?)\b/i;
const EXPLORE_PATTERN = /\b(?:why|how|explain|compare|what happens|walk me through)\b/i;
const LEVEL_PATTERN = /^(?:init|flow|debug|explore|careful)$/i;

function normalizePrompt(prompt: string): string {
  return prompt.toLocaleLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

function exactOverride(prompt: string): PersonaState | null {
  const match = normalizePrompt(prompt).match(LEVEL_PATTERN);
  return match ? (match[0].toLocaleLowerCase() as PersonaState) : null;
}

function isTerse(prompt: string): boolean {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 3;
}

function isRepeated(prompt: string, recentPrompts: string[] = []): boolean {
  const normalized = normalizePrompt(prompt);
  if (!normalized) return false;
  return recentPrompts.slice(-3).some((previous) => normalizePrompt(previous) === normalized);
}

/** Classify a prompt with plain rules only; this function makes no model call. */
export function detectPersonaState(prompt: string, context: PromptContext = {}): PersonaState {
  const override = exactOverride(prompt);
  if (override) return override;
  if (CAREFUL_PATTERN.test(prompt)) return "careful";
  if (
    ERROR_PATTERN.test(prompt) ||
    DEBUG_PATTERN.test(prompt) ||
    context.interrupted ||
    context.repeated ||
    isRepeated(prompt, context.recentPrompts)
  ) return "debug";
  if (EXPLORE_PATTERN.test(prompt)) return "explore";
  if (context.firstPrompt) return "init";
  if (isTerse(prompt)) return "debug";
  return "flow";
}

export function parseManualOverride(value: string): PersonaState | null {
  return exactOverride(value);
}
