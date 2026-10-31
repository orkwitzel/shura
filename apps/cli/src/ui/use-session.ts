import type { SoloSession, SoloSessionState } from '@shura/client-core';
import { useSyncExternalStore } from 'react';

/**
 * A session's state, re-rendering on each change (design §13.1). Every read of session state in
 * the CLI goes through here. Ink throttles the output to about 30 fps.
 */
export function useSession(session: SoloSession): SoloSessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}
