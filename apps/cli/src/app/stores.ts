import {
  type AppStores,
  createRecordsStore,
  createSettingsStore,
  type Storage,
} from '@shura/client-core';
import { DEFAULT_BINDINGS } from '../platform/input/bindings';

/** Something to tell the player about the stored files: a short form for the status line, and the full message. */
export interface Notice {
  readonly brief: string;
  readonly message: string;
}

/** The CLI's settings and records stores, and what went wrong loading them. */
export interface CliStores extends AppStores {
  readonly notices: readonly Notice[];
}

/**
 * Loads the settings (with the CLI's default bindings) and the records from `storage`. An invalid
 * config falls back to the defaults, and invalid records are set aside, each with a notice
 * (design §13.3).
 */
export function openStores(storage: Storage): CliStores {
  const settings = createSettingsStore({ storage, bindings: DEFAULT_BINDINGS });
  const records = createRecordsStore({ storage });
  const notices: Notice[] = [];
  if (settings.problem) {
    notices.push({ brief: 'config.json invalid: using the defaults', message: settings.problem });
  }
  if (records.problem) {
    notices.push({ brief: 'records.json invalid: set aside', message: records.problem });
  }
  return { settings, records, notices };
}

/**
 * What to print once the app has left the alternate screen (design §13.3): each notice in full,
 * then why the settings last failed to save, if they did, since the screen that said so is gone.
 */
export function exitMessages({ notices, settings }: CliStores): string[] {
  const messages = notices.map(({ message }) => message);
  if (settings.saveProblem) messages.push(settings.saveProblem);
  return messages;
}
