/**
 * An error from the server, over HTTP (a `{ code, message }` body) or on the socket (`exception`):
 * one type, so both UIs handle errors one way (design §13.1, API client). `code` is a key of
 * `ERRORS` from `@shura/protocol`, a code added after this client was built, or `unreachable` when
 * the server couldn't be reached at all.
 */
export class OnlineError extends Error {
  override readonly name = 'OnlineError';
  readonly code: string;
  /** The HTTP status, for an error that came over HTTP. */
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Whether `value` is an `OnlineError`. */
export function isOnlineError(value: unknown): value is OnlineError {
  return value instanceof OnlineError;
}

/** The text of an `unreachable` failure. */
export const UNREACHABLE_TEXT = "Can't reach the server.";
