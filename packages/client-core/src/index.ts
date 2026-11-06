// Shared client logic for web and CLI (docs/design.md §13.1).
export { ACTION_LABELS, type Direction, PIECE_ACTIONS } from './input/actions';
export {
  type Bindings,
  type RebindChange,
  type RebindSwap,
  rebind,
  rebindChange,
  unbind,
} from './input/bindings';
export {
  DEFAULT_HANDLING,
  DEFAULT_HANDLING_SETTINGS,
  HANDLING_RANGES,
  type Handling,
  type HandlingSettings,
  handlingFrames,
  handlingSteps,
  stepHandling,
} from './input/handling';
export {
  type AutoShift,
  createInputEngine,
  type InputEngine,
  type InputSettings,
  type KeyEvent,
} from './input/input-engine';
export {
  createSettingsStore,
  defaultSettings,
  type Effects,
  SETTINGS_VERSION,
  type Settings,
  type SettingsChange,
  type SettingsStore,
  type SettingsStoreOptions,
} from './settings/settings';
export { errorMessage, type Storage, type StoredKind } from './settings/storage';
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
} from './settings/themes';
export {
  type Loaded,
  loadStored,
  type Migration,
  type Parsed,
  parseVersioned,
  type VersionedFormat,
} from './settings/versioned';
export type { Clock } from './shared/clock';
export { FRAMES_PER_SECOND, framesToMs, msToFrames } from './shared/frames';
export type { AppStores, Store } from './shared/store';
export { SOLO_MODES, SOLO_PRESETS, type SoloMode } from './solo/modes';
export { personalBestLine, personalBestSummary } from './solo/personal-best';
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
} from './solo/records';
export {
  hasEnded,
  headlineOf,
  type SoloHeadline,
  type SoloResult,
  soloResult,
  timeLeft,
} from './solo/solo-result';
export {
  type AppliedActionsListener,
  createSoloSession,
  type SessionEventListener,
  type SoloPhase,
  type SoloSession,
  type SoloSessionOptions,
  type SoloSessionState,
} from './solo/solo-session';
export { type BackToBackTracker, isBackToBack, trackBackToBack } from './view/back-to-back';
export {
  type Callout,
  type CalloutKind,
  type CalloutListener,
  lockCallouts,
  onCallouts,
} from './view/callouts';
export { countdownLabel } from './view/countdown';
export { formatFrames, formatHeadline, formatScore } from './view/format';
