import { createOnlineSession, type OnlineSession } from '@shura/client-core';
import { createGameService, type GameService } from '@shura/game';
import { createMemoryStores, type Stores } from '@shura/valkey';
import { pino } from 'pino';
import { createGateway, type Gateway } from '../../src/gateway';
import type { GatewayLimits } from '../../src/limits';
import { type FakeTime, fakeTime } from './fake-time';
import { memoryConnect, memoryDial } from './memory-network';

/** The game pod's address in the registry. */
export const POD_ADDRESS = 'game-1:8081';

/** Gateway, one game pod and in-memory Valkey in one process, on one fake clock (design §14). */
export interface OnlineWorld {
  readonly time: FakeTime;
  readonly stores: Stores;
  readonly game: GameService;
  readonly gateway: Gateway;
  /** A client: client-core's real online session, connected to the gateway in memory. */
  client(nickname: string): OnlineSession;
}

export interface OnlineWorldOptions {
  /** The gateway's limits, where they differ from the defaults. */
  readonly limits?: Partial<GatewayLimits>;
}

export async function onlineWorld(options: OnlineWorldOptions = {}): Promise<OnlineWorld> {
  // A whole number of 50 ms steps from 0, so each step of 50 ms is exactly 3 frames.
  const time = fakeTime(1_800_000_000_000);
  const cooldown = options.limits?.quickMatchCooldownMs;
  // The quick-match cooldown is the queue's, as in the gateway's main.ts.
  const stores = createMemoryStores({
    now: time.now,
    ...(cooldown !== undefined && { requeueCooldownMs: cooldown }),
  });
  const logger = pino({ level: 'silent' });
  const game = createGameService({
    clock: time,
    stores,
    podId: 'game-1',
    address: POD_ADDRESS,
    logger,
  });
  await game.start();
  const gateway = createGateway({
    clock: time,
    stores,
    dial: memoryDial({ [POD_ADDRESS]: game }),
    logger,
    ...(options.limits && { limits: options.limits }),
  });
  const connect = memoryConnect(gateway);
  return {
    time,
    stores,
    game,
    gateway,
    client: (nickname) =>
      createOnlineSession({
        url: 'ws://gateway.test',
        connect,
        clock: time,
        nickname,
        clientVersion: 'test',
      }),
  };
}
