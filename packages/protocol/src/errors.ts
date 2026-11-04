/**
 * Every error `code` the services send, with its default text and HTTP status (docs/design.md
 * §8.7). On the socket an error is `exception{ code, message }`; over HTTP it's a
 * `{ code, message }` body with the code's status. Clients match on `code`.
 */
export const ERRORS = {
  invalid_message: { message: 'The message is malformed.', status: 400 },
  internal_error: { message: 'Something went wrong on the server.', status: 500 },
} as const satisfies Record<string, { readonly message: string; readonly status: number }>;

/** A key of `ERRORS`. */
export type ErrorCode = keyof typeof ERRORS;

/** The body of an error, on the socket (`exception`) and over HTTP alike. */
export interface ErrorBody {
  readonly code: ErrorCode;
  readonly message: string;
}

/** The `ErrorBody` of `code`, with its default text unless `message` is given. */
export const errorBody = (code: ErrorCode, message: string = ERRORS[code].message): ErrorBody => ({
  code,
  message,
});
