import { MARATHON, type ModeSettings, SPRINT, ULTRA } from '@shura/engine';

/** The single-player modes a session can play (design §4). */
export type SoloMode = 'marathon' | 'sprint' | 'ultra';

/** Each single-player mode's preset: its rules and end conditions are the engine's. */
export const SOLO_PRESETS: Readonly<Record<SoloMode, ModeSettings>> = {
  marathon: MARATHON,
  sprint: SPRINT,
  ultra: ULTRA,
};
