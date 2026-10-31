import {
  ACTION_LABELS,
  type Effects,
  type HandlingSettings,
  handlingFrames,
  handlingSteps,
  type RebindChange,
  type Rgb,
  rebindChange,
  type SettingsChange,
  SKINS,
  type SkinId,
  THEMES,
  type Theme,
  type ThemeId,
  unbind,
} from '@shura/client-core';
import { useSettings, useSettingsStore } from '@shura/client-core/react';
import type { PieceActionType } from '@shura/engine';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { KeyCapture } from '@/components/ui/key-capture';
import { RadioGroup, type RadioOption } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { DEFAULT_BINDINGS } from '@/config/default-bindings';
import { useEffects } from '@/hooks/use-effects';
import { keyLabel } from '@/lib/keyboard/key-labels';
import { ctrlWarning } from '../utils/ctrl-warning';
import styles from './settings-form.module.css';
import { SkinPreview } from './skin-preview';

export interface SettingsFormProps {
  /** Leave the settings (Esc, or Back). Every change is already saved. */
  readonly onClose: () => void;
}

const frameCount = (frames: number) => `${frames} ${frames === 1 ? 'frame' : 'frames'}`;

/** How each handling setting reads (design §13.3): `167 ms (10 frames)`, `×20`, `instant`. */
const HANDLING_TEXT: Readonly<
  Record<keyof HandlingSettings, (handling: HandlingSettings) => string>
> = {
  das: (handling) => `${handling.das} ms (${frameCount(handlingFrames(handling).das)})`,
  arr: (handling) => {
    const frames = handlingFrames(handling).arr;
    return `${handling.arr} ms (${frames === 0 ? 'instant' : frameCount(frames)})`;
  },
  softDropFactor: ({ softDropFactor }) =>
    softDropFactor === 'instant' ? 'instant' : `×${softDropFactor}`,
};

const HANDLING_LABELS: Readonly<Record<keyof HandlingSettings, string>> = {
  das: 'DAS',
  arr: 'ARR',
  softDropFactor: 'Soft drop factor',
};

const rank = (value: number | 'instant') => (value === 'instant' ? Infinity : value);

/**
 * Where `value` sits among a slider's steps: its own step, or for a hand-edited value between
 * steps, the next step up.
 */
function stepIndex(steps: readonly (number | 'instant')[], value: number | 'instant'): number {
  const at = steps.findIndex((step) => rank(step) >= rank(value));
  return at === -1 ? steps.length - 1 : at;
}

/** The game controls, in design §7.4's order. */
const ACTIONS = Object.entries(ACTION_LABELS) as [PieceActionType, string][];

const VOLUME_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const EFFECTS_OPTIONS: readonly RadioOption<Effects>[] = [
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced', detail: 'no shake, nudge or trails' },
  { value: 'off', label: 'Off', detail: 'callouts as plain text' },
];

const EFFECTS_NAMES: Readonly<Record<Effects, string>> = {
  full: 'Full',
  reduced: 'Reduced',
  off: 'Off',
};

/** A theme in small: its backdrop with its swirls over it. */
function themeSwatch({ chrome, web }: Theme): string {
  const rgb = ([red, green, blue]: Rgb, alpha = 1) => `rgb(${red} ${green} ${blue} / ${alpha})`;
  const [first, second, third] = web.swirls;
  return [
    `radial-gradient(circle at 20% 30%, ${rgb(first.rgb, first.alpha)}, transparent 60%)`,
    `radial-gradient(circle at 85% 75%, ${rgb(second.rgb, second.alpha)}, transparent 60%)`,
    `radial-gradient(circle at 60% 10%, ${rgb(third.rgb, third.alpha)}, transparent 50%)`,
    rgb(chrome.background.rgb),
  ].join(', ');
}

const THEME_OPTIONS: readonly RadioOption<ThemeId>[] = Object.values(THEMES).map((theme) => ({
  value: theme.id,
  label: theme.name,
  picture: <span className={styles.swatch} style={{ background: themeSwatch(theme) }} />,
}));

/** Keys the screen won't bind, and why: P opens the in-game menu, as Esc does (design §7.4). */
function refusal(code: string): string | undefined {
  return code === 'KeyP' ? 'P opens the menu. Press another key.' : undefined;
}

/**
 * What a rebind did besides binding the key, for the message line (design §13.1, Settings model):
 * which control took the key the slot had, or lost the key it had.
 */
function rebindMessage({ swap }: RebindChange): string {
  if (!swap) return '';
  const label = ACTION_LABELS[swap.action];
  return 'gets' in swap
    ? `${label} gets ${keyLabel(swap.gets)}.`
    : `${label} loses ${keyLabel(swap.loses)}.`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.heading}>{title}</h2>
      {children}
    </section>
  );
}

/**
 * The settings (design §13.2): handling, each action's keys with the swap rule, the ghost, the
 * theme (applied at once), the skin, the effects and the volume. Every change goes to the settings
 * store and is saved at once. Esc or Back leaves. It reads the stores from `ClientCoreProvider`, so
 * it stands on its own: the settings page shows it, and the solo page shows it over the paused
 * game.
 */
