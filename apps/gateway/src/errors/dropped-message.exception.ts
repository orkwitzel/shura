/**
 * A socket message the gateway drops without an answer: one more over a connection's message rate
 * once its `rate_limited` has been sent (design §11), so a flood isn't answered with one.
 * `WsExceptionFilter` sends nothing for it.
 */
export class DroppedMessageException extends Error {
  override readonly name = 'DroppedMessageException';

  constructor() {
    super('message dropped');
  }
}
