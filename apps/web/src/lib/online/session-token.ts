/** The `sessionStorage` key of the online session's token. */
const KEY = 'shura.sessionToken';

// The online session's token lives in `sessionStorage` (design §10.2): one per tab, kept across a
// reload so the session comes back as itself, gone when the tab closes. A browser that blocks
// storage throws on access; the token is then simply not kept, and a reload starts afresh.

/** The token this tab's last online session was given, if it's still kept. */
export function readSessionToken(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveSessionToken(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Not kept: see above.
  }
}

/** Forgets the token, as the player leaves online play on purpose. */
export function clearSessionToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}