export function SettingsForm({ onClose }: SettingsFormProps) {
  const settings = useSettings();
  const store = useSettingsStore();
  const effects = useEffects();
  const [message, setMessage] = useState('');
  const first = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Focus the first control on mount, so the keys work at once.
  useEffect(() => {
    first.current?.querySelector('input')?.focus();
  }, []);

  // Esc leaves, from anywhere on the page. A key capture that's waiting keeps its Esc to itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const change = (next: SettingsChange, said = '') => {
    store.update(next);
    setMessage(store.save() ?? said);
  };

  const handlingSlider = (field: keyof HandlingSettings) => {
    const steps = handlingSteps(field);
    return (
      <Slider
        label={HANDLING_LABELS[field]}
        min={0}
        max={steps.length - 1}
        value={stepIndex(steps, settings.handling[field])}
        valueText={HANDLING_TEXT[field](settings.handling)}
        onChange={(index) => change({ handling: { ...settings.handling, [field]: steps[index] } })}
      />
    );
  };

  const warning = ctrlWarning(settings.bindings);

  return (
    <div className={styles.form}>
      <div className={styles.columns}>
        <div className={styles.column}>
          <Section title="Handling">
            <div ref={first} className={styles.controls}>
              {handlingSlider('das')}
              {handlingSlider('arr')}
              {handlingSlider('softDropFactor')}
            </div>
          </Section>
          <Section title="Keys">
            <div className={styles.bindings}>
              {ACTIONS.map(([action, label]) => {
                const keys = settings.bindings[action];
                return (
                  // biome-ignore lint/a11y/useSemanticElements: a legend can't be laid out as a grid column
                  <div key={action} role="group" aria-label={label} className={styles.binding}>
                    <span aria-hidden="true" className={styles.action}>
                      {label}
                    </span>
                    <span className={styles.keys}>
                      {[...keys, undefined].map((key, slot) => (
                        <KeyCapture
                          // A slot is its place in the action's list.
                          key={slot}
                          label={label}
                          value={key}
                          onCapture={(code) => {
                            const why = refusal(code);
                            if (why !== undefined) return why;
                            const rebound = rebindChange(settings.bindings, action, slot, code);
                            change({ bindings: rebound.bindings }, rebindMessage(rebound));
                            return undefined;
                          }}
                          onClear={
                            key === undefined
                              ? undefined
                              : () => change({ bindings: unbind(settings.bindings, action, slot) })
                          }
                        />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
            {warning !== null && (
              <p role="alert" className={styles.warning}>
                {warning}
              </p>
            )}
            <p className={styles.hint}>
              <kbd>Enter</kbd> change <kbd>Del</kbd> remove <kbd>Esc</kbd> cancel
            </p>
            <Button
              variant="secondary"
              className={styles.reset}
              onClick={() => change({ bindings: DEFAULT_BINDINGS }, 'Keys reset to the defaults.')}
            >
              Reset keys
            </Button>
          </Section>
        </div>
        <div className={styles.column}>
          <Section title="Display">
            <div className={styles.controls}>
              <Toggle
                label="Ghost"
                checked={settings.ghost}
                onChange={(ghost) => change({ ghost })}
              />
              <RadioGroup
                label="Theme"
                options={THEME_OPTIONS}
                value={settings.theme}
                onChange={(theme) => change({ theme })}
              />
              <RadioGroup<SkinId>
                label="Skin"
                options={Object.values(SKINS).map((skin) => ({
                  value: skin.id,
                  label: skin.name,
                  picture: <SkinPreview skin={skin.id} theme={settings.theme} />,
                }))}
                value={settings.skin}
                onChange={(skin) => change({ skin })}
              />
              <RadioGroup
                label="Effects"
                options={EFFECTS_OPTIONS}
                value={effects}
                onChange={(chosen) => change({ effects: chosen })}
              />
              {settings.effects === undefined && (
                <p className={styles.hint}>
                  Following your system: {EFFECTS_NAMES[effects]}
                  {effects === 'reduced' ? ' (it asks for reduced motion)' : ''}.
                </p>
              )}
            </div>
          </Section>
          <Section title="Sound">
            <Slider
              label="Volume"
              min={0}
              max={VOLUME_STEPS.length - 1}
              value={stepIndex(VOLUME_STEPS, settings.volume)}
              valueText={settings.volume === 0 ? 'off' : String(settings.volume)}
              onChange={(index) => change({ volume: VOLUME_STEPS[index] })}
            />
          </Section>
        </div>
      </div>
      <p data-testid="settings-message" role="status" className={styles.message}>
        {message}
      </p>
      <div className={styles.footer}>
        <p className={styles.hint}>
          <kbd>Tab</kbd> next <kbd>←</kbd>
          <kbd>→</kbd> change <kbd>Esc</kbd> back
        </p>
        <Button onClick={onClose}>Back</Button>
      </div>
    </div>
  );
}
