import { type Connect, webSocketConnect } from '@shura/client-core';

/** Online play over Node's own `WebSocket` (design §8.2): the CLI bundles no `ws`. */
export const nodeConnect: Connect = webSocketConnect((url) => new WebSocket(url));
