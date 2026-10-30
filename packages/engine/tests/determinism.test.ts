import { describe, expect, test } from 'vitest';
import { engineSources, findViolations } from './support/determinism';

describe('determinism guard (design §5.1)', () => {
  test('finds the engine source files', () => {
    const files = engineSources().map(({ file }) => file);
    expect(files).toContain('engine.ts');
    expect(files).toContain('random.ts');
  });

  test.each(engineSources())('$file uses no clocks, global randomness or floats', ({ source }) => {
    expect(findViolations(source)).toEqual([]);
  });

  const forbidden: Record<string, string> = {
    'Math.random': 'const r = Math.random();',
    'Date.now': 'const t = Date.now();',
    'new Date': 'const d = new Date();',
    'performance.now': 'const t = performance.now();',
    setTimeout: 'setTimeout(tick, 16);',
    setInterval: 'setInterval(tick, 16);',
    requestAnimationFrame: 'requestAnimationFrame(tick);',
    queueMicrotask: 'queueMicrotask(tick);',
    'a float literal': 'const half = 0.5;',
    'a leading-dot float literal': 'const half = .5;',
    'a negative exponent': 'const tiny = 1e-3;',
    'float Math functions': 'const root = Math.sqrt(2);',
    'Math.round': 'const n = Math.round(x);',
    parseFloat: "const n = parseFloat('1');",
    'locale formatting': 'const s = n.toLocaleString();',
    Intl: 'const c = new Intl.Collator();',
  };

  test.each(Object.entries(forbidden))('flags %s', (_, source) => {
    expect(findViolations(source)).not.toEqual([]);
  });

  test('allows integer Math helpers, member access and integer literals', () => {
    const source = [
      'const a = Math.imul(x, 3) >>> 0;',
      'const b = Math.trunc(Math.max(1, Math.min(2, Math.abs(-3))));',
      'const c = state.frame + 1_000 + 0xff;',
      'const d = rows[0].length;',
    ].join('\n');
    expect(findViolations(source)).toEqual([]);
  });

  test('ignores comments', () => {
    const source = [
      '// Date.now() would break replays.',
      '/* Gravity is 1/60 of a row, not 0.0167. */',
      'const a = 1;',
    ].join('\n');
    expect(findViolations(source)).toEqual([]);
  });

  test('reports the line of each violation', () => {
    expect(findViolations('const a = 1;\nconst b = Math.random();')).toEqual([
      { line: 2, rule: 'Math.random', text: 'const b = Math.random();' },
    ]);
  });
});
