import { parseRoomCode, type RoomMode, roomCodeInput } from '@shura/protocol';
import { useState } from 'react';
import { type MenuItem, MenuList } from '@/components/ui/menu-list';
import { TextField } from '@/components/ui/text-field';
import styles from './online-menu.module.css';

export interface OnlineMenuProps {
  readonly onQuickMatch: () => void;
  readonly onCreateRoom: (mode: RoomMode) => void;
  /** With the code as parsed: uppercased, and whole. */
  readonly onJoinRoom: (code: string) => void;
  /** *Back* (Esc): leave online play. */
  readonly onBack: () => void;
}

/** Where the menu is: its own items, the mode of a room to create, or a code to join. */
type Step = 'menu' | 'create' | 'join';

/**
 * The *Play online* menu (design §13.2, Online): **Quick match**, **Create room** (then *1v1* or
 * *FFA*), **Join room** (a code, uppercased as it's typed, with the removed characters refused at
 * once, §10.3) and *Back*. Esc steps back from a choice to the menu, and from the menu out.
 */
export function OnlineMenu({ onQuickMatch, onCreateRoom, onJoinRoom, onBack }: OnlineMenuProps) {
  const [step, setStep] = useState<Step>('menu');
  /** The item the menu opens on: the one last left from. */
  const [from, setFrom] = useState<string>();
  const go = (next: Step) => {
    if (next === 'menu') setFrom(step);
    setStep(next);
  };

  if (step === 'join') return <JoinRoom onJoin={onJoinRoom} onBack={() => go('menu')} />;

  const items: MenuItem[] =
    step === 'create'
      ? [
          { id: '1v1', label: '1v1', onSelect: () => onCreateRoom('1v1') },
          { id: 'ffa', label: 'FFA', onSelect: () => onCreateRoom('ffa') },
          { id: 'back', label: 'Back', shortcut: 'Escape', onSelect: () => go('menu') },
        ]
      : [
          { id: 'quick', label: 'Quick match', onSelect: onQuickMatch },
          { id: 'create', label: 'Create room', onSelect: () => go('create') },
          { id: 'join', label: 'Join room', onSelect: () => go('join') },
          { id: 'back', label: 'Back', shortcut: 'Escape', onSelect: onBack },
        ];
  return (
    <div className={styles.menu}>
      {step === 'create' && <h2 className={styles.step}>Create room</h2>}
      <MenuList
        // A fresh menu for each step, so its cursor starts where it should.
        key={step}
        label={step === 'create' ? 'Create room' : 'Play online'}
        items={items}
        initial={step === 'menu' ? from : undefined}
        autoFocus
      />
    </div>
  );
}

/** The characters taken out of room codes as too easily confused (design §10.3). */
const REMOVED = /[01ilo]/i;
const REFUSED = 'Codes have no 0, O, 1, I or L.';

function JoinRoom({ onJoin, onBack }: { onJoin: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [refused, setRefused] = useState(false);
  return (
    <div className={styles.join}>
      <h2 className={styles.step}>Join room</h2>
      <TextField
        label="Room code"
        className={styles.code}
        value={code}
        autoFocus
        autoCapitalize="characters"
        placeholder="K7QX"
        problem={refused ? REFUSED : undefined}
        onChange={(typed) => {
          setRefused(REMOVED.test(typed));
          setCode(roomCodeInput(typed));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            const parsed = parseRoomCode(code);
            if (parsed !== undefined) onJoin(parsed);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onBack();
          }
        }}
      />
      <p className={styles.hint}>
        <kbd>Enter</kbd> join <kbd>Esc</kbd> back
      </p>
    </div>
  );
}
