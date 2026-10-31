import { Text } from 'ink';

/** The ping's colour (design §13.2): green under 80 ms, yellow under 150 ms, red above. */
export function pingColor(ms: number): 'green' | 'yellow' | 'red' {
  return ms < 80 ? 'green' : ms < 150 ? 'yellow' : 'red';
}

/** Your ping, in its colour, or a dash before the first pong. */
export function PingText({ ping }: { ping: number | null }) {
  if (ping === null) return <Text dimColor>● — ms</Text>;
  return <Text color={pingColor(ping)}>● {Math.round(ping)} ms</Text>;
}
