// Shared client logic for web and CLI (docs/design.md §13.1).
export { ACTION_LABELS, type Direction, PIECE_ACTIONS } from './actions';
export {
  type Bindings,
  type RebindChange,
  type RebindSwap,
  rebind,
  rebindChange,
  unbind,
} from './bindings';
export type { Clock } from './clock';
export { countdownLabel } from './countdown';
export { formatFrames, formatHeadline, formatScore } from './format';
export { FRAMES_PER_SECOND, framesToMs, msToFrames } from './frames';
export {
  DEFAULT_HANDLING,
  DEFAULT_HANDLING_SETTINGS,
  HANDLING_RANGES,
  type Handling,
  type HandlingSettings,
  handlingFrames,
  stepHandling,
} from './handling';
export {
  type AutoShift,
  createInputEngine,
  type InputEngine,
  type InputSettings,
  type KeyEvent,
} from './input-engine';
export { SOLO_MODES, SOLO_PRESETS, type SoloMode } from './modes';
export { personalBestLine, personalBestSummary } from './personal-best';
export {
  createRecordsStore,
  type GameRun,
  type PersonalBest,
  type PersonalBestOutcome,
  RECORDS_VERSION,
  type Records,
  type RecordsStore,
  type RecordsStoreOptions,
  type RunStats,
  replayPersonalBest,
} from './records';
export {
  createSettingsStore,
  defaultSettings,
  type Effects,
  SETTINGS_VERSION,
  type Settings,
  type SettingsChange,
  type SettingsStore,
  type SettingsStoreOptions,
} from './settings';
export {
  hasEnded,
  headlineOf,
  type SoloHeadline,
  type SoloResult,
  soloResult,
  timeLeft,
} from './solo-result';
export {
  type AppliedActionsListener,
  createSoloSession,
  type SessionEvent,
  type SessionEventListener,
  type SoloPhase,
  type SoloSession,
  type SoloSessionOptions,
  type SoloSessionState,
} from './solo-session';
export { errorMessage, type Storage, type StoredKind } from './storage';
export type { AppStores, Store } from './store';
export {
  type Ansi16,
  type ArtRect,
  type CanvasDrawing,
  type Rgb,
  SKINS,
  type Skin,
  type SkinId,
  THEMES,
  type Theme,
  type ThemeColor,
  type ThemeId,
  type TranslucentColor,
  type WebColors,
} from './themes';
export {
  type Loaded,
  loadStored,
  type Migration,
  type Parsed,
  parseVersioned,
  type VersionedFormat,
} from './versioned';
