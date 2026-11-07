import { ActionType } from '@shura/engine';
import { describe, expect, test } from 'vitest';
import { actionSchema, frameActionsSchema } from '../../src/index';

describe('actionSchema', () => {
  test('takes every one of the engine’s action types', () => {
    const attackFields: Record<string, object> = {
      garbageAccepted: { id: 0 },
      garbageReceived: { id: 0, lines: 1, holeSeed: 5 },
    };
    for (const type of Object.values(ActionType)) {
      const action = { frame: 3, type, ...attackFields[type] };
      expect(actionSchema.parse(action)).toEqual(action);
    }
  });

  test('takes garbageReceived with its attack', () => {
    const action = { frame: 9, type: 'garbageReceived', id: 2, lines: 4, holeSeed: 123456789 };
    expect(actionSchema.parse(action)).toEqual(action);
  });

  test('lets unknown fields through', () => {
    expect(actionSchema.parse({ frame: 1, type: 'hold', extra: true })).toEqual({
      frame: 1,
      type: 'hold',
      extra: true,
    });
  });

  test('refuses a malformed action', () => {
    for (const action of [
      { frame: 1, type: 'teleport' },
      { frame: 0, type: 'hold' },
      { frame: 1.5, type: 'hold' },
      { type: 'hold' },
      { frame: 1, type: 'garbageAccepted' },
      { frame: 1, type: 'garbageReceived', id: 0, lines: 0, holeSeed: 1 },
      { frame: 1, type: 'garbageReceived', id: 0, lines: 2, holeSeed: -1 },
      { frame: 1, type: 'garbageReceived', id: 0, lines: 2 },
      'hold',
    ]) {
      expect(actionSchema.safeParse(action).success, JSON.stringify(action)).toBe(false);
    }
  });
});

describe('frameActionsSchema', () => {
  test('takes a frame with its actions, or with none', () => {
    const frame = { frame: 4, actions: [{ frame: 4, type: 'moveLeft' }] };
    expect(frameActionsSchema.parse(frame)).toEqual(frame);
    expect(frameActionsSchema.parse({ frame: 5, actions: [] })).toEqual({ frame: 5, actions: [] });
  });

  test('refuses an action whose frame isn’t its entry’s', () => {
    const frame = { frame: 4, actions: [{ frame: 5, type: 'moveLeft' }] };
    expect(frameActionsSchema.safeParse(frame).success).toBe(false);
  });
});
