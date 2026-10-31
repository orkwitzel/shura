// The React hooks both UIs share (design §13.1, ADR 0012): `@shura/client-core/react`. The root
// entry has no React in it; only this one does.
import { useStore } from 'zustand';
import type { SoloSession, SoloSessionState } from './solo-session';

/**
 * A session's whole state, re-rendering after each change: the board's view, which changes every
 * frame anyway.
 */
export function useSession(session: SoloSession): SoloSessionState;
/**
 * The slice of a session's state that `selector` picks, re-rendering only when it changes (by
 * `Object.is`). The engine state inside is live, so select the values the component shows, not
 * `state.engine` itself.
 */
export function useSession<T>(session: SoloSession, selector: (state: SoloSessionState) => T): T;
export function useSession(
  session: SoloSession,
  selector: (state: SoloSessionState) => unknown = (state) => state,
): unknown {
  return useStore(session, selector);
}
