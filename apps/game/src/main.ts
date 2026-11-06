import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Env } from './config';
import { configureApp } from './configure-app';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app);
await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }));
