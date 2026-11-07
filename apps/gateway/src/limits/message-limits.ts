import {
  applyDecorators,
  type CallHandler,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { errorBody, isErrorBody } from '@shura/protocol';
import { catchError, EMPTY, type Observable, throwError } from 'rxjs';
import type { WebSocket } from 'ws';
import { DroppedMessageException, InvalidMessageException } from '../errors';
import { ConnectionLimitsService } from './connection-limits.service';

/**
 * Takes every message from its connection's token bucket (design §11), before any other check:
 * the first over it gets `rate_limited`, the rest are dropped unanswered until one fits again.
 */
@Injectable()
export class MessageRateGuard implements CanActivate {
  constructor(private readonly limits: ConnectionLimitsService) {}

  canActivate(context: ExecutionContext): boolean {
    switch (this.limits.message(context.switchToWs().getClient<WebSocket>())) {
      case 'allowed':
        return true;
      case 'refused':
        throw new WsException(errorBody('rate_limited', 'Too many messages. Slow down.'));
      case 'dropped':
        throw new DroppedMessageException();
    }
  }
}

/**
 * Counts a message that fails its schema (the validation pipe's `invalid_message`) toward closing
 * the connection, as `ConnectionLimitsService.invalid` does for one that isn't a message at all.
 */
@Injectable()
export class InvalidMessageInterceptor implements NestInterceptor {
  constructor(private readonly limits: ConnectionLimitsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (!(error instanceof InvalidMessageException)) return throwError(() => error);
        const body = error.getResponse();
        this.limits.invalid(
          context.switchToWs().getClient<WebSocket>(),
          isErrorBody(body) ? body : undefined,
        );
        return EMPTY;
      }),
    );
  }
}

/**
 * Put on `ClientGateway`: every message is under its connection's own limits (design §11), the
 * message rate and the invalid-message count, which no address is exempt from.
 */
export const ConnectionLimits = (): ClassDecorator =>
  applyDecorators(UseGuards(MessageRateGuard), UseInterceptors(InvalidMessageInterceptor));
