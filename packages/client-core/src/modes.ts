import { MARATHON, type ModeSettings, SPRINT, ULTRA } from '@shura/engine';

/** The single-player modes a session can play (design §4), in the order the menus list them. */
export const SOLO_MODES = ['sprint', 'marathon', 'ultra'] as const;
export type SoloMode = (typeof SOLO_MODES)[number];

/** Each single-player mode's preset: its rules and end conditions are the engine's. */
export const SOLO_PRESETS: Readonly<Record<SoloMode, ModeSettings>> = {
  marathon: MARATHON,
  sprint: SPRINT,
  ultra: ULTRA,
};
