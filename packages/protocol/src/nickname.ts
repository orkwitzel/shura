import { NICKNAME_BLOCKLIST } from './nickname-blocklist';

/** The longest nickname, in characters (Unicode code points, after normalizing). */
export const NICKNAME_MAX_LENGTH = 16;

/** Why a nickname was refused. */
export type NicknameProblem = 'empty' | 'tooLong' | 'invalidCharacters' | 'blocked';

export type NicknameResult =
  | { readonly ok: true; readonly nickname: string }
  | { readonly ok: false; readonly reason: NicknameProblem };

/** Control characters (`Cc`) and invisible format characters (`Cf`: zero-width, bidi, BOM). */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;
/** Space separators of every width, which become plain spaces. */
const SPACES = /\p{Zs}+/gu;
/** Letters (with their combining marks, such as niqqud), decimal digits, `_`, `-` and spaces. */
const ALLOWED = /^[\p{L}\p{M}\p{Nd}_\- ]+$/u;

/**
 * Normalizes and checks a nickname (design §11), the same in the clients and the gateway. The
 * name is NFC-normalized, with control and zero-width characters stripped, spaces trimmed and
 * runs of them collapsed. It must then be 1–16 characters of Unicode letters (Hebrew included),
 * digits, `_`, `-` and spaces, and contain no blocklisted word. Duplicates in a room are the
 * server's to suffix (`#2`), not this function's.
 */
export function validateNickname(raw: string): NicknameResult {
  const nickname = raw
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .normalize('NFC')
    .replace(SPACES, ' ')
    .trim();
  const length = [...nickname].length;
  if (length === 0) return { ok: false, reason: 'empty' };
  if (length > NICKNAME_MAX_LENGTH) return { ok: false, reason: 'tooLong' };
  if (!ALLOWED.test(nickname)) return { ok: false, reason: 'invalidCharacters' };
  const squashed = squash(nickname);
  if (BLOCKED.some((word) => squashed.includes(word))) return { ok: false, reason: 'blocked' };
  return { ok: true, nickname };
}

/** A random nickname to suggest, `PlayerNNNN`. */
export function suggestNickname(random: () => number = Math.random): string {
  return `Player${String(Math.floor(random() * 10_000)).padStart(4, '0')}`;
}

/** Lowercased, without separators or accents: the form the blocklist is matched in. */
function squash(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\p{M} _-]/gu, '')
    .toLowerCase();
}

const BLOCKED = NICKNAME_BLOCKLIST.map(squash);
