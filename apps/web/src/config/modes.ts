import type { SoloMode } from '@shura/client-core';

/** Each single-player mode's name, as menus and headings show it. */
export const MODE_NAMES: Readonly<Record<SoloMode, string>> = {
  sprint: 'Sprint',
  marathon: 'Marathon',
  ultra: 'Ultra',
};
