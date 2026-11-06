// The engine's recorded 1v1 (design §5.3), as the game service's tests read it (its test-only
// `exports` entry): one reader for both apps, which the gateway's tests run together (design §14).
export { RECORDED_PIECE_ACTIONS, RECORDED_SEED } from '@shura/game/tests/recorded-1v1';
