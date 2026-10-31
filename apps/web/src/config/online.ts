/** The path of the gateway's WebSocket on the page's own origin (design §13.2). */
export const GATEWAY_PATH = '/ws';

/**
 * The web client's version as the server's logs show it (`hello.clientVersion`). The web isn't
 * versioned apart from its deploys; the versions that matter are the protocol's and the engine's.
 */
export const CLIENT_VERSION = 'web';
