/**
 * Bumped whenever game outcomes change. Clients and game pods must agree on it to play together
 * (docs/design.md §8.3), and the replay-hash suite fails if outcomes change without a bump.
 */
export const ENGINE_VERSION = 2;
