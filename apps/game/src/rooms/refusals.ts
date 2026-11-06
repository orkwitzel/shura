import { type ErrorBody, errorBody } from '@shura/protocol';

/**
 * Why a room refuses a member's action (design §10.1), as the `exception` it sends that member.
 * A refusal is a routed message to one session, never an error on the link (design §8.7).
 */
export const REFUSALS = {
  notInLobby: errorBody('wrong_phase', 'Not in the lobby.'),
  notSeated: errorBody('wrong_phase', 'Take a seat to play.'),
  notHost: errorBody('not_host', 'Only the host starts the match.'),
  nobodyReady: errorBody('wrong_phase', 'Waiting for another player to be ready.'),
  full: errorBody('room_full', 'That room is full.'),
  noRoom: errorBody('room_not_found', 'There is no room with that code.'),
} as const satisfies Record<string, ErrorBody>;
