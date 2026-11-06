import { applyDecorators, SetMetadata, UseGuards, UseInterceptors } from '@nestjs/common';
import type { RateLimitKey } from './ip-limits.service';
import { RATE_LIMIT, RateLimitGuard, RateLimitInterceptor } from './rate-limit.guard';

/**
 * Puts a route or a `ClientGateway` handler under one of the per-IP limits of design §11
 * (`RATE_LIMITS`): over HTTP and on the socket alike. Exempt addresses aren't limited.
 */
export const RateLimit = (key: RateLimitKey): MethodDecorator =>
  applyDecorators(
    SetMetadata(RATE_LIMIT, key),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor),
  );
