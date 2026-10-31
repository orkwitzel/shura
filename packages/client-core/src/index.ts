// Shared client logic for web and CLI (docs/design.md §13.1).
export { PIECE_ACTIONS } from './actions';
export type { Clock } from './clock';
export { formatFrames, formatHeadline, formatScore } from './format';
export { FRAMES_PER_SECOND, framesToMs, msToFrames } from './frames';
export {
  type AutoShift,
  createInputEngine,
  DEFAULT_HANDLING,
  type Direction,
  type Handling,
  type InputEngine,
  type InputSettings,
  type KeyEvent,
} from './input-engine';
export { SOLO_PRESETS, type SoloMode } from './modes';
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
  type Bindings,
  createSettingsStore,
  DEFAULT_HANDLING_SETTINGS,
  defaultSettings,
  type Effects,
  HANDLING_RANGES,
  type HandlingSettings,
  handlingFrames,
  rebind,
  SETTINGS_VERSION,
  type Settings,
  type SettingsChange,
  type SettingsStore,
  type SettingsStoreOptions,
  stepHandling,
  unbind,
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
export type { Storage, StoredKind } from './storage';
export type { AppStores, Store } from './store';
export {
  type Ansi16,
  SHURA_DARK,
  SKINS,
  type Skin,
  type SkinId,
  THEMES,
  type Theme,
  type ThemeColor,
  type ThemeId,
} from './themes';
export { type Migration, type Parsed, parseVersioned, type VersionedFormat } from './versioned';
