import { createSettingsStore } from '@shura/client-core';
import { DEFAULT_BINDINGS } from '@/config/default-bindings';
import { createLocalStorage } from '@/lib/local-storage';

/**
 * The app's settings (design §13.1, State), loaded once from `localStorage` with the web's default
 * bindings. Invalid settings fall back to the defaults, with `problem` saying why. Components read
 * it through client-core's hooks (`useSettings`, `useSettingsStore`); code that isn't React imports
 * it directly.
 */
export const settingsStore = createSettingsStore({
  storage: createLocalStorage(),
  bindings: DEFAULT_BINDINGS,
});
