import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
// One message at a time per socket, in order (ADR 0014).
app.useWebSocketAdapter(new WsAdapter(app, { maxConcurrentMessages: 1 }));
app.enableShutdownHooks();
await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }));
