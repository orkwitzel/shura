// Re-records the protocol's shape in tests/support/protocol-shape.json, which the shape test checks
// the schemas against (docs/design.md §8.3).
import { recordShape } from '../tests/support/shape';

console.log(recordShape() ? 're-recorded the protocol shape' : 'the protocol shape is unchanged');
