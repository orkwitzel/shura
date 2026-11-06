import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// The CLI's one test against the real server (design §14): the gateway and a game pod from their
// source entries, as the gateway's integration tests run them.
import { AppModule as GameAppModule } from '@shura/game/app.module';
import { configureApp as configureGame } from '@shura/game/configure-app';
import { STORES as GAME_STORES } from '@shura/game/valkey';
import { AppModule as GatewayAppModule } from '@shura/gateway/app.module';
import { LIMITS, limitsOf, validateEnv } from '@shura/gateway/config';
import { configureApp as configureGateway } from '@shura/gateway/configure-app';
import { STORES as GATEWAY_STORES } from '@shura/gateway/valkey';
import { createMemoryStores } from '@shura/valkey';

/** The gateway and one game pod, booted as they ship, on real time and one in-memory Valkey. */
export interface OnlineServers {
  /** The gateway's HTTP origin: what `--server` names. */
  readonly url: string;
  close(): Promise<void>;
}

/** Starts `app` on a free loopback port and gives its HTTP origin. */
async function listen(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/**
 * Boots both apps (`Test.createTestingModule` + `listen(0)`, design §14) with their real clocks,
 * and waits for the pod's first heartbeat, so rooms can be placed on it.
 */
export async function startOnlineServers(): Promise<OnlineServers> {
  const stores = createMemoryStores();
  const gameModule = await Test.createTestingModule({ imports: [GameAppModule] })
    .overrideProvider(GAME_STORES)
    .useValue(stores)
    .compile();
  const game = gameModule.createNestApplication({ bufferLogs: true });
  configureGame(game);
  await listen(game);

  const gatewayModule = await Test.createTestingModule({ imports: [GatewayAppModule] })
    .overrideProvider(GATEWAY_STORES)
    .useValue(stores)
    // Every client of the test comes from loopback, as in `pnpm dev`.
    .overrideProvider(LIMITS)
    .useValue({ ...limitsOf(validateEnv({})), exemptIps: ['127.0.0.1', '::1'] })
    .compile();
  const gateway = gatewayModule.createNestApplication({ bufferLogs: true });
  configureGateway(gateway);
  const url = await listen(gateway);

  for (let tries = 0; (await stores.podHealth.list()).length === 0; tries++) {
    if (tries > 100) throw new Error('the game pod never beat');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return {
    url,
    async close() {
      await gateway.close();
      await game.close();
      await stores.close();
    },
  };
}
