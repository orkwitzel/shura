/** A key event signal, as an adapter makes it: `action` doing `kind` at `time` (ms). */
export function keySignal(action: string, kind: string, time: number) {
  return { kind: 'key', event: { action, kind, time } };
}
