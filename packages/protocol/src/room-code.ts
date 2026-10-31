/**
 * The characters of a room code (design §10.3): digits and capital letters without the ambiguous
 * `0/O` and `1/I/L`, 31 in all.
 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A room code's length (design §10.3). 31⁴ gives about 920k codes. */
export const ROOM_CODE_LENGTH = 4;

const ROOM_CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/**
 * The room code a player typed, uppercased and without surrounding spaces, or `undefined` if it
 * isn't one: the wrong length, or a character outside the alphabet.
 */
export function parseRoomCode(text: string): string | undefined {
  const code = text.trim().toUpperCase();
  return ROOM_CODE.test(code) ? code : undefined;
}

/**
 * A room-code field's text as it's typed: uppercased, with the characters a code can't have
 * dropped, and no longer than a code.
 */
export function roomCodeInput(text: string): string {
  return [...text.toUpperCase()]
    .filter((character) => ROOM_CODE_ALPHABET.includes(character))
    .slice(0, ROOM_CODE_LENGTH)
    .join('');
}
