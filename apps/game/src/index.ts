// What the in-process integration tests in `apps/gateway/tests` wire up (design §14). Nothing in
// `gateway`'s own source imports this: gateway and game talk only through protocol messages.
export type { ServerClock } from './clock';
export { createGameService, type GameService, type GameServiceOptions } from './game-service';
export type { VerifiedGame } from './match';
export type { Peer, PeerListeners } from './peer';
export { QUICK_MATCH_ARRIVAL_MS } from './room';
