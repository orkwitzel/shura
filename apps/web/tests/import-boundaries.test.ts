// @vitest-environment node
/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const biome = fileURLToPath(new URL('../node_modules/.bin/biome', import.meta.url));
const config = fileURLToPath(new URL('../../../biome.json', import.meta.url));

/**
 * A scratch copy of the repo's layout with the real `biome.json` at its root, so files can be
 * checked at any path under `apps/web/src` without touching the real tree. (Biome skips lint
 * errors for text piped in on stdin, so the files have to exist.)
 */
let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'shura-boundaries-'));
  copyFileSync(config, join(root, 'biome.json'));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Whether `biome check` passes a file at `path` (under `apps/web/src`) holding `source`. */
function passes(path: string, source: string): boolean {
  const file = join(root, 'apps/web/src', path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
  const result = spawnSync(biome, ['check', '--vcs-enabled=false', file], {
    cwd: root,
    encoding: 'utf8',
  });
  rmSync(file);
  return result.status === 0;
}

const importing = (from: string) =>
  `import { thing } from '${from}';\n\nexport const used = thing;\n`;

const SHARED = [
  'components/ui/button.tsx',
  'hooks/use-theme.ts',
  'lib/local-storage.ts',
  'stores/settings-store.ts',
  'config/routes.ts',
  'utils/clamp.ts',
];

// The import direction of apps/web/AGENTS.md: shared folders → features → app.
describe('import boundaries', () => {
  test('a feature importing another feature fails', () => {
    expect(
      passes('features/board/components/board-canvas.tsx', importing('@/features/hud/hud')),
    ).toBe(false);
  });

  test('a feature importing the app fails', () => {
    expect(passes('features/results/results.tsx', importing('@/app/router'))).toBe(false);
  });

  test.each(SHARED)('%s importing a feature or the app fails', (path) => {
    expect(passes(path, importing('@/features/board/board'))).toBe(false);
    expect(passes(path, importing('@/app/router'))).toBe(false);
  });

  test('a feature may import the shared folders and its own files', () => {
    const file = 'features/board/components/board-canvas.tsx';
    expect(passes(file, importing('@/lib/pixi/draw-cell'))).toBe(true);
    expect(passes(file, importing('../utils/layout-board'))).toBe(true);
  });

  test('a page may import features', () => {
    expect(passes('app/routes/solo-page.tsx', importing('@/features/board/board'))).toBe(true);
  });
});
