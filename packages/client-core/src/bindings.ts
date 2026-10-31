import type { PieceActionType } from '@shura/engine';

/**
 * The keys bound to each game control, by the platform's own key names (the CLI's `left`, `x`; the
 * web's). A key is bound to one action at most.
 */
export type Bindings = Readonly<Record<PieceActionType, readonly string[]>>;

/** The keys bound to more than one action. */
export function sharedKeys(bindings: Bindings): string[] {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const keys of Object.values(bindings)) {
    for (const key of keys) (seen.has(key) ? shared : seen).add(key);
  }
  return [...shared];
}

/**
 * Binds `key` to `action` in its `slot` (its first key is slot 0; the slot after its last adds a
 * key). A key already in use swaps (design §7.4): the action that had it takes the key this slot
 * had, or just loses it when this slot was empty.
 */
export function rebind(
  bindings: Bindings,
  action: PieceActionType,
  slot: number,
  key: string,
): Bindings {
  const next = Object.fromEntries(
    Object.entries(bindings).map(([name, keys]) => [name, [...keys]]),
  ) as Record<PieceActionType, string[]>;
  const own = next[action];
  const replaced = own[slot];
  if (replaced === undefined) {
    for (const keys of Object.values(next)) {
      const at = keys.indexOf(key);
      if (at !== -1) keys.splice(at, 1);
    }
    own.push(key);
  } else {
    for (const keys of Object.values(next)) {
      const at = keys.indexOf(key);
      if (at !== -1) keys[at] = replaced;
    }
    own[slot] = key;
  }
  return next;
}

/** Removes the key in `action`'s `slot`, if there is one. */
export function unbind(bindings: Bindings, action: PieceActionType, slot: number): Bindings {
  return { ...bindings, [action]: bindings[action].filter((_, index) => index !== slot) };
}
