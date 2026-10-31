import type { Clock, Direction, OnlineSession } from '@shura/client-core';
import { ROOM_CODE_LENGTH, roomCodeInput } from '@shura/protocol';
import { Box, Text } from 'ink';
import { useState } from 'react';
import { useStore } from 'zustand';
import { typedText } from '../../platform/input/typed-text';
import { useScreenKeys } from '../../platform/input/use-screen-keys';
import type { OnlineStart } from './online-start';

export interface PlayOnlineMenuProps {
  readonly session: OnlineSession;
  /** The server's URL, for "Can't reach the server". */
  readonly server: string;
  readonly clock: Pick<Clock, 'now'>;
  /** Whether it takes keys: not while it can't be seen. */
  readonly active: boolean;
  /** A line about the last thing asked for (the server's error, in plain words), if any. */
  readonly message: string | null;
  /** Quick match, a new room, or a room by its code. */
  readonly onStart: (start: OnlineStart) => void;
  /** Connect again, after the connection failed. */
  readonly onRetry: () => void;
  /** Back to the main menu. */
  readonly onBack: () => void;
}

type Page = 'main' | 'create' | 'join' | 'failed';

interface Entry {
  readonly label: string;
  readonly detail?: string;
  readonly run: () => void;
}

const WIDTH = 56;
const LABEL_WIDTH = 16;

/**
 * The *Play online* menu (design §13.2, §13.3): Quick match, Create room (1v1 or FFA), Join room (a
 * code typed in, uppercased as it's typed, the characters codes don't have refused) and Back. Under
 * it, how the connection is: "Connecting…", "Reconnecting…", or, once it has failed, why
 * ("Can't reach the server" and its URL) with Retry in the menu's place.
 */
export function PlayOnlineMenu({
  session,
  server,
  clock,
  active,
  message,
  onStart,
  onRetry,
  onBack,
}: PlayOnlineMenuProps) {
  const connection = useStore(session, (state) => state.connection);
  const failed = connection.status === 'failed';
  const [chosen, setPage] = useState<Page>('main');
  const page: Page = failed ? 'failed' : chosen === 'failed' ? 'main' : chosen;
  const [cursors, setCursors] = useState<Record<Page, number>>({
    main: 0,
    create: 0,
    join: 0,
    failed: 0,
  });
  const [code, setCode] = useState('');
  const [refused, setRefused] = useState(false);

  const pages: Record<Page, { title: string; hint: string; entries: Entry[] }> = {
    main: {
      title: 'PLAY ONLINE',
      hint: '↑↓ choose  Enter select  Esc back',
      entries: [
        {
          label: 'Quick match',
          detail: 'a 1v1 against the next player',
          run: () => onStart({ action: 'quick' }),
        },
        { label: 'Create room', detail: '1v1 or FFA, with a code', run: () => setPage('create') },
        { label: 'Join room', detail: 'by its code', run: () => setPage('join') },
        { label: 'Back', run: onBack },
      ],
    },
    create: {
      title: 'CREATE ROOM',
      hint: '↑↓ choose  Enter create  Esc back',
      entries: [
        {
          label: '1v1',
          detail: '2 players',
          run: () => onStart({ action: 'create', mode: '1v1' }),
        },
        {
          label: 'FFA',
          detail: 'up to 8 players',
          run: () => onStart({ action: 'create', mode: 'ffa' }),
        },
      ],
    },
    join: {
      title: 'JOIN ROOM',
      hint: `Type the ${ROOM_CODE_LENGTH}-character code  Enter join  Esc back`,
      entries: [],
    },
    failed: {
      title: 'PLAY ONLINE',
      hint: '↑↓ choose  Enter select  Esc back',
      entries: [
        { label: 'Retry', run: onRetry },
        { label: 'Back', run: onBack },
      ],
    },
  };
  const { title, hint, entries } = pages[page];
  const cursor = cursors[page];
  const move = (direction: Direction) =>
    setCursors((at) => ({
      ...at,
      [page]: Math.min(Math.max(at[page] + direction, 0), entries.length - 1),
    }));

  const typeCode = (text: string) => {
    const next = roomCodeInput(code + text);
    // A character a code can't have is refused as it's typed (design §10.3).
    setRefused(next.length < Math.min(code.length + [...text].length, ROOM_CODE_LENGTH));
    setCode(next);
  };

  useScreenKeys({ active, clock }, (raw, press) => {
    const { key } = raw;
    if (key.eventType === 'release') return;
    if (page === 'join') {
      if (key.escape && press) {
        setPage('main');
        setCode('');
        setRefused(false);
      } else if (key.return && press) {
        if (code.length === ROOM_CODE_LENGTH) onStart({ action: 'join', code });
      } else if (key.backspace || key.delete) {
        setCode((typed) => typed.slice(0, -1));
        setRefused(false);
      } else {
        const text = typedText(raw);
        if (text !== null) typeCode(text);
      }
      return;
    }
    if (key.upArrow) move(-1);
    else if (key.downArrow) move(1);
    else if (key.return && press) entries[cursor]?.run();
    else if (key.escape && press) {
      if (page === 'create') setPage('main');
      else onBack();
    }
  });

  return (
    <Box flexDirection="column" width={WIDTH} marginTop={2}>
      <Text bold color="yellow">
        {title}
      </Text>
      <Box flexDirection="column" marginY={1}>
        {page === 'join' ? (
          <JoinField code={code} refused={refused} />
        ) : (
          entries.map((entry, at) => (
            <Box key={entry.label}>
              <Text>{at === cursor ? '› ' : '  '}</Text>
              <Box width={LABEL_WIDTH}>
                <Text bold={at === cursor}>{entry.label}</Text>
              </Box>
              {entry.detail !== undefined && <Text dimColor>{entry.detail}</Text>}
            </Box>
          ))
        )}
      </Box>
      <Text dimColor>{hint}</Text>
      <Box flexDirection="column" marginTop={1}>
        <ConnectionLine connection={connection} server={server} />
        {message !== null && <Text color="yellow">{message}</Text>}
      </Box>
    </Box>
  );
}

/** The code as typed so far, with the places still to type. */
function JoinField({ code, refused }: { code: string; refused: boolean }) {
  const rest = '_'.repeat(ROOM_CODE_LENGTH - code.length);
  return (
    <Box flexDirection="column">
      <Text>
        {'Code  '}
        <Text bold inverse>
          {` ${code}${rest} `}
        </Text>
      </Text>
      {refused && <Text dimColor>Codes have no 0, O, 1, I or L.</Text>}
    </Box>
  );
}

/** How the connection is, in words: nothing once it's up. */
function ConnectionLine({
  connection,
  server,
}: {
  connection: ReturnType<OnlineSession['getState']>['connection'];
  server: string;
}) {
  switch (connection.status) {
    case 'connecting':
      return <Text dimColor>Connecting…</Text>;
    case 'reconnecting':
      return <Text color="yellow">Reconnecting…</Text>;
    case 'failed':
      return connection.reason === 'unreachable' ? (
        <Text color="red">Can't reach the server at {server}</Text>
      ) : (
        <Text color="red">{connection.message}</Text>
      );
    default:
      return null;
  }
}
