import { validateNickname } from '@shura/protocol';
import { useState } from 'react';
import { TextField } from '@/components/ui/text-field';
import { NICKNAME_PROBLEMS } from '@/utils/nickname-problem';

export interface NicknameSettingProps {
  /** The saved nickname, if one is set. */
  readonly nickname: string | undefined;
  /** Hears each name typed that passes, normalized as the server will use it. */
  readonly onChange: (nickname: string) => void;
}

/**
 * The settings' nickname field (design §13.1, Nickname): checked as it's typed with the gateway's
 * own `validateNickname`. Each name that passes is saved at once; one that doesn't says why, and
 * the last good one stays saved. Empty until set: the prompt asks the first time.
 */
export function NicknameSetting({ nickname, onChange }: NicknameSettingProps) {
  const [typed, setTyped] = useState(nickname ?? '');
  const checked = validateNickname(typed);
  // Empty before a name is ever set is how it starts, not a mistake.
  const problem =
    checked.ok || (nickname === undefined && typed === '')
      ? undefined
      : NICKNAME_PROBLEMS[checked.reason];
  return (
    <TextField
      label="Nickname"
      value={typed}
      placeholder="asked the first time"
      problem={problem}
      onChange={(text) => {
        setTyped(text);
        const next = validateNickname(text);
        if (next.ok && next.nickname !== nickname) onChange(next.nickname);
      }}
    />
  );
}
