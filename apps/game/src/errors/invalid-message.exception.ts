import { HttpException } from '@nestjs/common';
import { ERRORS, errorBody } from '@shura/protocol';

/**
 * A message or request body that fails its zod schema (`invalid_message`). Thrown by the
 * validation pipe on both transports: over HTTP Nest answers with its `{ code, message }` body and
 * status, and on a socket `WsExceptionFilter` sends the same body as `exception`.
 */
export class InvalidMessageException extends HttpException {
  constructor(cause: unknown) {
    super(errorBody('invalid_message'), ERRORS.invalid_message.status, { cause });
  }
}
