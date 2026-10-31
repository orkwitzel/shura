import {
  type Bindings,
  type Clock,
  type Direction,
  type HandlingSettings,
  handlingFrames,
  rebind,
  type Settings,
  type SettingsChange,
  SKINS,
  stepHandling,
  THEMES,
  unbind,
} from '@shura/client-core';
import { useSettings, useSettingsStore } from '@shura/client-core/react';
import { ActionType, type PieceActionType } from '@shura/engine';
import { Box, type Key, Text, useInput } from 'ink';
import { useState } from 'react';
import { bindableKey, keyLabel } from '../../platform/input/bindable';
import { createKeyRepeatReader } from '../../platform/input/key-repeat';
import { keyName } from '../../platform/input/terminal-input';

export interface SettingsScreenProps {
  /** Leave the screen (Esc). The changes are already saved. */
  readonly onClose: () => void;
  /** Whether it takes keys (`true` by default): not while it can't be seen. */
  readonly active?: boolean;
  /** What times its keys, to tell a key's OS repeat from a new press. The system's by default. */
  readonly clock?: Pick<Clock, 'now'>;
}

const SYSTEM_CLOCK: Pick<Clock, 'now'> = { now: () => performance.now() };

/** A row ← and → change: a handling stepper, the ghost toggle, or a picker. */
interface ValueRow {
  readonly kind: 'value';
  readonly label: string;
  /** The value as shown. */
  readonly value: (settings: Settings) => string;
  /** Whether ← (−1) or → (+1) can still change it (an arrow is shown on that side). */
  readonly can: (settings: Settings, direction: Direction) => boolean;
  /** The change ← or → makes. */
  readonly step: (settings: Settings, direction: Direction) => SettingsChange;
}

/** A game control's keys: ← and → choose a slot (the one after the last adds a key). */
interface BindingRow {
  readonly kind: 'binding';
  readonly label: string;
  readonly action: PieceActionType;
}

type Row = ValueRow | BindingRow;

function frameCount(count: number): string {
  return `${count} ${count === 1 ? 'frame' : 'frames'}`;
}

/** A handling stepper (design §7.2): ←/→ a step, stopping at the range's ends. */
function handlingRow(
  label: string,
  field: keyof HandlingSettings,
  value: (handling: HandlingSettings) => string,
): ValueRow {
  return {
    kind: 'value',
    label,
    value: ({ handling }) => value(handling),
    can: ({ handling }, direction) =>
      stepHandling(handling, field, direction)[field] !== handling[field],
    step: ({ handling }, direction) => ({ handling: stepHandling(handling, field, direction) }),
  };
}

/**
 * A picker over `options` in their order (a theme, a skin): ←/→ the one before or after, stopping
 * at the ends.
 */
function pickerRow<Id extends string>(
  label: string,
  options: readonly { id: Id; shown: string }[],
  get: (settings: Settings) => Id,
  set: (id: Id) => SettingsChange,
): ValueRow {
  const at = (settings: Settings) => options.findIndex(({ id }) => id === get(settings));
  return {
    kind: 'value',
    label,
    value: (settings) => options[at(settings)]?.shown ?? get(settings),
    can: (settings, direction) => options[at(settings) + direction] !== undefined,
    step: (settings, direction) => {
      const option = options[at(settings) + direction];
      return option ? set(option.id) : {};
    },
  };
}

const GHOST: ValueRow = {
  kind: 'value',
  label: 'Ghost',
  value: ({ ghost }) => (ghost ? 'on' : 'off'),
  can: () => true,
  step: ({ ghost }) => ({ ghost: !ghost }),
};

