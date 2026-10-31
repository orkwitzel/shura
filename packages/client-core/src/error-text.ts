import type { ErrorCode } from '@shura/protocol';

/**
 * The plain words both clients show for the abuse limits (design §11): what happened, and what to
 * do about it. The server's own message for these can be terse or technical.
 */
const LIMIT_TEXT: Partial<Record<ErrorCode, string>> = {
  rate_limited: 'Too many tries. Wait a minute and try again.',
  too_many_connections: 'Too many connections from your network. Try again in a minute.',
  room_limit: 'Too many rooms created. Try again in a minute.',
};

/** What the UIs say for an `error` with `code`: the plain words for a limit, else the server's. */
export function errorText(code: ErrorCode, serverMessage: string): string {
  return LIMIT_TEXT[code] ?? serverMessage;
}
