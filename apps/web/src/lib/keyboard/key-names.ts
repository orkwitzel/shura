/**
 * A web key name: the key's `KeyboardEvent.code` (`ArrowLeft`, `KeyX`, `Space`, `ControlLeft`),
 * the physical key, so a keyboard layout such as Hebrew or AZERTY doesn't move the controls
 * (design §7.4). Bindings hold these.
 */
export type KeyName = string;

/** The key name of a keyboard event. */
export function keyNameOf(event: Pick<KeyboardEvent, 'code'>): KeyName {
  return event.code;
}
