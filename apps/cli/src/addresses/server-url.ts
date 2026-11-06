/**
 * The server when nothing else names one: its HTTP origin. `pnpm cli` plays against `pnpm dev`'s
 * gateway (design §14); the production default compiled into the published build comes with
 * deployment (M5).
 */
export const DEFAULT_SERVER = 'http://127.0.0.1:8080';

/** Where the server for online play can be named, most important first. */
export interface ServerSources {
  /** `--server`. */
  readonly flag?: string | undefined;
  /** `SHURA_SERVER`. */
  readonly env?: string | undefined;
  /** `server` in `config.json`. */
  readonly config?: string | undefined;
}

/**
 * The server for online play (design §13.3): `--server` > `SHURA_SERVER` > `config.json` > the
 * default. An empty value counts as none. It's the HTTP origin: the API is under `/api` and the
 * socket at `ws(s)://…/ws`.
 */
export function serverUrl({ flag, env, config }: ServerSources): string {
  return [flag, env, config].find((url) => url !== undefined && url !== '') ?? DEFAULT_SERVER;
}

/**
 * Where the web client is, for a room's link (design §13.3): `SHURA_WEB`, else the server, since in
 * production the web client and the gateway share an origin. In dev they don't (Vite on :5173, the
 * gateway on :8080), so `pnpm cli` sets `SHURA_WEB` to Vite's.
 */
export function webUrl({ env, server }: { env?: string | undefined; server: string }): string {
  return env !== undefined && env !== '' ? env : server;
}
