import { createRecordsStore, createSettingsStore } from '@shura/client-core';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BINDINGS } from '@/config/default-bindings';
import { createLocalStorage } from '@/lib/local-storage';
import { toppedOutMarathon } from '../support/games';
import { personalBest } from '../support/records';

const SETTINGS_KEY = 'shura.settings';
const RECORDS_KEY = 'shura.records';

const openSettings = () =>
  createSettingsStore({ storage: createLocalStorage(), bindings: DEFAULT_BINDINGS });
const openRecords = () => createRecordsStore({ storage: createLocalStorage() });

describe('createLocalStorage', () => {
  test('keeps nothing until something is written', () => {
    expect(createLocalStorage().read('settings')).toBeNull();
  });

  test('keeps settings and records under their own keys', () => {
    const storage = createLocalStorage();
    storage.write('settings', 'the settings');
    storage.write('records', 'the records');
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('the settings');
    expect(localStorage.getItem(RECORDS_KEY)).toBe('the records');
    expect(storage.read('settings')).toBe('the settings');
  });

  test('sets text aside under a backup key, never over an older backup', () => {
    const storage = createLocalStorage();
    storage.write('records', 'first');
    expect(storage.setAside('records')).toContain('shura.records.bak');
    storage.write('records', 'second');
    storage.setAside('records');
    expect(localStorage.getItem(RECORDS_KEY)).toBeNull();
    expect(localStorage.getItem('shura.records.bak')).toBe('first');
    expect(localStorage.getItem('shura.records.bak-2')).toBe('second');
  });
});

describe('settings over localStorage', () => {
  test('round-trip', () => {
    const settings = openSettings();
    settings.update({ theme: 'plum', ghost: false });
    expect(settings.save()).toBeNull();
    expect(openSettings().getState()).toMatchObject({ theme: 'plum', ghost: false });
  });

  test('invalid settings fall back to the defaults with a notice, and stay as they were', () => {
    localStorage.setItem(SETTINGS_KEY, '{"version":1,"theme":"neon"}');
    const settings = openSettings();
    expect(settings.getState().theme).toBe('indigo');
    expect(settings.problem).toContain('shura.settings');
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('{"version":1,"theme":"neon"}');
  });
});

describe('records over localStorage', () => {
  test('a new personal best is saved and read back', () => {
    const outcome = openRecords().submit(toppedOutMarathon());
    expect(outcome).toMatchObject({ kind: 'new', saveProblem: null });
    expect(openRecords().getState().marathon?.stats.outcome).toBe('gameOver');
  });

  test('stored records are read back', () => {
    const records = { version: 1, sprint: personalBest() };
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    expect(openRecords().getState()).toEqual(records);
  });

  test('invalid records are moved to a backup key, never dropped', () => {
    localStorage.setItem(RECORDS_KEY, 'not json');
    const records = openRecords();
    expect(records.getState()).toEqual({ version: 1 });
    expect(records.problem).toContain('shura.records.bak');
    expect(localStorage.getItem('shura.records.bak')).toBe('not json');
    expect(localStorage.getItem(RECORDS_KEY)).toBeNull();
  });
});
