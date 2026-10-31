// Shared client logic for web and CLI (docs/design.md §13.1).
export type { Clock } from './clock';
export {
  type AutoShift,
  createInputEngine,
  DEFAULT_HANDLING,
  type Handling,
  type InputEngine,
  type InputSettings,
  type KeyEvent,
} from './input-engine';
export { type SoloHeadline, type SoloResult, soloResult } from './solo-result';
export {
  createSoloSession,
  type SessionEvent,
  type SessionEventListener,
  type SoloMode,
  type SoloPhase,
  type SoloSession,
  type SoloSessionOptions,
  type SoloSessionState,
} from './solo-session';
export type { Store } from './store';
