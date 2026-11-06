import { type ErrorBody, errorBody } from '@shura/protocol';

/**
 * Why a room refuses a member's action (design §10.1), as the `exception` it sends that member.
 * A refusal is a routed message to one session, never an error on the link (design §8.7).
 */
export const REFUSALS = {
  notInLobby: errorBody('wrong_phase', 'Not in the lobby.'),
  startsItself: errorBody('wrong_phase', 'Quick-match rooms start by themselves.'),
  noRematch: errorBody('wrong_phase', 'Rematch comes after a quick-match result.'),
  notSeated: errorBody('wrong_phase', 'Take a seat to play.'),
  notHost: errorBody('not_host', 'Only the host starts the match.'),
  nobodyReady: errorBody('wrong_phase', 'Waiting for another player to be ready.'),
  full: errorBody('room_full', 'That room is full.'),
  seatsInLobby: errorBody('wrong_phase', 'Seats move in the lobby.'),
  noFreeSeat: errorBody('no_free_seat', 'Every seat is taken.'),
  nicknameInLobby: errorBody('wrong_phase', 'Nicknames change in the lobby.'),
  // In the words of `ERRORS`, as the gateway says it too.
  noRoom: errorBody('room_not_found'),
} as const satisfies Record<string, ErrorBody>;
