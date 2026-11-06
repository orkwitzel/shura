import { handlingFrames, type OnlineSession } from '@shura/client-core';
import { useSettingsStore } from '@shura/client-core/react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { type OpenOnlineSession, openOnlineSession } from '@/lib/open-online-session';
import { clearSessionToken, readSessionToken, saveSessionToken } from '@/lib/session-token';

/**
 * How online sessions are opened: over the browser's `WebSocket` to this page's gateway. Tests
 * provide a fake here.
 */
export const OpenOnlineSessionContext = createContext<OpenOnlineSession>(openOnlineSession);

export interface UseOnlineSessionResult {
  /** The session, once there's a nickname to open it with; `null` before. */
  readonly session: OnlineSession | null;
  /** Closes the session and opens a new one: *Retry* after the connection failed. */
  readonly retry: () => void;
}

/**
 * The app's online session (design §13.1, Online session) for as long as the component is mounted:
 * the online routes mount it when the player enters `/online` or `/r/:code`, and unmount it as they
 * go back to the main menu, which closes it (leaving the room). It opens once `nickname` is set,
 * with the saved handling, and never again for a later change of name: that goes to the server
 * with `setNickname`.
 *
 * The session's token is kept in `sessionStorage` (design §10.2), so a reload comes back as the
 * same session, in the same seat. Closing on purpose forgets it, so the next visit starts afresh,
 * with the nickname the settings have by then.
 */
export function useOnlineSession(nickname: string | undefined): UseOnlineSessionResult {
  const open = useContext(OpenOnlineSessionContext);
  const settings = useSettingsStore();
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The token this mount comes back with. A ref, read once: Strict Mode's rehearsal unmount clears
  // the stored token, and the session opened after it must still use it.
  const token = useRef<string | undefined>(undefined);
  const read = useRef(false);
  if (!read.current) {
    read.current = true;
    token.current = readSessionToken();
  }
  const name = useRef(nickname);
  name.current = nickname;
  const named = nickname !== undefined;

  useEffect(() => {
    const nickname = name.current;
    if (nickname === undefined) return;
    const opened = open({
      nickname,
      sessionToken: token.current,
      handling: handlingFrames(settings.getState().handling),
    });
    setSession(opened);
    const unsubscribe = opened.subscribe(({ connection, sessionToken }) => {
      if (connection.status !== 'connected' || sessionToken === null) return;
      token.current = sessionToken;
      saveSessionToken(sessionToken);
    });
    return () => {
      unsubscribe();
      opened.close();
      clearSessionToken();
      setSession(null);
    };
  }, [open, settings, named, attempt]);

  return { session, retry: () => setAttempt((count) => count + 1) };
}
