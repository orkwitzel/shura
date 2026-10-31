import { ENGINE_VERSION } from '@shura/engine';
import { PROTOCOL_VERSION, type ServerMessage } from '@shura/protocol';
import type { Gateway } from '../../src/gateway';
import { peerPair } from './memory-network';

/**
 * A bare client of the gateway, connected in memory from `ip`: it sends whatever the test says,
 * valid or not, and keeps everything that comes back. For the abuse limits (design §11), which a
 * well-behaved online session never trips.
 */
export interface RawClient {
  /** Every message received, in order. */
  readonly received: ServerMessage[];
  /** Whether the gateway closed the connection. */
  readonly closed: boolean;
  /** Sends `message` as JSON, or a string as it is. */
  send(message: object | string): void;
  /** Sends a valid `hello`. */
  hello(nickname?: string): void;
  /** The `error` codes received, in order. */
  errors(): string[];
  close(): void;
}

export function rawClient(gateway: Gateway, ip: string): RawClient {
  const [clientEnd, gatewayEnd] = peerPair();
  const received: ServerMessage[] = [];
  let closed = false;
  clientEnd.listen({
    message: (text) => received.push(JSON.parse(text) as ServerMessage),
    close: () => {
      closed = true;
    },
  });
  gateway.accept(gatewayEnd, ip);
  const client: RawClient = {
    received,
    get closed() {
      return closed;
    },
    send: (message) =>
      clientEnd.send(typeof message === 'string' ? message : JSON.stringify(message)),
    hello: (nickname = 'Ada') =>
      client.send({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        engineVersion: ENGINE_VERSION,
        clientVersion: 'test',
        nickname,
      }),
    errors: () => received.flatMap((message) => (message.type === 'error' ? [message.code] : [])),
    close: () => clientEnd.close(),
  };
  return client;
}
