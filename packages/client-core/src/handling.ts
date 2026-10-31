import type { Direction } from './actions';
import { framesToMs, msToFrames } from './frames';

/** Handling as people set it, in milliseconds (design §7.2). The input engine counts frames. */
export interface HandlingSettings {
  /** Delay before auto-repeat, in ms. */
  readonly das: number;
  /** Auto-repeat interval, in ms: 0 moves to the wall at once. */
  readonly arr: number;
  readonly softDropFactor: number | 'instant';
}

/** Handling (design §7.2), in frames. */
export interface Handling {
  /** DAS: the frames a direction is held before auto-repeat starts. */
  readonly das: number;
  /** ARR: the frames between auto-repeated moves, 0 for all the way to the wall at once. */
  readonly arr: number;
  /** The soft-drop factor: how many times faster than gravity soft drop falls, or 'instant'. */
  readonly softDropFactor: number | 'instant';
}

/** The handling ranges (design §7.2): DAS and ARR in ms, the soft-drop factor up to ×40, then instant. */
export const HANDLING_RANGES = {
  das: { min: 0, max: 333 },
  arr: { min: 0, max: 83 },
  softDropFactor: { min: 5, max: 40 },
} as const;

export const DEFAULT_HANDLING_SETTINGS: HandlingSettings = {
  das: 167,
  arr: 33,
  softDropFactor: 20,
};

/** Milliseconds as whole frames, rounded (design §7.3). */
function wholeFrames(ms: number): number {
  return Math.round(msToFrames(ms));
}

/** Handling as the input engine counts it, in frames. */
export function handlingFrames(handling: HandlingSettings): Handling {
  return {
    das: wholeFrames(handling.das),
    arr: wholeFrames(handling.arr),
    softDropFactor: handling.softDropFactor,
  };
}

/** The default handling (design §7.2), in frames: DAS 10, ARR 2, soft-drop factor ×20. */
export const DEFAULT_HANDLING: Handling = handlingFrames(DEFAULT_HANDLING_SETTINGS);

/** The soft-drop factor's steps: every 5 from ×5 to ×40, then instant. */
const SOFT_DROP_STEPS: readonly (number | 'instant')[] = [5, 10, 15, 20, 25, 30, 35, 40, 'instant'];

/**
 * Every value a handling setting can take, in order (design §7.2), for a slider: DAS and ARR each
 * whole frame in their range (in ms, rounded), the soft-drop factor ×5, ×10 … ×40, instant.
 */
export function handlingSteps(field: 'das' | 'arr'): readonly number[];
export function handlingSteps(
  field: keyof HandlingSettings,
): readonly HandlingSettings[keyof HandlingSettings][];
export function handlingSteps(
  field: keyof HandlingSettings,
): readonly HandlingSettings[keyof HandlingSettings][] {
  if (field === 'softDropFactor') return SOFT_DROP_STEPS;
  const { min, max } = HANDLING_RANGES[field];
  const steps: number[] = [];
  for (let frames = wholeFrames(min); Math.round(framesToMs(frames)) <= max; frames++) {
    steps.push(Math.round(framesToMs(frames)));
  }
  return steps;
}

/**
 * One handling setting a step up or down, within its range (design §7.2): DAS and ARR a frame at a
 * time (in ms, rounded), the soft-drop factor through ×5, ×10 … ×40, instant.
 */
export function stepHandling(
  handling: HandlingSettings,
  field: keyof HandlingSettings,
  direction: Direction,
): HandlingSettings {
  if (field === 'softDropFactor') {
    const rank = (factor: number | 'instant') => (factor === 'instant' ? Infinity : factor);
    const current = rank(handling.softDropFactor);
    // A hand-edited factor between steps goes to the next step its way.
    const step =
      direction > 0
        ? SOFT_DROP_STEPS.find((s) => rank(s) > current)
        : SOFT_DROP_STEPS.findLast((s) => rank(s) < current);
    return { ...handling, softDropFactor: step ?? handling.softDropFactor };
  }
  const { min, max } = HANDLING_RANGES[field];
  const frames = wholeFrames(handling[field]) + direction;
  const ms = Math.min(Math.max(Math.round(framesToMs(frames)), min), max);
  return { ...handling, [field]: ms };
}