/** The game controls, as design §7.4 lists them. */
const CONTROLS: readonly [PieceActionType, string][] = [
  [ActionType.MoveLeft, 'Move left'],
  [ActionType.MoveRight, 'Move right'],
  [ActionType.SoftDrop, 'Soft drop'],
  [ActionType.HardDrop, 'Hard drop'],
  [ActionType.RotateCW, 'Rotate CW'],
  [ActionType.RotateCCW, 'Rotate CCW'],
  [ActionType.Rotate180, 'Rotate 180°'],
  [ActionType.Hold, 'Hold'],
];

/** The screen's sections and their rows, top to bottom. */
const SECTIONS: readonly { title: string; rows: readonly Row[] }[] = [
  {
    title: 'HANDLING',
    rows: [
      handlingRow('DAS', 'das', (h) => `${h.das} ms (${frameCount(handlingFrames(h).das)})`),
      handlingRow('ARR', 'arr', (h) => `${h.arr} ms (${frameCount(handlingFrames(h).arr)})`),
      handlingRow('Soft drop factor', 'softDropFactor', ({ softDropFactor: factor }) =>
        factor === 'instant' ? 'instant' : `×${factor}`,
      ),
    ],
  },
  {
    title: 'KEYS',
    rows: CONTROLS.map(([action, label]) => ({ kind: 'binding', action, label })),
  },
  {
    title: 'DISPLAY',
    rows: [
      GHOST,
      pickerRow(
        'Theme',
        Object.values(THEMES).map(({ id, name }) => ({ id, shown: name })),
        ({ theme }) => theme,
        (theme) => ({ theme }),
      ),
      pickerRow(
        'Skin',
        Object.values(SKINS).map(({ id, name, terminal }) => ({
          id,
          shown: `${name} ${terminal}`,
        })),
        ({ skin }) => skin,
        (skin) => ({ skin }),
      ),
    ],
  },
];

const ROWS: readonly Row[] = SECTIONS.flatMap(({ rows }) => rows);

/**
 * What a rebind did besides binding the key, for the message line: which control took the key this
 * slot had (a swap), or lost the key it had.
 */
function rebindMessage(before: Bindings, after: Bindings, action: PieceActionType): string {
  for (const [other, label] of CONTROLS) {
    if (other === action) continue;
    const gained = after[other].find((key) => !before[other].includes(key));
    if (gained !== undefined) return `${label} gets ${keyLabel(gained)}.`;
    const lost = before[other].find((key) => !after[other].includes(key));
    if (lost !== undefined) return `${label} loses ${keyLabel(lost)}.`;
  }
  return '';
}

/**
 * The screen's width: what 80 columns leave beside the debug panel. The labels' column is
 * `LABEL_WIDTH` of it, after the cursor's two.
 */
const WIDTH = 48;
const LABEL_WIDTH = 18;

/**
 * The bottom line: the rebind prompt while waiting for a key, or else the keys the screen takes
 * where the cursor is.
 */
function hint(row: Row | undefined, capturing: boolean): string {
  if (row?.kind !== 'binding') return '↑↓ choose  ←→ change  Esc back';
  if (capturing) return `Press a key for ${row.label} (Esc cancels).`;
  return '←→ slot  Enter rebind  Backspace clear  Esc back';
}

/**
 * The settings screen (design §13.3): handling steppers, a "press a key" rebind for each game
 * control, the ghost toggle, and the theme and skin pickers. Every change goes to the settings store
 * and is saved at once. It reads the stores from `ClientCoreProvider`, so it stands on its own: the
 * in-game menu and the main menu both open it.
 */
