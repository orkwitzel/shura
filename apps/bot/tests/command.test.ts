import { expect, test } from 'vitest';
import { runCommand } from '../src/command';

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** Runs `pnpm bot …` against a fake bot tool that answers `status` with `answer`. */
async function run(argv: string[], answer: unknown = { bots: [] }, status = 201) {
  const calls: Call[] = [];
  let out = '';
  let err = '';
  const code = await runCommand(argv, {
    url: 'http://bots.test:8090',
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify(answer), { status });
    },
    out: (text) => {
      out += text;
    },
    err: (text) => {
      err += text;
    },
  });
  return { code, calls, out, err };
}

test('join asks for bots in a room and prints their names', async () => {
  const { code, calls, out } = await run(['join', 'k7qx', '--count', '2', '--pps', '1.5'], {
    bots: [{ name: 'Ada' }, { name: 'Turing' }],
  });
  expect(code).toBe(0);
  expect(calls).toEqual([
    {
      url: 'http://bots.test:8090/bots',
      method: 'POST',
      body: { room: 'K7QX', count: 2, profile: 'casual', pps: 1.5 },
    },
  ]);
  expect(out).toBe('Ada and Turing are joining K7QX.\n');
});

test('quick asks for quick-match bots', async () => {
  const { code, calls } = await run(['quick'], { bots: [{ name: 'Ada' }] });
  expect(code).toBe(0);
  expect(calls[0]?.body).toEqual({ quickMatch: true, count: 1, profile: 'casual' });
});

test('leave removes a room’s bots', async () => {
  const { code, calls, out } = await run(['leave', 'K7QX'], { removed: 3 }, 200);
  expect(code).toBe(0);
  expect(calls[0]).toMatchObject({ url: 'http://bots.test:8090/bots?room=K7QX', method: 'DELETE' });
  expect(out).toBe('Removed 3 bots from K7QX.\n');
});

test('list prints each bot', async () => {
  const { out } = await run(
    ['list'],
    {
      bots: [
        { name: 'Ada', profile: 'casual', room: 'K7QX' },
        { name: 'Kay', profile: 'casual', quickMatch: true },
      ],
    },
    200,
  );
  expect(out).toBe('Ada  casual  K7QX\nKay  casual  quick-match\n');
});

test('the tool’s refusal is printed, with exit code 1', async () => {
  const { code, err } = await run(['join', 'K7QX'], { error: 'nope' }, 400);
  expect(code).toBe(1);
  expect(err).toContain('nope');
});

test('an unreachable tool says to start it with pnpm dev:bot', async () => {
  const { code, err } = await runCommand(['quick'], {
    url: 'http://bots.test:8090',
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
    out: () => {},
    err: (text) => {
      expect(text).toContain('pnpm dev:bot');
    },
  }).then((exit) => ({ code: exit, err: '' }));
  expect(code).toBe(1);
  expect(err).toBe('');
});

test.each([
  [[]],
  [['join']],
  [['join', 'NO!']],
  [['dance']],
  [['join', 'K7QX', '--count', 'lots']],
])('bad arguments %j print the usage, with exit code 2', async (argv) => {
  const { code, err, calls } = await run(argv);
  expect(code).toBe(2);
  expect(err).toContain('pnpm bot join <CODE>');
  expect(calls).toEqual([]);
});
