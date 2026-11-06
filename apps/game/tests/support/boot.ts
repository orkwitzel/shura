import type { AddressInfo } from 'node:net';
import type { INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { WebSocket } from 'ws';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

export interface Booted {
  readonly app: INestApplication;
  /** `http://localhost:<port>` */
  readonly http: string;
  /** `ws://localhost:<port>` */
  readonly ws: string;
}

export interface BootOptions {
  /** Test-only modules (fixtures) to run alongside `AppModule`. */
  readonly imports?: readonly Type[];
  /** Replaces providers (`overrideProvider(CLOCK)` and so on) before the app is built. */
  readonly override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/** Boots the game service as `main.ts` does (`configureApp`), on a free port. */
export const boot = async ({
  imports = [],
  override = (builder) => builder,
}: BootOptions = {}): Promise<Booted> => {
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule, ...imports] }),
  ).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, http: `http://localhost:${port}`, ws: `ws://localhost:${port}` };
};

/** Opens a socket to `url` and waits until it's open. */
export const connect = async (url: string): Promise<WebSocket> => {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
};

/** The next message `socket` receives, parsed. */
export const nextMessage = (socket: WebSocket): Promise<unknown> =>
  new Promise((resolve) => {
    socket.once('message', (data) => resolve(JSON.parse(String(data))));
  });
