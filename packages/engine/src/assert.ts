/** Throws a RangeError unless `value` is an integer from `min` to `max`. */
export function assertInteger(what: string, value: number, min: number, max = Infinity): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${what} must be an integer in [${min}, ${max}], got ${value}`);
  }
}
