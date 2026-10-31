import type { NicknameProblem } from '@shura/protocol';

/** What's wrong with a nickname, as the prompt and the settings say it (design §11). */
export const NICKNAME_PROBLEMS: Readonly<Record<NicknameProblem, string>> = {
  empty: 'Type a nickname.',
  tooLong: 'At most 16 characters.',
  invalidCharacters: 'Letters, digits, spaces, _ and - only.',
  blocked: 'That nickname isn’t allowed.',
};
