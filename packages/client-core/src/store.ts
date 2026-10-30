/**
 * A subscribable store (design §13.1), the shape React's `useSyncExternalStore` takes. `getState`
 * returns the same object until the state changes, then a new one, and every subscriber is
 * called after each change.
 */
export interface Store<State> {
  getState(): State;
  /** Calls `listener` after each change. Returns a function that unsubscribes it. */
  subscribe(listener: () => void): () => void;
}

/** A store's state and its subscribers, for the module that owns the state. */
export class StoreState<State> implements Store<State> {
  #state: State;
  readonly #listeners = new Set<() => void>();

  constructor(state: State) {
    this.#state = state;
  }

  getState = (): State => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    // A wrapper, so subscribing the same function twice calls it twice and unsubscribes once.
    const call = () => listener();
    this.#listeners.add(call);
    return () => {
      this.#listeners.delete(call);
    };
  };

  /** Replaces the state and notifies every subscriber. */
  set(state: State): void {
    this.#state = state;
    for (const listener of [...this.#listeners]) listener();
  }
}
