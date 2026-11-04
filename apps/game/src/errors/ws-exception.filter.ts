import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ERRORS, type ErrorBody, errorBody } from '@shura/protocol';
import { WebSocket } from 'ws';

const isErrorBody = (value: unknown): value is ErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  typeof value.code === 'string' &&
  Object.hasOwn(ERRORS, value.code) &&
  'message' in value &&
  typeof value.message === 'string';

/** The `ErrorBody` an exception carries, or `undefined` for an unexpected one. */
const bodyOf = (exception: unknown): ErrorBody | undefined => {
  if (exception instanceof WsException) {
    const error = exception.getError();
    return isErrorBody(error) ? error : undefined;
  }
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    return isErrorBody(response) ? response : undefined;
  }
  return undefined;
};

/**
 * Sends a WS handler's error to its socket as `exception{ code, message }` (docs/design.md §8.7).
 * Nest's own WS filter emits on the socket object, which a raw `ws` socket never sends. An
 * exception without a code from `ERRORS` is logged and sent as `internal_error`.
 */
@Catch()
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    let body = bodyOf(exception);
    if (body === undefined) {
      this.logger.error(exception);
      body = errorBody('internal_error');
    }
    const socket = host.switchToWs().getClient<WebSocket>();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: 'exception', data: body }));
    }
  }
}
