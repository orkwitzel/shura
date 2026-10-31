// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const web = fileURLToPath(new URL('../../', import.meta.url));
const styles = `${web}src/styles/`;
const require = createRequire(`${web}package.json`);

const imports = (css: string) => [...css.matchAll(/@import\s+"([^"]+)"/g)].map((match) => match[1]);
const urls = (css: string) => [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);

// Design §13.2: the fonts are self-hosted, so no request goes to a font CDN.
describe('fonts', () => {
  test('come from @fontsource packages, whose font files are local', () => {
    const fonts = imports(readFileSync(`${styles}fonts.css`, 'utf8'));
    expect(fonts).toEqual([
      '@fontsource/pixelify-sans/400.css',
      '@fontsource/pixelify-sans/700.css',
      '@fontsource/silkscreen/400.css',
    ]);
    for (const font of fonts) {
      const files = urls(readFileSync(require.resolve(font as string), 'utf8'));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) expect(file).toMatch(/^\.\/files\//);
    }
  });

  test('no stylesheet or page links to another origin', () => {
    const sheets = readdirSync(`${web}src`, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.css'))
      .map((path) => readFileSync(`${web}src/${path}`, 'utf8'));
    for (const text of [...sheets, readFileSync(`${web}index.html`, 'utf8')]) {
      expect(text).not.toMatch(/https?:\/\//);
    }
  });
});
