import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileStorage, type StoragePaths, storagePaths } from '../../src/platform/file-storage';

/**
 * File storage in a fresh temporary directory standing in for the XDG config and data
 * directories, never the real home directory. `config` and `records` are written first if given
 * (objects as JSON).
 */
export function tempStorage(files: { config?: unknown; records?: unknown } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'shura-'));
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), XDG_DATA_HOME: join(dir, 'data') };
  const paths: StoragePaths = storagePaths({ env, platform: 'linux', home: join(dir, 'home') });
  const put = (file: string, value: unknown) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  if (files.config !== undefined) put(paths.settings, files.config);
  if (files.records !== undefined) put(paths.records, files.records);
  return {
    dir,
    env,
    paths,
    storage: fileStorage(paths),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
