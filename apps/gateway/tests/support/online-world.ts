import type { Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import {
  type Connect,
  createOnlineSession,
  type Fetch,
  type OnlineSession,
  type TimerClock,
  webSocketConnect,
} from '@shura/client-core';
// The one place an app imports another (design §14): the gateway's integration tests run the
// game service beside it, from its source entries.
import { AppModule as GameAppModule } from '@shura/game/app.module';
import { CLOCK as GAME_CLOCK } from '@shura/game/clock';
import { configureApp as configureGame } from '@shura/game/configure-app';
import { NEW_MATCH, type NewMatch } from '@shura/game/match';
import { RoomsService as GameRooms } from '@shura/game/rooms';
import { STORES as GAME_STORES } from '@shura/game/valkey';
import type { PlayerKind } from '@shura/protocol';
import { createMemoryStores, type Stores } from '@shura/valkey';
import { WebSocket } from 'ws';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/clock';
import { type GatewayLimits, LIMITS, limitsOf, validateEnv } from '../../src/config';
import { configureApp } from '../../src/configure-app';
import { STORES } from '../../src/valkey';
import { type FakeTime, fakeTime } from './fake-time';

/**
 * Every match's seed in a world that doesn't choose one, so a test deals the same pieces every
 * run and a failure reproduces.
 */
export const DEFAULT_MATCH_SEED = 7;

/** The limits of a world that doesn't set its own: the defaults, with loopback exempt. */
export const WORLD_LIMITS: GatewayLimits = {
  ...limitsOf(validateEnv({})),
  exemptIps: ['127.0.0.1', '::1'],
};

/**
 * The fake clock's start: a whole number of 50 ms steps, so each `advance(STEP_MS)` is exactly 3
 * frames of a match.
 */
const START = 1_800_000_000_000;

/**
 * The gateway and one game pod booted as they ship (`configureApp`, `listen(0)`), on one fake
 * clock and one in-memory Valkey, with real sockets and `fetch` between them and their clients
 * (design §14).
 */
export interface OnlineWorld {
  readonly time: FakeTime;
  readonly stores: Stores;
  readonly gateway: INestApplication;
  readonly game: INestApplication;
  /** The gateway's HTTP origin: what clients take as their server URL. */
  readonly serverUrl: string;
  /** The game pod's rooms: `verifiedGames(code)` is the server's copy of each player's game. */
  readonly rooms: GameRooms;
  /** A client: client-core's real online session, connecting to the gateway. */
  client(nickname: string, options?: ClientOptions): OnlineSession;
  /** Closes every client and both apps. */
  close(): Promise<void>;
}

export interface ClientOptions {
  /** `bot`, as the bot tool says in its `hello`. */
  readonly kind?: PlayerKind;
  /** Wraps the client's socket connections: to hold or drop its messages (`faultySocket()`). */
  readonly through?: (connect: Connect) => Connect;
  /** Wraps the client's `fetch`: to fail or delay its HTTP calls. */
  readonly fetchThrough?: (fetch: Fetch) => Fetch;
  /** Wraps the client's clock: to stall its game loop (`stallableClock()`). */
  readonly clockThrough?: (clock: TimerClock) => TimerClock;
}

export interface OnlineWorldOptions {
  /** The seed of every match: `DEFAULT_MATCH_SEED` unless given. */
  readonly seed?: number;
  /**
   * The gateway's abuse limits (design §11) that differ from `WORLD_LIMITS`: the defaults, with
   * loopback exempt from the per-IP limits as `pnpm dev` has it, since every client of a test
   * comes from it.
   */
  readonly limits?: Partial<GatewayLimits>;
  /** Replaces more of the gateway's providers. */
  readonly gateway?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** Replaces more of the game service's providers. */
  readonly game?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Counts every chunk of TCP traffic in or out of `app`'s server (client sockets, room links), so
 * `settle()` waits while messages are still moving between the apps, not only to the clients.
 */
function countTraffic(app: INestApplication, time: FakeTime): void {
  const server = app.getHttpServer() as Server;
  server.on('connection', (socket: Socket) => {
    socket.on('data', () => time.traffic());
    const write = socket.write.bind(socket) as (...args: unknown[]) => boolean;
    socket.write = ((...args: unknown[]) => {
      time.traffic();
      return write(...args);
    }) as Socket['write'];
  });
}

/** Starts `app` on a free port and gives its HTTP origin. */
async function listen(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

export async function onlineWorld(options: OnlineWorldOptions = {}): Promise<OnlineWorld> {
  const { seed = DEFAULT_MATCH_SEED } = options;
  const time = fakeTime(START);
  const stores = createMemoryStores({ now: time.now });
  let matches = 0;
  const newMatch: NewMatch = () => ({ matchId: `match-${++matches}`, seed });

  const gameModule = await (options.game ?? ((builder) => builder))(
    Test.createTestingModule({ imports: [GameAppModule] })
      .overrideProvider(GAME_CLOCK)
      .useValue(time)
      .overrideProvider(GAME_STORES)
      .useValue(stores)
      .overrideProvider(NEW_MATCH)
      .useValue(newMatch),
  ).compile();
  const game = gameModule.createNestApplication({ bufferLogs: true });
  configureGame(game);
  countTraffic(game, time);
  await listen(game);

  const gatewayModule = await (options.gateway ?? ((builder) => builder))(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(time)
      .overrideProvider(STORES)
      .useValue(stores)
      .overrideProvider(LIMITS)
      .useValue({ ...WORLD_LIMITS, ...options.limits }),
  ).compile();
  const gateway = gatewayModule.createNestApplication({ bufferLogs: true });
  configureApp(gateway);
  countTraffic(gateway, time);
  const serverUrl = await listen(gateway);

  // The pod's first heartbeat goes once it listens: rooms can be placed after it.
  for (let tries = 0; (await stores.podHealth.list()).length === 0; tries++) {
    if (tries > 100) throw new Error('the game pod never beat');
    await time.settle();
  }

  const clients: OnlineSession[] = [];
  // Every message a client receives or sends, and every request, keeps `settle()` waiting.
  const counted =
    (connect: Connect): Connect =>
    (url, handlers) => {
      const socket = connect(url, {
        open: () => {
          time.traffic();
          handlers.open();
        },
        message: (text) => {
          time.traffic();
          handlers.message(text);
        },
        close: () => {
          time.traffic();
          handlers.close();
        },
      });
      return {
        send: (text) => {
          time.traffic();
          socket.send(text);
        },
        close: () => socket.close(),
      };
    };
  const countedFetch =
    (fetch: Fetch): Fetch =>
    async (url, init) => {
      const done = time.pending();
      try {
        return await fetch(url, init);
      } finally {
        done();
      }
    };
  const realConnect = webSocketConnect((url) => new WebSocket(url));
  const realFetch: Fetch = (url, init) => fetch(url, init);

  return {
    time,
    stores,
    gateway,
    game,
    serverUrl,
    rooms: game.get(GameRooms),
    client(nickname, { kind, through, fetchThrough, clockThrough } = {}) {
      const session = createOnlineSession({
        serverUrl,
        connect: counted(through ? through(realConnect) : realConnect),
        fetch: countedFetch(fetchThrough ? fetchThrough(realFetch) : realFetch),
        clock: clockThrough ? clockThrough(time) : time,
        nickname,
        clientVersion: 'test',
        ...(kind && { kind }),
      });
      clients.push(session);
      return session;
    },
    async close() {
      for (const client of clients) client.close();
      await time.settle();
      await gateway.close();
      await game.close();
    },
  };
}
