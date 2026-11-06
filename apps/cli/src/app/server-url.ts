/**
 * The server when nothing else names one: its HTTP origin. `pnpm cli` plays against `pnpm dev`'s
 * gateway (design §14); the production default compiled into the published build comes with
 * deployment (M5).
 */
export const DEFAULT_SERVER = 'http://localhost:8080';

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
