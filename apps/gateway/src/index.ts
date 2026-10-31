// What other apps' in-process tests wire up (design §14): the CLI's tests run a real gateway on a
// local port. Nothing in the gateway's own source imports this.
export { type ServerClock, systemClock } from './clock';
export { createGateway, type Gateway, type GatewayOptions } from './gateway';
export type { DialGame, Peer, PeerListeners } from './peer';
export { createHttpServer } from './server';
