import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../..', import.meta.url));

/**
 * The names of the Biome rules that `code` breaks, as if it were the file `path` (relative to the
 * repository). Biome lints a copy of the repository's `biome.json` in a temporary folder, since it
 * doesn't report diagnostics for code read from stdin.
 */
export const lintAs = (path: string, code: string): string[] => {
  const dir = mkdtempSync(join(tmpdir(), 'shura-lint-'));
  try {
    copyFileSync(join(repo, 'biome.json'), join(dir, 'biome.json'));
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), code);
    const result = spawnSync(
      join(repo, 'node_modules/.bin/biome'),
      ['lint', '--vcs-enabled=false', '--reporter=json', path],
      { cwd: dir, encoding: 'utf8' },
    );
    const report = JSON.parse(result.stdout) as { diagnostics: { category: string }[] };
    return report.diagnostics.map(({ category }) => category);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
