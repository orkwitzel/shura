import { type Api, createApi } from '@shura/client-core';

/**
 * client-core's API client to this page's own origin, whose `/api` Vite forwards to the gateway in
 * dev and the ingress in production (design §13.2): what `useRoomLookup` reads through.
 */
export const serverApi: Api = createApi({ serverUrl: window.location.origin });
