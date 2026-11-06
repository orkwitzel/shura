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
  type Api,
  type ApiOptions,
  createApi,
  type Fetch,
  type FetchResponse,
  socketUrl,
} from './online/api';
export { ClockSync, PING_SAMPLES, type PingSample } from './online/clock-sync';
export { isOnlineError, OnlineError } from './online/online-error';
export {
  type BatchFrame,
  type InputBatch,
  MATCH_SETTINGS,
  type OnlineMatchPhase,
  type OnlineMatchState,
  type OnlinePlayerGame,
  type PlayerOut,
  type RosterEntry,
  totalLines,
} from './online/online-match';
export {
  CONNECT_PINGS,
  type ConnectionFailure,
  createOnlineSession,
  type GarbageRouting,
  type OnlineConnection,
  type OnlineRoom,
  type OnlineSession,
  type OnlineSessionOptions,
  type OnlineSessionState,
  PING_EVERY_MS,
  type QuickMatchStatus,
  RECONNECT_BACKOFF_MS,
  RECONNECT_QUICK_MS,
  type RoutingListener,
} from './online/online-session';
export {
  type Connect,
  type OnlineSocket,
  type SocketHandlers,
  type StandardWebSocket,
  webSocketConnect,
} from './online/online-socket';
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
export type { Clock, TimerClock } from './shared/clock';
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
export { countdownLabel, matchCountdownLabel } from './view/countdown';
export { errorText, NICKNAME_PROBLEMS } from './view/error-text';
export {
  formatFrames,
  formatHeadline,
  formatScore,
  formatWait,
  pingQuality,
} from './view/format';
export { ordinal, type PlacedMatch, placeOf } from './view/places';
export {
  type LobbyRole,
  lobbyRole,
  MODE_NAMES,
  type RoomChange,
  roomChanges,
} from './view/room';
