import type { DialLevel, PersonaDials, PersonaState } from "./types.ts";

type Direction = -1 | 0 | 1;

interface StateShift {
  verbosity: Direction;
  autonomy: Direction;
  caution: Direction;
  exploration: Direction;
}

const SHIFTS: Record<PersonaState, StateShift> = {
  init: { verbosity: 0, autonomy: -1, caution: 0, exploration: 0 },
  flow: { verbosity: 0, autonomy: 0, caution: 0, exploration: 0 },
  debug: { verbosity: -1, autonomy: 0, caution: 1, exploration: -1 },
  explore: { verbosity: 1, autonomy: -1, caution: 0, exploration: 1 },
  careful: { verbosity: 0, autonomy: -1, caution: 1, exploration: 0 },
};

const LEVELS: readonly DialLevel[] = ["low", "balanced", "high"];

function shiftLevel(level: DialLevel, direction: Direction): DialLevel {
  const index = LEVELS.indexOf(level);
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index + direction))];
}

/** Apply a small, bounded state shift to the developer's project baseline. */
export function applyStateDials(baseline: PersonaDials, state: PersonaState): PersonaDials {
  const shift = SHIFTS[state];
  return {
    verbosity: shiftLevel(baseline.verbosity, shift.verbosity),
    autonomy: shift.autonomy < 0 ? "ask" : shift.autonomy > 0 ? "act" : baseline.autonomy,
    caution: shiftLevel(baseline.caution, shift.caution),
    exploration: shiftLevel(baseline.exploration, shift.exploration),
  };
}
