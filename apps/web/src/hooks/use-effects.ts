import type { Effects } from '@shura/client-core';
import { useSettings } from '@shura/client-core/react';
import { useReducedMotion } from './use-reduced-motion';

/**
 * The *Effects* setting in force (design §13.2, Effects): the setting once the player has chosen
 * one, and while it's unset, *Reduced* when the system asks for reduced motion
 * (`prefers-reduced-motion`) and *Full* otherwise, following the system as it changes.
 */
export function useEffects(): Effects {
  const chosen = useSettings((settings) => settings.effects);
  const reducedMotion = useReducedMotion();
  return chosen ?? (reducedMotion ? 'reduced' : 'full');
}
