import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileStorage, storagePaths } from '../src/config/file-storage';

describe('where settings and records live', () => {
  it('follows the XDG directories when they are set', () => {
    const env = { XDG_CONFIG_HOME: '/x/config', XDG_DATA_HOME: '/x/data' };
    expect(storagePaths({ env, platform: 'linux', home: '/home/or' })).toEqual({
      settings: '/x/config/shura/config.json',
      records: '/x/data/shura/records.json',
    });
  });

  it('defaults to ~/.config and ~/.local/share', () => {
    expect(storagePaths({ env: {}, platform: 'linux', home: '/home/or' })).toEqual({
      settings: '/home/or/.config/shura/config.json',
      records: '/home/or/.local/share/shura/records.json',
    });
  });

  it('ignores a relative XDG directory, as the spec says', () => {
    const env = { XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: '' };
    expect(storagePaths({ env, platform: 'darwin', home: '/Users/or' })).toEqual({
      settings: '/Users/or/.config/shura/config.json',
      records: '/Users/or/.local/share/shura/records.json',
    });
  });

  it('uses %APPDATA% and %LOCALAPPDATA% on Windows', () => {
    const env = {
      APPDATA: 'C:\\Users\\or\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\or\\AppData\\Local',
    };
    expect(storagePaths({ env, platform: 'win32', home: 'C:\\Users\\or' })).toEqual({
      settings: 'C:\\Users\\or\\AppData\\Roaming\\shura\\config.json',
      records: 'C:\\Users\\or\\AppData\\Local\\shura\\records.json',
    });
  });
});

describe('file storage', () => {
  let dir: string;
  let paths: { settings: string; records: string };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shura-storage-'));
    paths = {
      settings: join(dir, 'config', 'config.json'),
      records: join(dir, 'data', 'records.json'),
    };
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads nothing before anything is written', () => {
    expect(fileStorage(paths).read('settings')).toBeNull();
  });

  it('writes each kind to its own file, making the directories', () => {
    const storage = fileStorage(paths);
    storage.write('settings', '{"version":1}');
    storage.write('records', '{"version":1,"sprint":{}}');
    expect(readFileSync(paths.settings, 'utf8')).toBe('{"version":1}');
    expect(storage.read('records')).toBe('{"version":1,"sprint":{}}');
  });

  it('replaces the file, leaving no temporary file behind', () => {
    const storage = fileStorage(paths);
    storage.write('settings', 'old');
    storage.write('settings', 'new');
    expect(storage.read('settings')).toBe('new');
    expect(readdirSync(join(dir, 'config'))).toEqual(['config.json']);
  });

  it.each([
    ['writing the temporary file', 'writeFileSync'],
    ['renaming it over the old one', 'renameSync'],
  ] as const)('leaves the old file intact when %s fails', (_, failing) => {
    fileStorage(paths).write('settings', 'old');
    const storage = fileStorage(paths, {
      [failing]: (file: string) => {
        // A write that gets part of the way, as a full disk would.
        if (failing === 'writeFileSync') writeFileSync(file, 'ne');
        throw new Error('ENOSPC: no space left on device');
      },
    });
    expect(() => storage.write('settings', 'new')).toThrow('ENOSPC');
    expect(readFileSync(paths.settings, 'utf8')).toBe('old');
    expect(readdirSync(join(dir, 'config'))).toEqual(['config.json']);
  });

  it('sets a file aside as .bak, replacing an older .bak', () => {
    const storage = fileStorage(paths);
    storage.write('records', 'broken');
    writeFileSync(`${paths.records}.bak`, 'older');
    expect(storage.setAside('records')).toBe(`${paths.records}.bak`);
    expect(storage.read('records')).toBeNull();
    expect(readFileSync(`${paths.records}.bak`, 'utf8')).toBe('broken');
  });

  it('describes each kind by its path', () => {
    expect(fileStorage(paths).describe('records')).toBe(paths.records);
  });
});
