import { readdirSync, readFileSync } from 'node:fs';

const SRC_DIR = new URL('../../src/', import.meta.url);

/** Math functions that stay in integers when given integers. */
const INTEGER_MATH = ['imul', 'trunc', 'floor', 'ceil', 'min', 'max', 'abs', 'sign', 'clz32'];

/**
 * What design §5.1 forbids in the engine, as source patterns. Floats from `/` can't be told apart
 * from integer division by pattern, so review has to catch those.
 */
const RULES: { rule: string; pattern: RegExp }[] = [
  { rule: 'Math.random', pattern: /\bMath\.random\b/ },
  { rule: 'Date', pattern: /\bDate\b/ },
  { rule: 'performance', pattern: /\bperformance\b/ },
  {
    rule: 'timer',
    pattern: /\b(setTimeout|setInterval|setImmediate|requestAnimationFrame|queueMicrotask)\b/,
  },
  { rule: 'float literal', pattern: /(?<![\w$])(\d[\d_]*)?\.\d|(?<![\w$])\d[\d_]*e-\d/i },
  {
    rule: 'float Math function',
    pattern: new RegExp(`\\bMath\\.(?!(${[...INTEGER_MATH, 'random'].join('|')})\\b)\\w+`),
  },
  { rule: 'parseFloat', pattern: /\bparseFloat\b/ },
  { rule: 'locale', pattern: /\btoLocale\w*|\blocaleCompare\b|\bIntl\b/ },
];

export interface Violation {
  line: number;
  rule: string;
  text: string;
}

export function findViolations(source: string): Violation[] {
  // Blank out comments, keeping line breaks so line numbers still match.
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  );
  const violations: Violation[] = [];
  code.split('\n').forEach((text, index) => {
    for (const { rule, pattern } of RULES) {
      if (pattern.test(text)) violations.push({ line: index + 1, rule, text: text.trim() });
    }
  });
  return violations;
}

/** The engine's rule code: every source file under `src/`. */
export function engineSources(): { file: string; source: string }[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => ({ file, source: readFileSync(new URL(file, SRC_DIR), 'utf8') }));
}
