import { createRecordsStore } from '@shura/client-core';
import { createLocalStorage } from '@/lib/local-storage';

/**
 * The app's personal bests (design §13.1, State), loaded once from `localStorage`. Invalid records
 * are moved to a backup key and a fresh start made, with `problem` saying so. Components read it
 * through client-core's hooks (`useRecords`, `useRecordsStore`); code that isn't React imports it
 * directly.
 */
export const recordsStore = createRecordsStore({ storage: createLocalStorage() });
