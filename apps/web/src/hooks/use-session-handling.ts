import { handlingFrames, type SoloSession } from '@shura/client-core';
import { useSettings } from '@shura/client-core/react';
import { useEffect } from 'react';

/**
 * Keeps `session`'s handling (DAS, ARR and the soft-drop factor, design §7.2) in step with the
 * settings: a change made in the settings screen reaches the input engine from the next frame, so
 * over a paused game it applies when the game resumes (design §7.4).
 */
export function useSessionHandling(session: SoloSession): void {
  const handling = useSettings((settings) => settings.handling);
  useEffect(() => session.setInput({ handling: handlingFrames(handling) }), [session, handling]);
}
