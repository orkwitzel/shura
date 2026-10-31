import { useMediaQuery } from './use-media-query';

/**
 * Whether this looks like a touch device with no keyboard (design §13.2, Devices): its main input
 * can't hover and is coarse, as a finger is. A tablet with a keyboard and trackpad attached
 * usually reports a fine pointer, so it can play.
 */
export function useNeedsKeyboard(): boolean {
  return useMediaQuery('(hover: none) and (pointer: coarse)');
}
