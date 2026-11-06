import type { RoomMode } from '@shura/protocol';

/**
 * What the player asked online play for: quick-match, a new room of a mode, or the room with a code
 * (the *Play online* menu, or `shura quick`, `create` and `join`).
 */
export type OnlineStart =
  | { readonly action: 'quick' }
  | { readonly action: 'create'; readonly mode: RoomMode }
  | { readonly action: 'join'; readonly code: string };
