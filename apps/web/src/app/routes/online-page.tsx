import type { OnlineSession } from '@shura/client-core';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore } from 'zustand';
import { Panel } from '@/components/panel';
import { ROUTES } from '@/config/routes';
import { OnlineMenu } from '@/features/online-menu/components/online-menu';
import { QuickMatchWait } from '@/features/online-menu/components/quick-match-wait';
import styles from './online-page.module.css';

/**
 * *Play online* at `/online` (design §13.2, Online): the menu, and the quick-match waiting screen
 * while the player waits for a match (a match found takes them on to its room), or "Opponent left"
 * when the quick-match opponent left. Esc from the menu goes back to the main menu.
 */
export function OnlinePage({ session }: { readonly session: OnlineSession }) {
  const [, navigate] = useLocation();
  const quickMatch = useStore(session, (state) => state.quickMatch);
  const nickname = useStore(session, (state) => state.nickname);
  /** When the player asked for a quick match, while they wait for one. */
  const [searchingSince, setSearchingSince] = useState<number | null>(null);
  const [leftSeen, setLeftSeen] = useState(false);

  // A refusal (the cooldown after cancelling, say) ends the wait; its notice says why.
  useEffect(
    () =>
      session.subscribe((state, before) => {
        if (state.error && state.error !== before.error) setSearchingSince(null);
      }),
    [session],
  );

  const search = () => {
    session.quickMatch();
    setSearchingSince(performance.now());
  };

  let screen: React.ReactNode;
  if (searchingSince !== null) {
    screen = (
      <QuickMatchWait
        status="searching"
        since={searchingSince}
        onCancel={() => {
          session.cancelQuickMatch();
          setSearchingSince(null);
        }}
        onSearchAgain={search}
      />
    );
  } else if (quickMatch === 'opponentLeft' && !leftSeen) {
    screen = (
      <QuickMatchWait
        status="opponentLeft"
        since={0}
        onCancel={() => setLeftSeen(true)}
        onSearchAgain={() => {
          setLeftSeen(true);
          search();
        }}
      />
    );
  } else {
    screen = (
      <>
        <h1 className={styles.title}>Play online</h1>
        {nickname !== null && <p className={styles.as}>as {nickname}</p>}
        <OnlineMenu
          onQuickMatch={search}
          onCreateRoom={session.createRoom}
          onJoinRoom={session.joinRoom}
          onBack={() => navigate(ROUTES.mainMenu)}
        />
      </>
    );
  }
  return (
    <main className={styles.page}>
      <Panel>{screen}</Panel>
    </main>
  );
}
