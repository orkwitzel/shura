import { useMediaQuery } from './use-media-query';

/**
 * Whether the system asks for reduced motion (`prefers-reduced-motion`), following it as it
 * changes. The *Effects* setting defaults from it (design §13.2).
 */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
