import type { PlayerKind } from '@shura/protocol';
import type { Stores } from '@shura/valkey';

/** A session a `hello` came back as: who it is, and the room it was in. */
export interface RestoredSession {
  readonly session: {
    readonly id: string;
    readonly token: string;
    nickname: string;
    readonly kind: PlayerKind;
  };
  readonly roomCode?: string;
}

/**
 * The session a `hello`'s token names, if it hasn't expired (design §10.2): the same id and
 * nickname as before, and the room it was in. `kind` is the new hello's, as nothing else says it.
 */
export async function restoreSession(
  stores: Pick<Stores, 'sessions'>,
  token: string,
  kind: PlayerKind,
): Promise<RestoredSession | undefined> {
  const record = await stores.sessions.get(token);
  if (!record) return undefined;
  return {
    session: { id: record.sessionId, token, nickname: record.nickname, kind },
    ...(record.roomCode !== undefined && { roomCode: record.roomCode }),
  };
}
