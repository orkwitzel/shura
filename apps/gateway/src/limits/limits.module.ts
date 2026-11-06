import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env, type GatewayLimits, LIMITS, limitsFrom } from '../config';
import { ConnectionLimitsService } from './connection-limits.service';
import { IpLimitsService } from './ip-limits.service';
import { InvalidMessageInterceptor, MessageRateGuard } from './message-limits';
import { RateLimitGuard, RateLimitInterceptor } from './rate-limit.guard';

/**
 * The abuse limits (design §11), and the `LIMITS` they come from. Global, since `@RateLimit` puts
 * its guard on routes of other features (sessions, rooms) and on `ClientGateway`.
 */
@Global()
@Module({
  providers: [
    {
      provide: LIMITS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): GatewayLimits => limitsFrom(config),
    },
    IpLimitsService,
    ConnectionLimitsService,
    RateLimitGuard,
    RateLimitInterceptor,
    MessageRateGuard,
    InvalidMessageInterceptor,
  ],
  exports: [
    LIMITS,
    IpLimitsService,
    ConnectionLimitsService,
    RateLimitGuard,
    RateLimitInterceptor,
    MessageRateGuard,
    InvalidMessageInterceptor,
  ],
})
export class LimitsModule {}
