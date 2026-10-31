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
  type BindingsOf,
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
export type { Storage, StoredKind } from './storage';
export type { Store } from './store';
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
