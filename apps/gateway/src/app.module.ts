import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ClientGateway } from './client.gateway';
import { ClockModule } from './clock';
import { type Env, validateEnv } from './config';
import { ValidationPipe } from './errors';
import { HealthModule } from './health';
import { PlayModule } from './play';
import { QuickMatchModule } from './quick-match';
import { RoomLinksModule } from './room-links';
import { RoomsModule } from './rooms';
import { SessionsModule } from './sessions';
import { ValkeyModule } from './valkey';
import { VersionGuard } from './versions';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          base: { service: 'gateway', pod: config.get('POD_ID', { infer: true }) },
          // Health probes would flood the log.
          autoLogging: { ignore: (req) => req.url === '/livez' || req.url === '/readyz' },
          ...(config.get('NODE_ENV', { infer: true }) === 'development' && {
            transport: { target: 'pino-pretty' },
          }),
        },
      }),
    }),
    ClockModule,
    ValkeyModule,
    HealthModule,
    SessionsModule,
    RoomLinksModule,
    RoomsModule,
    PlayModule,
    QuickMatchModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ValidationPipe },
    { provide: APP_GUARD, useClass: VersionGuard },
    ClientGateway,
  ],
})
export class AppModule {}
