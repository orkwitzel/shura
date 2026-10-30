// Fails when a pull request description leaves a template section empty.
// The sections come from .github/pull_request_template.md, so the template is the only list.
// Usage: PR_BODY="..." node scripts/check-pr-body.mjs
import { readFileSync } from 'node:fs';

const template = readFileSync(
  new URL('../.github/pull_request_template.md', import.meta.url),
  'utf8',
);
const body = process.env.PR_BODY ?? '';

const sections = (markdown) => {
  const result = new Map();
  let current;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1];
      result.set(current, []);
    } else if (current) {
      result.get(current).push(line);
    }
  }
  return result;
};

const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '').trim();

const expected = [...sections(template).keys()];
const actual = sections(body);
const problems = [];

for (const name of expected) {
  const lines = actual.get(name);
  if (!lines) {
    problems.push(`missing section "## ${name}"`);
    continue;
  }
  const content = stripComments(lines.join('\n'));
  if (!content) {
    problems.push(`section "## ${name}" is empty`);
  } else if (/^\s*- \[ \]/m.test(content)) {
    problems.push(`section "## ${name}" has unticked checkboxes`);
  }
}

if (problems.length > 0) {
  console.error('The PR description does not follow the template:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('See CONTRIBUTING.md#pull-requests.');
  process.exit(1);
}
console.log('PR description OK.');
