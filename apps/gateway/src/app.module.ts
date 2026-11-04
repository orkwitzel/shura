import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ClientGateway } from './client.gateway';
import { ClockModule } from './clock';
import { type Env, validateEnv } from './config';
import { ValidationPipe } from './errors';
import { HealthModule } from './health';

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
    HealthModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: ValidationPipe }, ClientGateway],
})
export class AppModule {}
