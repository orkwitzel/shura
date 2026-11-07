import { pingQuality } from '@shura/client-core';
import { Text } from 'ink';

/** The ping's colour by how good it is (design §13.2): green, yellow or red. */
const PING_COLORS = { good: 'green', fair: 'yellow', poor: 'red' } as const;

/** Your ping, in its colour, or a dash before the first pong. */
export function PingText({ ping }: { ping: number | null }) {
  if (ping === null) return <Text dimColor>● — ms</Text>;
  return <Text color={PING_COLORS[pingQuality(ping)]}>● {Math.round(ping)} ms</Text>;
}
