// Re-records the expected hash of every recorded match in recorded-matches/ (docs/design.md §5.3).
import { recordAll } from '../tests/support/recorded-matches';

for (const { file, changed } of recordAll()) {
  console.log(`${changed ? 're-recorded' : 'unchanged  '} ${file}`);
}
