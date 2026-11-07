/**
 * Every error `code` the services send, with its default text and HTTP status (docs/design.md
 * §8.7). On the socket an error is `exception{ code, message }`; over HTTP it's a
 * `{ code, message }` body with the code's status. Clients match on `code`.
 */
export const ERRORS = {
  /** `protocolVersion` or `engineVersion` differs from the server's: the client must update. */
  version_mismatch: {
    message: 'A new version of Shura is out. Update to keep playing online.',
    status: 426,
  },
  /** A socket message other than `hello` or `ping` before `hello` succeeded, or a bad token. */
  session_required: { message: 'Start a session first.', status: 401 },
  /** A message or request body that isn't valid JSON or fails its schema. */
  invalid_message: { message: 'The message is malformed.', status: 400 },
  room_not_found: { message: 'There is no room with that code.', status: 404 },
  /** The room's spectator list is full (`MAX_SPECTATORS`). Joining a full set of seats spectates. */
  room_full: { message: 'That room is full.', status: 409 },
  nickname_invalid: {
    message: 'Nicknames are 1–16 letters, digits, spaces, _ or -, and some words are not allowed.',
    status: 400,
  },
  rate_limited: { message: 'Too many requests. Slow down and try again.', status: 429 },
  too_many_connections: { message: 'Too many connections from your address.', status: 429 },
  /** Too many rooms created from this address, or this session already hosts one. */
  room_limit: { message: 'Too many rooms created. Try again in a minute.', status: 429 },
  /** A host-only action from someone who isn't the host. */
  not_host: { message: 'Only the host can do that.', status: 403 },
  /**
   * An action the room's phase or the player's place in it doesn't allow: readying outside the
   * lobby, starting before another seated player is ready, creating a room from inside one.
   */
  wrong_phase: { message: "That can't be done right now.", status: 409 },
  /** `takeSeat` in a lobby whose seats are all taken (design §10.1). */
  no_free_seat: { message: 'Every seat is taken.', status: 409 },
  /** A room action from a session that isn't in a room. */
  not_in_room: { message: "You're not in a room.", status: 409 },
  /** No game server can take the room right now (none live, or no free room code). */
  unavailable: { message: 'No game server is available. Try again soon.', status: 503 },
  /** An exception without a code of its own: logged, and sent as this. */
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

/** Whether `value` is an `ErrorBody` with a code from `ERRORS`. */
export const isErrorBody = (value: unknown): value is ErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  typeof value.code === 'string' &&
  Object.hasOwn(ERRORS, value.code) &&
  'message' in value &&
  typeof value.message === 'string';
