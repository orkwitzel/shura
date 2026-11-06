import { NICKNAME_PROBLEMS } from '@shura/client-core';
import { validateNickname } from '@shura/protocol';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/text-field';
import styles from './nickname-dialog.module.css';

export interface NicknameDialogProps {
  readonly open: boolean;
  /** The name it starts with: a random suggestion the first time, else the current name. */
  readonly initial: string;
  /** The heading: *Pick a nickname* by default. */
  readonly title?: string;
  /** Hears the name chosen, as the server will use it (normalized). */
  readonly onSave: (nickname: string) => void;
  /** Esc: no name chosen. */
  readonly onClose: () => void;
}

/**
 * The nickname prompt (design §13.1, Nickname): a dialog with one text field, prefilled so Enter
 * alone accepts it, and checked as it's typed with the gateway's own `validateNickname`. Enter (or
 * *OK*) chooses a name that passes; Esc closes it.
 */
export function NicknameDialog({
  open,
  initial,
  title = 'Pick a nickname',
  onSave,
  onClose,
}: NicknameDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onClose} className={styles.dialog}>
      {/* Mounted with each opening, so it starts from `initial` every time. */}
      <NicknameForm initial={initial} onSave={onSave} onClose={onClose} />
    </Dialog>
  );
}

function NicknameForm({ initial, onSave, onClose }: Omit<NicknameDialogProps, 'open' | 'title'>) {
  const [typed, setTyped] = useState(initial);
  const checked = validateNickname(typed);
  const save = () => {
    if (checked.ok) onSave(checked.nickname);
  };
  return (
    <div className={styles.form}>
      <p className={styles.lead}>Other players see it online.</p>
      <TextField
        label="Nickname"
        value={typed}
        onChange={setTyped}
        problem={checked.ok ? undefined : NICKNAME_PROBLEMS[checked.reason]}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          save();
        }}
      />
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!checked.ok} onClick={save}>
          OK
        </Button>
      </div>
      <p className={styles.hint}>
        <kbd>Enter</kbd> OK <kbd>Esc</kbd> cancel
      </p>
    </div>
  );
}
