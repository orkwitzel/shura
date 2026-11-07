import { FFA, type ModeSettings, ONE_VS_ONE } from '@shura/engine';
import type { RoomMode } from '../messages/fields';

/**
 * The engine settings of each room mode (design §4): an FFA plays by 1v1's rules. The server's
 * verification engines and the clients' engines are both made from them, so they agree bit for bit.
 */
export const MATCH_SETTINGS: Readonly<Record<RoomMode, ModeSettings>> = {
  '1v1': ONE_VS_ONE,
  ffa: FFA,
};
