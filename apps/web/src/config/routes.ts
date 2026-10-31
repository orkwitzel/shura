import type { SoloMode } from '@shura/client-core';

/** The app's route paths (design §13.2, Routes). */
export const ROUTES = {
  mainMenu: '/',
  settings: '/settings',
  /** A single-player game: `sprint`, `marathon` or `ultra`. Anything else redirects to `/`. */
  solo: '/solo/:mode',
  /** The *Play online* menu and the quick-match waiting screen. */
  online: '/online',
  /** A room: its lobby, matches and results. A player in a room is on its path. */
  room: '/r/:code',
} as const;

/** The route that plays `mode`. */
export const soloPath = (mode: SoloMode) => `/solo/${mode}`;

/** The route of the room with `code`, which is also its link (design §10.3). */
export const roomPath = (code: string) => `/r/${code}`;

/** The room code in `path` if it's a room's route (as typed in the address bar), else `null`. */
export function roomCodeIn(path: string): string | null {
  return /^\/r\/([^/]+)\/?$/.exec(path)?.[1] ?? null;
}

/** Whether `path` is one of online play's routes, which share one online session. */
export const isOnlinePath = (path: string) =>
  path === ROUTES.online || path === `${ROUTES.online}/` || roomCodeIn(path) !== null;
