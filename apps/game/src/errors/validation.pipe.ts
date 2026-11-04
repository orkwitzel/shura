import { createZodValidationPipe } from 'nestjs-zod';
import { InvalidMessageException } from './invalid-message.exception';

/**
 * Validates every `createZodDto` DTO against its `@shura/protocol` schema and rejects a failure
 * with `invalid_message`. Global for HTTP (`APP_PIPE`); WS gateway classes take it through
 * `@WsProtocol()`, since Nest's global pipes don't reach them.
 */
export const ValidationPipe = createZodValidationPipe({
  createValidationException: (error) => new InvalidMessageException(error),
});
