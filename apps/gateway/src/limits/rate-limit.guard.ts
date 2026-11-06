import type { IncomingMessage } from 'node:http';
import {
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { ERRORS } from '@shura/protocol';
import { catchError, from, mergeMap, type Observable, throwError } from 'rxjs';
import type { WebSocket } from 'ws';
import { errorBodyOf } from '../errors';
import { ConnectionLimitsService } from './connection-limits.service';
import { IpLimitsService, type RateLimitKey } from './ip-limits.service';

/** The metadata key `@RateLimit` sets. */
export const RATE_LIMIT = 'shura:rateLimit';

/** The limit on the handler `context` runs, and the address of the client it runs for. */
function limitOf(
  context: ExecutionContext,
  reflector: Reflector,
  ips: IpLimitsService,
  connections: ConnectionLimitsService,
): { key: RateLimitKey; ip: string } | undefined {
  const key = reflector.get<RateLimitKey | undefined>(RATE_LIMIT, context.getHandler());
  if (!key) return undefined;
  const ip =
    context.getType() === 'http'
      ? ips.ipOf(context.switchToHttp().getRequest<IncomingMessage>())
      : connections.ipOf(context.switchToWs().getClient<WebSocket>());
  return ip === undefined ? undefined : { key, ip };
}

/**
 * Refuses a request over its `@RateLimit` per-IP limit (design §11): `HttpException` with the
 * code's status over HTTP, `exception{ code }` on the socket.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ips: IpLimitsService,
    private readonly connections: ConnectionLimitsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limit = limitOf(context, this.reflector, this.ips, this.connections);
    if (!limit) return true;
    const refusal = await this.ips.check(limit.key, limit.ip);
    if (!refusal) return true;
    throw context.getType() === 'http'
      ? new HttpException(refusal, ERRORS[refusal.code].status)
      : new WsException(refusal);
  }
}

/** Counts the failures of a `@RateLimit` that counts them (failed joins), against the client's IP. */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly ips: IpLimitsService,
    private readonly connections: ConnectionLimitsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const limit = limitOf(context, this.reflector, this.ips, this.connections);
    if (!limit) return next.handle();
    return next.handle().pipe(
      catchError((error: unknown) => {
        const code = errorBodyOf(error)?.code;
        if (code === undefined) return throwError(() => error);
        return from(this.ips.failed(limit.key, limit.ip, code)).pipe(
          mergeMap(() => throwError(() => error)),
        );
      }),
    );
  }
}
