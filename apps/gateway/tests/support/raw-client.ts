import { ENGINE_VERSION } from '@shura/engine';
import { PROTOCOL_VERSION, type ServerMessage } from '@shura/protocol';
import { WebSocket } from 'ws';
import { postJson, VERSION_HEADERS } from './api';

/**
 * A bare client of the gateway over a real socket: it sends whatever the test says, valid or
 * not, and keeps everything that comes back. For the abuse limits (design §11), which a
 * well-behaved online session never trips. Headers (`X-Forwarded-For`) let a test fake the
 * client's IP behind `TRUSTED_PROXIES`.
 */
export interface RawClient {
  /** Every message received, in order (parsed, but not checked against a schema). */
  readonly received: ServerMessage[];
  /** Whether the gateway closed the connection. */
  readonly closed: boolean;
  /** The close code, once closed (1009 for a message over `maxPayload`). */
  readonly closeCode: number | null;
  /** Sends `message` as JSON, or a string as it is. */
  send(message: object | string): void;
  /**
   * Creates a session over `POST /api/sessions` (with the client's headers) and says a valid
   * `hello` with its token.
   */
  hello(nickname?: string): Promise<void>;
  /** The `exception` codes received, in order. */
  exceptions(): string[];
  close(): void;
}

/** Opens a raw client to the gateway at `serverUrl` (its HTTP origin), once its socket is open. */
export async function rawClient(
  serverUrl: string,
  headers: Record<string, string> = {},
): Promise<RawClient> {
  const socket = new WebSocket(`${serverUrl.replace(/^http/, 'ws')}/ws`, { headers });
  const received: ServerMessage[] = [];
  let closeCode: number | null = null;
  socket.on('message', (data) => received.push(JSON.parse(String(data)) as ServerMessage));
  socket.on('close', (code) => {
    closeCode = code;
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const client: RawClient = {
    received,
    get closed() {
      return closeCode !== null;
    },
    get closeCode() {
      return closeCode;
    },
    send: (message) => socket.send(typeof message === 'string' ? message : JSON.stringify(message)),
    async hello(nickname = 'Ada') {
      const res = await postJson(
        `${serverUrl}/api/sessions`,
        { nickname },
        { ...VERSION_HEADERS, ...headers },
      );
      const { sessionToken } = (await res.json()) as { sessionToken: string };
      client.send({
        event: 'hello',
        data: {
          protocolVersion: PROTOCOL_VERSION,
          engineVersion: ENGINE_VERSION,
          clientVersion: 'test',
          sessionToken,
        },
      });
    },
    exceptions: () =>
      received.flatMap((message) => (message.event === 'exception' ? [message.data.code] : [])),
    close: () => socket.close(),
  };
  return client;
}
