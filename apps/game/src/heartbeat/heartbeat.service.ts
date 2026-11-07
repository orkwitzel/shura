import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { ENGINE_VERSION } from '@shura/engine';
import type { Stores } from '@shura/valkey';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CLOCK, type Clock } from '../clock';
import type { Env } from '../config';
import { DrainingIndicator } from '../health';
import { RoomsService } from '../rooms';
import { STORES } from '../valkey';

/** How often the pod writes its heartbeat (design §9.1): every 2 s, with a 5 s TTL. */
export const HEARTBEAT_MS = 2000;

/**
 * The pod's heartbeat in Valkey (design §9.1, §9.2): its address (`POD_IP` and the port it
 * listens on), room count, `engineVersion` and whether it's draining. Gateways place new rooms by
 * it. The first beat goes as soon as the server listens, so the port is known (`listen(0)` in
 * tests picks one), then one every 2 s. The heartbeat is dropped as the pod shuts down.
 */
@Injectable()
export class HeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {
  #stop: () => void = () => {};

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(STORES) private readonly stores: Stores,
    private readonly config: ConfigService<Env, true>,
    private readonly adapterHost: HttpAdapterHost,
    private readonly rooms: RoomsService,
    private readonly draining: DrainingIndicator,
    @InjectPinoLogger(HeartbeatService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    const server = this.#server();
    if (server.listening) this.#beat();
    else server.once('listening', () => this.#beat());
    this.#stop = this.clock.every(HEARTBEAT_MS, () => this.#beat());
  }

  async onApplicationShutdown(): Promise<void> {
    this.#stop();
    await this.stores.podHealth.remove(this.#podId()).catch(() => {});
  }

  #beat(): void {
    const address = this.#server().address() as AddressInfo | null;
    if (!address) return;
    this.stores.podHealth
      .beat({
        podId: this.#podId(),
        address: `${this.config.get('POD_IP', { infer: true })}:${address.port}`,
        roomCount: this.rooms.roomCount,
        engineVersion: ENGINE_VERSION,
        draining: this.draining.isDraining,
      })
      .catch((error: unknown) => this.logger.error({ err: error }, 'heartbeat failed'));
  }

  #podId(): string {
    return this.config.get('POD_ID', { infer: true });
  }

  #server(): Server {
    return this.adapterHost.httpAdapter.getHttpServer() as Server;
  }
}
