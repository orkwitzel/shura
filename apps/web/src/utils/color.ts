import type { Rgb } from '@shura/client-core';

/**
 * `rgb` darkened toward black (a negative `amount`, -0.55 being 55 % of the way) or lightened
 * toward white (a positive one), as a skin's art pixels shade the cell's colour.
 */
export function shade(rgb: Rgb, amount: number): Rgb {
  const target = amount < 0 ? 0 : 255;
  const by = Math.abs(amount);
  const mix = (value: number) => Math.round(value + (target - value) * by);
  return [mix(rgb[0]), mix(rgb[1]), mix(rgb[2])];
}

/** A colour as one number, `0xRRGGBB`, as Pixi takes it. */
export function colorNumber([red, green, blue]: Rgb): number {
  return (red << 16) | (green << 8) | blue;
}