export function SettingsScreen({
  onClose,
  active = true,
  clock = SYSTEM_CLOCK,
}: SettingsScreenProps) {
  const settings = useSettings();
  const store = useSettingsStore();
  const [cursor, setCursor] = useState(0);
  const [slot, setSlot] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState('');
  // Tells presses from the key repeat where the terminal doesn't (design §7.3), so the OS repeat of
  // the Enter that opened the rebind prompt isn't bound.
  const [repeats] = useState(() => createKeyRepeatReader());
  const row = ROWS[cursor];

  const change = (next: SettingsChange, said = '') => {
    store.update(next);
    setMessage(store.save() ?? said);
  };

  const moveTo = (at: number) => {
    setCursor(Math.min(Math.max(at, 0), ROWS.length - 1));
    setSlot(0);
    setMessage('');
  };

  const capture = (input: string, key: Key, action: PieceActionType) => {
    if (key.escape) {
      setCapturing(false);
      setMessage('');
      return;
    }
    const bindable = bindableKey({ input, key });
    if ('refused' in bindable) {
      setMessage(bindable.refused);
      return;
    }
    const next = rebind(settings.bindings, action, slot, bindable.key);
    setCapturing(false);
    change({ bindings: next }, rebindMessage(settings.bindings, next, action));
  };

  // Keys that come while it can't be seen are dropped here, rather than by unsubscribing: with no
  // `useInput` active, Ink stops reading the terminal and would hand them over once it could be.
  useInput((input, key) => {
    if (!active || !row) return;
    const changes = repeats.feed({ input, key, time: clock.now() });
    // A key with no name can't repeat in the reader's eyes: its event type says what it was.
    const press =
      keyName({ input, key }) === null
        ? (key.eventType ?? 'press') === 'press'
        : changes.at(-1)?.kind === 'press';
    if (capturing && row.kind === 'binding') {
      if (press) capture(input, key, row.action);
      return;
    }
    if (key.eventType === 'release') return;
    if (key.escape) onClose();
    else if (key.upArrow) moveTo(cursor - 1);
    else if (key.downArrow) moveTo(cursor + 1);
    else if (row.kind === 'value' && (key.leftArrow || key.rightArrow)) {
      const direction = key.rightArrow ? 1 : -1;
      if (row.can(settings, direction)) change(row.step(settings, direction));
    } else if (row.kind === 'binding') {
      const slots = settings.bindings[row.action].length + 1;
      if (key.leftArrow) setSlot((at) => Math.max(0, at - 1));
      else if (key.rightArrow) setSlot((at) => Math.min(slots - 1, at + 1));
      else if ((key.backspace || key.delete) && slot < slots - 1) {
        change({ bindings: unbind(settings.bindings, row.action, slot) });
      } else if (key.return && press) {
        setCapturing(true);
        setMessage('');
      }
    }
  });

  const bindingValue = (action: PieceActionType, selected: boolean): string => {
    const keys = settings.bindings[action].map(keyLabel);
    if (!selected) return keys.length > 0 ? keys.join(' ') : '(none)';
    return [...keys, '+']
      .map((label, at) => (at === slot ? `[${capturing ? '...' : label}]` : label))
      .join(' ');
  };

  const shownValue = (row: Row, selected: boolean): string => {
    if (row.kind === 'binding') return bindingValue(row.action, selected);
    return `${row.can(settings, -1) ? '< ' : '  '}${row.value(settings)}${row.can(settings, 1) ? ' >' : ''}`;
  };

  return (
    <Box flexDirection="column" width={WIDTH}>
      <Text bold>SETTINGS</Text>
      {SECTIONS.map(({ title, rows }, index) => (
        <Box key={title} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
          <Text dimColor>{title}</Text>
          {rows.map((each) => {
            const selected = each === row;
            return (
              <Box key={each.label}>
                <Text>{selected ? '› ' : '  '}</Text>
                <Box width={LABEL_WIDTH}>
                  <Text>{each.label}</Text>
                </Box>
                <Text bold={selected}>{shownValue(each, selected)}</Text>
              </Box>
            );
          })}
        </Box>
      ))}
      {/* A message of one line keeps a blank line above it; a longer one takes that line too. */}
      <Box height={3} overflow="hidden" flexDirection="column" justifyContent="flex-end">
        <Text>{message}</Text>
      </Box>
      <Text dimColor>{hint(row, capturing)}</Text>
    </Box>
  );
}
