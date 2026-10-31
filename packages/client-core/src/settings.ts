import type { PieceActionType } from '@shura/engine';
import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { PIECE_ACTIONS } from './actions';
import { type Bindings, sharedKeys } from './bindings';
import { DEFAULT_HANDLING_SETTINGS, HANDLING_RANGES, type HandlingSettings } from './handling';
import { errorMessage, type Storage } from './storage';
import type { Store } from './store';
import { SKINS, type SkinId, THEMES, type ThemeId } from './themes';
import { loadStored, type Migration, type VersionedFormat } from './versioned';

/** The settings format's version. Raise it, with a migration, when the format changes. */
export const SETTINGS_VERSION = 1;

/** The web's effects setting (design §13.2). Unset, the web follows `prefers-reduced-motion`. */
export type Effects = 'full' | 'reduced' | 'off';

/** Everything the settings hold (design §13.1, Settings model; §13.3, Config). */
export interface Settings {
  readonly version: typeof SETTINGS_VERSION;
  /** The nickname shown online (M4). */
  readonly nickname?: string;
  /** The server to play online on (M4). */
  readonly server?: string;
  readonly handling: HandlingSettings;
  readonly bindings: Bindings;
  readonly ghost: boolean;
  readonly theme: ThemeId;
  readonly skin: SkinId;
  /** Sound volume, 0 (off) to 100 in steps of 10. The web's only. */
  readonly volume: number;
  /** The web's only. */
  readonly effects?: Effects;
}

/** What `update` can change: anything but the version. */
export type SettingsChange = Partial<Omit<Settings, 'version'>>;

/** The settings that nothing has changed yet, with a platform's default bindings. */
export function defaultSettings(bindings: Bindings): Settings {
  return {
    version: SETTINGS_VERSION,
    handling: DEFAULT_HANDLING_SETTINGS,
    bindings,
    ghost: true,
    theme: 'indigo',
    skin: 'pixel',
    volume: 50,
  };
}

/**
 * The settings schema. A field a hand-edited file leaves out takes its default, so the file only
 * needs what differs; a field that's there must be valid.
 */
function settingsSchema(defaults: Settings): z.ZodType<Settings, unknown> {
  const range = ({ min, max }: { min: number; max: number }) => z.int().min(min).max(max);
  const handling = z
    .object({
      das: range(HANDLING_RANGES.das).default(defaults.handling.das),
      arr: range(HANDLING_RANGES.arr).default(defaults.handling.arr),
      softDropFactor: z
        .union([range(HANDLING_RANGES.softDropFactor), z.literal('instant')])
        .default(defaults.handling.softDropFactor),
    })
    .default(defaults.handling);
  const keys = z.array(z.string().min(1));
  const bindings = z
    .object(
      Object.fromEntries(
        PIECE_ACTIONS.map((action) => [action, keys.default([...defaults.bindings[action]])]),
      ) as Record<PieceActionType, z.ZodDefault<typeof keys>>,
    )
    .default(defaults.bindings as Record<PieceActionType, string[]>)
    .superRefine((value, context) => {
      const shared = sharedKeys(value);
      if (shared.length > 0) {
        context.addIssue({
          code: 'custom',
          message: `${shared.join(', ')} bound to more than one action`,
        });
      }
    });
  return z.object({
    version: z.literal(SETTINGS_VERSION),
    nickname: z.string().optional(),
    server: z.string().optional(),
    handling,
    bindings,
    ghost: z.boolean().default(defaults.ghost),
    theme: z.enum(Object.keys(THEMES) as [ThemeId, ...ThemeId[]]).default(defaults.theme),
    skin: z.enum(Object.keys(SKINS) as [SkinId, ...SkinId[]]).default(defaults.skin),
    volume: z.int().min(0).max(100).multipleOf(10).default(defaults.volume),
    effects: z.enum(['full', 'reduced', 'off']).optional(),
  });
}

/** Migrations from older settings versions, by the older version. None yet. */
const SETTINGS_MIGRATIONS: Readonly<Record<number, Migration>> = {};

export interface SettingsStoreOptions {
  readonly storage: Storage;
  /** The platform's default bindings (design §7.4). */
  readonly bindings: Bindings;
}

/** The settings, loaded from storage when created, and the settings rules' writes. */
export interface SettingsStore extends Store<Settings> {
  /**
   * Why the stored settings couldn't be used, so the defaults are in use: a message to show, or
   * `null`. The stored text stays as it was until the settings are saved.
   */
  readonly problem: string | null;
  /** Changes the settings in the store, not yet in storage. Throws if the result isn't valid. */
  update(change: SettingsChange): void;
  /** Writes the settings to storage. Returns why it couldn't, or `null`. */
  save(): string | null;
  /**
   * Why the last save failed, or `null` if it worked (or nothing was saved yet): the CLI tells the
   * player again on the way out.
   */
  readonly saveProblem: string | null;
}

/** The settings from `storage`, or the defaults with a message if they can't be used. */
export function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  return new SettingsStoreImpl(options);
}

class SettingsStoreImpl implements SettingsStore {
  readonly problem: string | null = null;
  saveProblem: string | null = null;
  readonly #storage: Storage;
  readonly #format: VersionedFormat<Settings>;
  readonly #store: StoreApi<Settings>;

  constructor({ storage, bindings }: SettingsStoreOptions) {
    const defaults = defaultSettings(bindings);
    this.#storage = storage;
    this.#format = {
      version: SETTINGS_VERSION,
      schema: settingsSchema(defaults),
      migrations: SETTINGS_MIGRATIONS,
    };
    const loaded = loadStored(storage, 'settings', this.#format);
    let settings = defaults;
    if (loaded && 'value' in loaded) settings = loaded.value;
    else if (loaded)
      this.problem = this.#unusable('invalid' in loaded ? loaded.invalid : loaded.unreadable);
    this.#store = createStore<Settings>()(() => settings);
  }

  getState: SettingsStore['getState'] = () => this.#store.getState();
  getInitialState: SettingsStore['getInitialState'] = () => this.#store.getInitialState();
  subscribe: SettingsStore['subscribe'] = (listener) => this.#store.subscribe(listener);

  update = (change: SettingsChange): void => {
    const next = this.#format.schema.safeParse({ ...this.getState(), ...change });
    if (!next.success) throw new RangeError(`invalid settings: ${next.error.message}`);
    this.#store.setState(next.data, true);
  };

  save = (): string | null => {
    try {
      this.#storage.write('settings', `${JSON.stringify(this.getState(), null, 2)}\n`);
      this.saveProblem = null;
    } catch (error) {
      this.saveProblem = `Couldn't save ${this.#storage.describe('settings')}: ${errorMessage(error)}`;
    }
    return this.saveProblem;
  };

  #unusable(why: string): string {
    return `${this.#storage.describe('settings')} can't be used (${why}), so Shura is using the defaults.`;
  }
}
