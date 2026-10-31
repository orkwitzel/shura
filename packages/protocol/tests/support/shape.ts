import { readFileSync, writeFileSync } from 'node:fs';
import type { z } from 'zod';
import {
  actionSchema,
  clientMessageSchema,
  gameToGatewaySchema,
  gatewayToGameSchema,
  PROTOCOL_VERSION,
  serverMessageSchema,
} from '../../src/index';

/**
 * The protocol's shape, as stored in `protocol-shape.json`: for each group of messages, each
 * message type's fields by path (`players[].seat`), each with a short description of its schema
 * (`number:safeint`, `enum(a|b)`, `string?` for an optional one). It's what the shape test compares
 * against, to catch a breaking change made without bumping `PROTOCOL_VERSION`.
 */
export interface ProtocolShape {
  protocolVersion: number;
  groups: Record<string, Record<string, Record<string, string>>>;
}

/** The message unions whose shape is stored. Actions are a group of their own. */
const GROUPS: Record<string, z.ZodType> = {
  clientToGateway: clientMessageSchema,
  gatewayToClient: serverMessageSchema,
  gatewayToGame: gatewayToGameSchema,
  gameToGateway: gameToGatewaySchema,
  action: actionSchema,
};

const SHAPE_FILE = new URL('./protocol-shape.json', import.meta.url);

/** The stored shape. */
export function storedShape(): ProtocolShape {
  return JSON.parse(readFileSync(SHAPE_FILE, 'utf8'));
}

/** Stores the current shape, returning whether it changed. */
export function recordShape(): boolean {
  const text = `${JSON.stringify(currentShape(), null, 2)}\n`;
  const changed = readFileSync(SHAPE_FILE, { encoding: 'utf8', flag: 'a+' }) !== text;
  if (changed) writeFileSync(SHAPE_FILE, text);
  return changed;
}

/** The shape of the protocol as the schemas are now. */
export function currentShape(): ProtocolShape {
  const groups: ProtocolShape['groups'] = {};
  for (const [group, schema] of Object.entries(GROUPS)) groups[group] = describeUnion(schema);
  return { protocolVersion: PROTOCOL_VERSION, groups };
}

/** The `type` values a discriminated union of messages (or actions) accepts. */
export function messageTypes(schema: z.ZodType): string[] {
  return Object.keys(describeUnion(schema));
}

/**
 * What's wrong with `current` against `stored`: an empty list if the current shape is the stored
 * one. A breaking change (a message or field removed or renamed, a field whose schema changed, a
 * new required field on an existing message) asks for a `PROTOCOL_VERSION` bump unless the version
 * already moved; anything else only asks for the shape to be re-recorded.
 */
export function shapeProblems(stored: ProtocolShape, current: ProtocolShape): string[] {
  const command = '`pnpm --filter @shura/protocol record-shape`';
  const rerecord = `Re-record the shape with ${command}.`;
  if (stored.protocolVersion !== current.protocolVersion) {
    return [
      `PROTOCOL_VERSION is ${current.protocolVersion}, but the stored shape is for version ${stored.protocolVersion}. ${rerecord}`,
    ];
  }

  const breaking: string[] = [];
  const additions: string[] = [];
  const groups = new Set([...Object.keys(stored.groups), ...Object.keys(current.groups)]);
  for (const group of groups) {
    const before = stored.groups[group] ?? {};
    const after = current.groups[group] ?? {};
    for (const [type, fields] of Object.entries(before)) {
      const now = after[type];
      if (!now) {
        breaking.push(`${group} message \`${type}\` was removed or renamed.`);
        continue;
      }
      for (const [path, description] of Object.entries(fields)) {
        const changed = now[path];
        if (changed === undefined) {
          breaking.push(`${group} \`${type}.${path}\` was removed or renamed.`);
        } else if (changed !== description) {
          const change = `${group} \`${type}.${path}\` changed from \`${description}\` to \`${changed}\`.`;
          (widensEnum(description, changed) ? additions : breaking).push(change);
        }
      }
      for (const path of Object.keys(now)) {
        if (path in fields) continue;
        if (isRequiredIn(now, path)) {
          breaking.push(`${group} \`${type}.${path}\` is a new required field.`);
        } else additions.push(`${group} \`${type}.${path}\` is new.`);
      }
    }
    for (const type of Object.keys(after)) {
      if (!(type in before)) additions.push(`${group} message \`${type}\` is new.`);
    }
  }

  if (breaking.length > 0) {
    return breaking.map(
      (problem) =>
        `${problem} That's a breaking change: bump PROTOCOL_VERSION (packages/protocol/src/index.ts, design §8.3), then re-record the shape with ${command}.`,
    );
  }
  return additions.map((addition) => `${addition} ${rerecord}`);
}

