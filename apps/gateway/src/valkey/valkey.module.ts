import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LIMIT_DEFAULTS } from '@shura/protocol';
import { createValkeyStores, type Stores } from '@shura/valkey';
import { CLOCK, type Clock } from '../clock';
import type { Env } from '../config';

/**
 * The injection token of the shared state (design §9.5): one `Stores` from `@shura/valkey`, every
 * interface on one backing store. Valkey in the service; tests override it with
 * `createMemoryStores`, the same object in both apps of an integration test.
 */
export const STORES = Symbol('Stores');

/** Closes the stores' connections as the app shuts down. */
@Injectable()
class StoresCloser implements OnApplicationShutdown {
  constructor(@Inject(STORES) private readonly stores: Stores) {}

  async onApplicationShutdown(): Promise<void> {
    await this.stores.close();
  }
}

/** Provides the `@shura/valkey` stores by their `STORES` token, to every module. */
@Global()
@Module({
  providers: [
    {
      provide: STORES,
      inject: [ConfigService, CLOCK],
      useFactory: (config: ConfigService<Env, true>, clock: Clock): Stores =>
        createValkeyStores(config.get('VALKEY_URL', { infer: true }), {
          prefix: config.get('VALKEY_PREFIX', { infer: true }),
          now: () => clock.now(),
          requeueCooldownMs: LIMIT_DEFAULTS.quickMatchCooldownMs,
        }),
    },
    StoresCloser,
  ],
  exports: [STORES],
})
export class ValkeyModule {}
