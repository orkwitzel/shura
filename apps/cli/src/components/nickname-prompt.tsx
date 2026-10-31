import type { Clock } from '@shura/client-core';
import { NICKNAME_MAX_LENGTH, type NicknameProblem, validateNickname } from '@shura/protocol';
import { Box, Text } from 'ink';
import { useState } from 'react';
import { typedText } from '../platform/input/typed-text';
import { useScreenKeys } from '../platform/input/use-screen-keys';

export interface NicknamePromptProps {
  /** The text it starts with: a suggestion, or the nickname being changed. */
  readonly initial: string;
  /**
   * Whether `initial` is a suggestion the first key typed replaces (as if selected), rather than
   * text to edit.
   */
  readonly fresh: boolean;
  /** Whether it takes keys: not while it can't be seen. */
  readonly active: boolean;
  readonly clock: Pick<Clock, 'now'>;
  /** Enter, with a valid nickname: as the gateway will normalize it. */
  readonly onAccept: (nickname: string) => void;
  /** Esc. */
  readonly onCancel: () => void;
}

/** What's wrong with a nickname, in plain words (design §11). */
const PROBLEMS: Readonly<Record<NicknameProblem, string>> = {
  empty: 'Type a nickname.',
  tooLong: `At most ${NICKNAME_MAX_LENGTH} characters.`,
  invalidCharacters: 'Letters, digits, spaces, _ and - only.',
  blocked: "That nickname isn't allowed.",
};

/**
 * Asks for a nickname (design §13.1): the first time a player goes online with none, from the
 * lobby (N) and from the settings. It checks the name as it's typed with the gateway's own rules
 * (from `protocol`), and Enter accepts only a valid one. Backspace takes a character back, and Esc
 * cancels.
 */
export function NicknamePrompt({
  initial,
  fresh: startsFresh,
  active,
  clock,
  onAccept,
  onCancel,
}: NicknamePromptProps) {
  const [text, setText] = useState(initial);
  const [fresh, setFresh] = useState(startsFresh);
  const checked = validateNickname(text);

  useScreenKeys({ active, clock }, (raw, press) => {
    const { key } = raw;
    if (key.eventType === 'release') return;
    if (key.escape) {
      if (press) onCancel();
    } else if (key.return) {
      if (press && checked.ok) onAccept(checked.nickname);
    } else if (key.backspace || key.delete) {
      setText((typed) => (fresh ? '' : [...typed].slice(0, -1).join('')));
      setFresh(false);
    } else {
      const typed = typedText(raw);
      if (typed === null) return;
      const next = [...(fresh ? '' : text), ...typed].slice(0, NICKNAME_MAX_LENGTH).join('');
      setText(next);
      setFresh(false);
    }
  });

  return (
    <Box flexDirection="column" width={56} marginTop={2}>
      <Text bold color="yellow">
        NICKNAME
      </Text>
      <Text dimColor>What other players see you as.</Text>
      <Box marginY={1}>
        <Text bold inverse={!fresh} underline={fresh}>
          {` ${text.padEnd(NICKNAME_MAX_LENGTH)} `}
        </Text>
      </Box>
      <Text color={checked.ok ? 'green' : 'yellow'}>
        {checked.ok ? '✓ Looks good.' : PROBLEMS[checked.reason]}
      </Text>
      <Box marginTop={1}>
        <Text dimColor>
          {fresh
            ? 'Enter accept  type to change  Esc back'
            : 'Enter accept  Backspace delete  Esc back'}
        </Text>
      </Box>
    </Box>
  );
}
