// Every `/api` request carries the client's versions in these headers, and the gateway's
// `VersionGuard` refuses a mismatch with `version_mismatch` (426) (design §8.3).

/** The header with the client's `PROTOCOL_VERSION`. */
export const PROTOCOL_VERSION_HEADER = 'Shura-Protocol';

/** The header with the client's `ENGINE_VERSION`. */
export const ENGINE_VERSION_HEADER = 'Shura-Engine';
