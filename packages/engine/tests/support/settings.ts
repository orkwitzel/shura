import { type ModeSettings, SPRINT } from '../../src/index';

/**
 * The settings the rule tests play under: Sprint's, 1 row/s at level 1, with no line goal, so a
 * game ends only by a top-out.
 */
export const TEST_SETTINGS: ModeSettings = { ...SPRINT, lineGoal: null };
