export const PERSONA_STATES = ["init", "flow", "debug", "explore", "careful"] as const;

export type PersonaState = (typeof PERSONA_STATES)[number];
export type DialLevel = "low" | "balanced" | "high";
export type Autonomy = "ask" | "act";

export interface PersonaDials {
  verbosity: DialLevel;
  autonomy: Autonomy;
  caution: DialLevel;
  exploration: DialLevel;
}

export interface PersonaProfile {
  baseline: PersonaDials;
  sections: Record<string, string>;
  files: Record<string, string>;
  profilePath: string;
}

export interface PromptContext {
  /** Recent prompts from this session, oldest first. */
  recentPrompts?: string[];
  interrupted?: boolean;
  firstPrompt?: boolean;
  /** A native mode is descriptive context only; ai-persona never changes it. */
  nativeMode?: string;
}

export interface PromptTransition {
  state: PersonaState;
  changed: boolean;
  dials: PersonaDials;
  hint: string | null;
}

export const DEFAULT_DIALS: Readonly<PersonaDials> = {
  verbosity: "balanced",
  autonomy: "act",
  caution: "balanced",
  exploration: "balanced",
};
