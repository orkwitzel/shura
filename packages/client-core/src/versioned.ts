import type { z } from 'zod';
import { errorMessage, type Storage, type StoredKind } from './storage';

/** Turns data saved at one version into the shape of the next. */
export type Migration = (older: Record<string, unknown>) => Record<string, unknown>;

/** A stored format (design §13.1, Storage): its current version, its schema and its migrations. */
export interface VersionedFormat<T> {
  readonly version: number;
  readonly schema: z.ZodType<T>;
  /** The migration from each older version to the one after it, by the older version. */
  readonly migrations: Readonly<Record<number, Migration>>;
}

/** Stored data read back: its value, or what's wrong with it. */
export type Parsed<T> = { readonly value: T } | { readonly problem: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads stored JSON: migrated from an older version one version at a time, then checked against
 * the schema. The problem names each field that's wrong.
 */
export function parseVersioned<T>(text: string, format: VersionedFormat<T>): Parsed<T> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { problem: 'it is not valid JSON' };
  }
  if (!isObject(data) || !Number.isInteger(data.version)) {
    return { problem: 'it has no version' };
  }
  let version = data.version as number;
  if (version > format.version) {
    return { problem: `it is from a newer version of Shura (version ${version})` };
  }
  while (version < format.version) {
    const migrate = format.migrations[version];
    if (!migrate) return { problem: `version ${version} is unknown` };
    data = { ...migrate(data as Record<string, unknown>), version: version + 1 };
    version++;
  }
  const result = format.schema.safeParse(data);
  if (result.success) return { value: result.data };
  const problems = result.error.issues.map(
    ({ path, message }) => `${path.map(String).join('.') || 'the file'}: ${message}`,
  );
  return { problem: problems.join('; ') };
}

/**
 * Stored data loaded: its value, what's wrong with it (`invalid`), or why it couldn't be read
 * (`unreadable`). `null` when nothing is stored yet. Each store decides what a problem means.
 */
export type Loaded<T> =
  | { readonly value: T }
  | { readonly invalid: string }
  | { readonly unreadable: string }
  | null;

/** Reads `kind` from `storage` and parses it against `format` (see `parseVersioned`). */
export function loadStored<T>(
  storage: Storage,
  kind: StoredKind,
  format: VersionedFormat<T>,
): Loaded<T> {
  try {
    const text = storage.read(kind);
    if (text === null) return null;
    const parsed = parseVersioned(text, format);
    return 'value' in parsed ? parsed : { invalid: parsed.problem };
  } catch (error) {
    return { unreadable: errorMessage(error) };
  }
}
