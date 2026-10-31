import { describe, expect, test } from 'vitest';
import { THEMES } from '../src/index';

// The prototype's web colours (issue #42), the source the themes' web groups were taken from.
describe('web theme colours', () => {
  test('every theme has them', () => {
    for (const theme of Object.values(THEMES)) {
      expect(theme.web.swirls).toHaveLength(3);
      expect(theme.web.well).toHaveLength(2);
    }
  });

  test('Indigo', () => {
    expect(THEMES.indigo.web).toEqual({
      panel: [0x2a, 0x1a, 0x4d],
      deep: [0x12, 0x08, 0x26],
      shadow: [0x0a, 0x04, 0x14],
      muted: [0xc9, 0xbf, 0xe0],
      swirls: [
        { rgb: [255, 77, 109], alpha: 0.45 },
        { rgb: [77, 124, 255], alpha: 0.5 },
        { rgb: [255, 210, 63], alpha: 0.25 },
      ],
      well: [
        [0x17, 0x0c, 0x2e],
        [0x1c, 0x10, 0x38],
      ],
    });
  });

  test('Plum', () => {
    expect(THEMES.plum.web).toEqual({
      panel: [0x3d, 0x16, 0x40],
      deep: [0x1a, 0x06, 0x19],
      shadow: [0x0a, 0x04, 0x14],
      muted: [0xc9, 0xbf, 0xe0],
      swirls: [
        { rgb: [255, 120, 60], alpha: 0.42 },
        { rgb: [255, 77, 170], alpha: 0.42 },
        { rgb: [120, 90, 255], alpha: 0.32 },
      ],
      well: [
        [0x1d, 0x08, 0x1c],
        [0x25, 0x0b, 0x24],
      ],
    });
  });

  test('Deep Sea', () => {
    expect(THEMES['deep-sea'].web).toEqual({
      panel: [0x10, 0x30, 0x4d],
      deep: [0x06, 0x14, 0x23],
      shadow: [0x0a, 0x04, 0x14],
      muted: [0xc9, 0xbf, 0xe0],
      swirls: [
        { rgb: [62, 224, 255], alpha: 0.32 },
        { rgb: [77, 124, 255], alpha: 0.45 },
        { rgb: [255, 77, 109], alpha: 0.3 },
      ],
      well: [
        [0x07, 0x18, 0x27],
        [0x0a, 0x1e, 0x31],
      ],
    });
  });
});
