import type { SoloMode } from '@shura/client-core';

/** The app's route paths (design §13.2, Routes). */
export const ROUTES = {
  mainMenu: '/',
  settings: '/settings',
  /** A single-player game: `sprint`, `marathon` or `ultra`. Anything else redirects to `/`. */
  solo: '/solo/:mode',
} as const;

/** The route that plays `mode`. */
export const soloPath = (mode: SoloMode) => `/solo/${mode}`;
