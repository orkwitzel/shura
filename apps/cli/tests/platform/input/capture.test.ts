import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionType } from '@shura/engine';
import { describe, expect, it } from 'vitest';
import { captureHeader, createCaptureFile, showBytes } from '../../../src/platform/input/capture';
import type { InputSignal } from '../../../src/platform/input/terminal-input';
import { readCapture } from '../../support/captures';

describe('input capture file', () => {
  it('writes a header, then one line per raw key or inferred release, that fixtures read back', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'shura-capture-')), 'capture.jsonl');
    const capture = createCaptureFile(path, captureHeader('auto', { TERM: 'xterm-256color' }));
    const event = { action: ActionType.MoveLeft, kind: 'press', time: 1_200 } as const;
    const press: InputSignal = { kind: 'key', event };
    const release: InputSignal = { kind: 'key', event: { ...event, kind: 'release', time: 1_750 } };
    capture.write({ time: 1_200.25, bytes: '\x1b[D', adapter: 'auto', signals: [press] });
    capture.write({ time: 1_750, bytes: null, adapter: 'auto', signals: [release] });

    const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      capture: 'shura-input',
      version: 1,
      terminal: 'xterm-256color',
      protocol: '',
      gesture: '',
      key: '',
      input: 'auto',
    });
    expect(readCapture(path).chunks).toEqual([{ time: 0, bytes: '\x1b[D' }]);
  });

  it('names the terminal from TERM_PROGRAM when it is set', () => {
    expect(captureHeader('auto', { TERM_PROGRAM: 'ghostty', TERM: 'xterm-ghostty' }).terminal).toBe(
      'ghostty',
    );
  });
});

describe('showBytes', () => {
  it('shows control bytes in caret notation', () => {
    expect(showBytes('\x1b[1;1:3D')).toBe('^[[1;1:3D');
    expect(showBytes('x')).toBe('x');
    expect(showBytes(' ')).toBe('␣');
    expect(showBytes('\x7f')).toBe('^?');
  });
});
