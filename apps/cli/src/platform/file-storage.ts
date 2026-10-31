import * as fs from 'node:fs';
import { dirname, posix, win32 } from 'node:path';
import type { Storage, StoredKind } from '@shura/client-core';

/** The file each stored kind lives in. */
export type StoragePaths = Readonly<Record<StoredKind, string>>;

/** Where to look: the environment, the platform and the home directory (the process's, or a test's). */
export interface StorageLocation {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly home: string;
}

/**
 * Where the settings and the records live (design §13.3): `config.json` in the XDG config
 * directory and `records.json` in the XDG data directory, each in a `shura` folder; on Windows
 * `%APPDATA%\shura` and `%LOCALAPPDATA%\shura`. An XDG variable that is unset, empty or relative
 * is ignored, as the XDG spec says.
 */
export function storagePaths({ env, platform, home }: StorageLocation): StoragePaths {
  if (platform === 'win32') {
    const roaming = env.APPDATA || win32.join(home, 'AppData', 'Roaming');
    const local = env.LOCALAPPDATA || win32.join(home, 'AppData', 'Local');
    return {
      settings: win32.join(roaming, 'shura', 'config.json'),
      records: win32.join(local, 'shura', 'records.json'),
    };
  }
  const xdg = (name: string, fallback: string) => {
    const value = env[name];
    return value && posix.isAbsolute(value) ? value : posix.join(home, fallback);
  };
  return {
    settings: posix.join(xdg('XDG_CONFIG_HOME', '.config'), 'shura', 'config.json'),
    records: posix.join(xdg('XDG_DATA_HOME', '.local/share'), 'shura', 'records.json'),
  };
}

/** The file system calls file storage makes, which tests can replace to make them fail. */
export type FileSystem = Pick<
  typeof fs,
  'readFileSync' | 'writeFileSync' | 'renameSync' | 'mkdirSync' | 'rmSync'
>;

/**
 * Settings and records as files. Writes are atomic: the text goes to a temporary file beside the
 * real one, which is then renamed over it, so a crash or a full disk mid-save leaves the old file
 * as it was (design §13.3).
 */
export function fileStorage(paths: StoragePaths, overrides: Partial<FileSystem> = {}): Storage {
  const io: FileSystem = { ...fs, ...overrides };
  return {
    read(kind) {
      try {
        return io.readFileSync(paths[kind], 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    write(kind, text) {
      const file = paths[kind];
      const temporary = `${file}.${process.pid}.tmp`;
      io.mkdirSync(dirname(file), { recursive: true });
      try {
        io.writeFileSync(temporary, text);
        io.renameSync(temporary, file);
      } catch (error) {
        io.rmSync(temporary, { force: true });
        throw error;
      }
    },
    setAside(kind) {
      const aside = `${paths[kind]}.bak`;
      io.renameSync(paths[kind], aside);
      return aside;
    },
    describe: (kind) => paths[kind],
  };
}
