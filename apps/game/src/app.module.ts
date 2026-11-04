import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { ENGINE_VERSION } from '@shura/engine';
import { LoggerModule } from 'nestjs-pino';
import { ClockModule } from './clock';
import { type Env, validateEnv } from './config';
import { ValidationPipe } from './errors';
import { HealthModule } from './health';
import { RoomLinkGateway } from './room-link.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          base: {
            service: 'game',
            pod: config.get('POD_ID', { infer: true }),
            engineVersion: ENGINE_VERSION,
          },
          // Health probes would flood the log.
          autoLogging: { ignore: (req) => req.url === '/livez' || req.url === '/readyz' },
          ...(config.get('NODE_ENV', { infer: true }) === 'development' && {
            transport: { target: 'pino-pretty' },
          }),
        },
      }),
    }),
    ClockModule,
    HealthModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: ValidationPipe }, RoomLinkGateway],
})
export class AppModule {}