/**
 * Whether a field must be present, given its message's fields: neither it nor any object or array
 * it sits in is optional. A new optional object's own required fields don't make it required.
 */
function isRequiredIn(fields: Record<string, string>, path: string): boolean {
  const parts = path.split('.');
  for (let end = 1; end <= parts.length; end++) {
    const prefix = parts.slice(0, end).join('.');
    const array = prefix.replace(/(\[\])+$/, '');
    if (fields[prefix]?.endsWith('?') || fields[array]?.endsWith('?')) return false;
  }
  return true;
}

/** Whether `after` is the enum `before` with values added, which old receivers can ignore. */
function widensEnum(before: string, after: string): boolean {
  const values = (description: string) => /^enum\((.*)\)(\??)$/.exec(description);
  const [was, is] = [values(before), values(after)];
  if (!was || !is || was[2] !== is[2]) return false;
  const now = new Set(is[1]?.split('|'));
  return (was[1]?.split('|') ?? []).every((value) => now.has(value));
}

type Def = {
  type: string;
  [key: string]: unknown;
};

const defOf = (schema: unknown): Def => (schema as { _zod: { def: Def } })._zod.def;

/** Each option of a discriminated union, by its `type` value(s), described field by field. */
function describeUnion(schema: z.ZodType): Record<string, Record<string, string>> {
  const def = defOf(schema);
  if (def.type !== 'union') throw new Error(`expected a union of messages, got ${def.type}`);
  const byType: Record<string, Record<string, string>> = {};
  for (const option of def.options as z.ZodType[]) {
    const fields: Record<string, string> = {};
    describe(option, '', fields);
    const typeField = defOf((defOf(option).shape as Record<string, unknown>).type);
    const types =
      typeField.type === 'literal'
        ? (typeField.values as string[])
        : Object.values(typeField.entries as Record<string, string>);
    for (const type of types) {
      const { type: _, ...rest } = fields;
      byType[type] = rest;
    }
  }
  return Object.fromEntries(Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)));
}

function describe(schema: unknown, path: string, out: Record<string, string>, optional = ''): void {
  const def = defOf(schema);
  const at = (prefix: string, key: string) => (prefix ? `${prefix}.${key}` : key);
  switch (def.type) {
    case 'optional':
      describe(def.innerType, path, out, '?');
      return;
    case 'object':
      if (path) out[path] = `object${optional}`;
      for (const [key, field] of Object.entries(def.shape as Record<string, unknown>)) {
        describe(field, at(path, key), out);
      }
      return;
    case 'array':
      out[path] = `array${optional}`;
      describe(def.element, `${path}[]`, out);
      return;
    case 'pipe':
      describe(def.in, path, out, optional);
      return;
    case 'union':
      // A union of messages or actions inside a message: its own group holds its shape.
      out[path] = `${def.discriminator ? 'oneOf' : 'union'}${optional}`;
      return;
    case 'enum':
      out[path] =
        `enum(${Object.values(def.entries as Record<string, string>).join('|')})${optional}`;
      return;
    case 'literal':
      out[path] = `literal(${(def.values as unknown[]).join('|')})${optional}`;
      return;
    default:
      out[path] = `${def.type}${def.format ? `:${def.format}` : ''}${optional}`;
  }
}
