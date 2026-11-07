import type { OnlineSession } from '@shura/client-core';
import { type RoomLookup, useSettings, useSettingsStore } from '@shura/client-core/react';
import { suggestNickname } from '@shura/protocol';
import { useState } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { useStore } from 'zustand';
import { Panel } from '@/components/panel';
import { ROUTES } from '@/config/routes';
import { ConnectionScreen } from '@/features/connection/components/connection-screen';
import { ReconnectingBanner } from '@/features/connection/components/reconnecting-banner';
import { NicknameDialog } from '@/features/nickname/components/nickname-dialog';
import { useOnlineSession } from '@/hooks/online/use-online-session';
import { useRoomAddress } from '@/hooks/online/use-room-address';
import { useRoomLink } from '@/hooks/online/use-room-link';
import styles from './online-routes.module.css';
import { OnlinePage } from './routes/online-page';
import { RoomPage } from './routes/room-page';

/**
 * Online play's routes, `/online` and `/r/:code` (design §13.2, Online), over one online session:
 * opened as the player enters them (after the nickname prompt, the first time) and closed as they
 * leave for the rest of the app. A room's route checks its room first (`useRoomLink`), before the
 * prompt. Until the session is connected they show how the connection is going; once it is, the
 * page for the route, with "Reconnecting…" while the connection is down: across the top of
 * `/online`, and where the room's page puts it on `/r/:code` (once, never over another banner).
 */
export function OnlineRoutes() {
  const [, navigate] = useLocation();
  const settings = useSettingsStore();
  const nickname = useSettings((state) => state.nickname) || undefined;
  const [suggestion] = useState(() => suggestNickname());
  const { session, retry } = useOnlineSession(nickname);
  const link = useRoomLink(session);

  if (nickname === undefined) {
    return (
      <main className={styles.page}>
        <NicknameDialog
          open
          initial={suggestion}
          onClose={() => navigate(ROUTES.mainMenu)}
          onSave={(chosen) => {
            settings.update({ nickname: chosen });
            settings.save();
          }}
        />
      </main>
    );
  }
  return session && <Connected session={session} retry={retry} link={link} />;
}

interface ConnectedProps {
  readonly session: OnlineSession;
  readonly retry: () => void;
  readonly link: RoomLookup;
}

function Connected({ session, retry, link }: ConnectedProps) {
  const [, navigate] = useLocation();
  const connection = useStore(session, (state) => state.connection);
  useRoomAddress(session, link);

  if (connection.status !== 'connected' && connection.status !== 'reconnecting') {
    return (
      <main className={styles.page}>
        <Panel>
          <ConnectionScreen
            connection={connection}
            onRetry={retry}
            onBack={() => navigate(ROUTES.mainMenu)}
            onReload={() => window.location.reload()}
          />
        </Panel>
      </main>
    );
  }
  return (
    <Switch>
      <Route path={ROUTES.online}>
        {connection.status === 'reconnecting' && <ReconnectingBanner />}
        <OnlinePage session={session} />
      </Route>
      <Route path={ROUTES.room}>
        {({ code }) => <RoomPage key={code} session={session} code={code} />}
      </Route>
    </Switch>
  );
}
