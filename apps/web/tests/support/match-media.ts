/**
 * A `matchMedia` the tests control: a query matches when the test has said so with `setMedia`,
 * and its listeners hear each change, as a browser's would when the system setting changes.
 */
const matching = new Map<string, boolean>();
const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();

function mediaQueryList(query: string): MediaQueryList {
  const own = listeners.get(query) ?? new Set();
  listeners.set(query, own);
  const list = {
    media: query,
    get matches() {
      return matching.get(query) ?? false;
    },
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      own.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      own.delete(listener),
    addListener: (listener: (event: MediaQueryListEvent) => void) => own.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => own.delete(listener),
    dispatchEvent: () => true,
  };
  return list as unknown as MediaQueryList;
}

/** Puts this `matchMedia` in place of the window's. */
export function installMatchMedia(): void {
  window.matchMedia = mediaQueryList;
}

/** Makes `query` match, or stop matching, telling its listeners. */
export function setMedia(query: string, matches: boolean): void {
  matching.set(query, matches);
  for (const listener of listeners.get(query) ?? []) {
    listener({ matches, media: query } as MediaQueryListEvent);
  }
}

/** No query matches, as on a desktop with the default system settings. */
export function resetMatchMedia(): void {
  matching.clear();
  listeners.clear();
}
