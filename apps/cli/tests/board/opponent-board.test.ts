import { THEMES } from '@shura/client-core';
import { createEngine, GARBAGE, ONE_VS_ONE } from '@shura/engine';
import { expect, test } from 'vitest';
import { lookOf } from '../../src/board/look';
import { opponentBoardRows } from '../../src/board/opponent-board';

/** A fresh 1v1 game with its spawned piece. */
const game = () => createEngine(ONE_VS_ONE, 7, 0).state;

test('an opponent board is 10 characters wide and 10 high: two cells to a character', () => {
  const rows = opponentBoardRows(game(), lookOf('none'), { out: false });
  // The walls on either side, and the floor.
  expect(rows).toHaveLength(11);
  for (const row of rows.slice(0, 10)) expect([...row]).toHaveLength(12);
});

test('without colour, a half-block shows which of its two cells are filled', () => {
  const engine = createEngine(ONE_VS_ONE, 7, 0);
  const state = structuredClone(engine.serialize());
  // Row 0 (the bottom) full but for column 0; row 1 only at column 1.
  state.board[0] = state.board[0]?.map((_, col) => (col === 0 ? null : GARBAGE)) ?? [];
  state.board[1] = state.board[1]?.map((_, col) => (col === 1 ? 'I' : null)) ?? [];
  const rows = opponentBoardRows(state, lookOf('none'), { out: false });
  expect(rows[9]).toBe('│ █▄▄▄▄▄▄▄▄│');
  expect(rows[10]).toBe('└──────────┘');
});

test('with colour, each half takes its cell colour: the top in front, the bottom behind', () => {
  const engine = createEngine(ONE_VS_ONE, 7, 0);
  const state = structuredClone(engine.serialize());
  state.board[0] = state.board[0]?.map((_, col) => (col === 0 ? 'T' : null)) ?? [];
  state.board[1] = state.board[1]?.map((_, col) => (col === 0 ? 'I' : null)) ?? [];
  const [row] = opponentBoardRows(state, lookOf('truecolor'), { out: false }).slice(9);
  const { I, T } = THEMES.indigo.pieces;
  expect(row).toContain(`\x1b[38;2;${I.rgb.join(';')}m\x1b[48;2;${T.rgb.join(';')}m▀`);
});

test('an out board is greyed', () => {
  const state = structuredClone(createEngine(ONE_VS_ONE, 7, 0).serialize());
  state.board[0] = state.board[0]?.map((_, col) => (col === 0 ? 'T' : null)) ?? [];
  const tColour = `38;2;${THEMES.indigo.pieces.T.rgb.join(';')}m`;
  const drawn = (out: boolean) => opponentBoardRows(state, lookOf('truecolor'), { out }).join('');
  expect(drawn(false)).toContain(tColour);
  expect(drawn(true)).not.toContain(tColour);
  expect(drawn(true)).toContain(`38;2;${THEMES.indigo.chrome.grid.rgb.join(';')}m`);
});
