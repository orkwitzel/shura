import { expect, it } from 'vitest';
import { terminalClock } from '../src/clock';

it('wakes a few milliseconds later, on a clock that only goes forward', async () => {
  const clock = terminalClock();
  const before = clock.now();
  const woke = await new Promise<number>((resolve) => clock.schedule(() => resolve(clock.now())));
  expect(woke).toBeGreaterThan(before);
});

it('cancels a wake', async () => {
  const clock = terminalClock();
  let woke = false;
  const cancel = clock.schedule(() => {
    woke = true;
  });
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(woke).toBe(false);
});
