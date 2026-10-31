import { lazy, Suspense, useState } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { isOnlinePath, ROUTES } from '@/config/routes';
import { OnlineRoutes } from './online-routes';
import { MainMenuPage } from './routes/main-menu-page';
import { SettingsPage } from './routes/settings-page';

// A game's page brings Pixi, the biggest part of the app, so it loads apart, when a game opens.
const SoloPage = lazy(async () => ({ default: (await import('./routes/solo-page')).SoloPage }));

/**
 * The routes (design §13.2): the main menu, the settings, a single-player game, and online play
 * (`/online` and `/r/:code`, which share one online session for as long as the player stays in
 * them). Any other path redirects to the main menu, replacing itself in the history. The main menu
 * opens on the item it was last left from (Play online, a mode, or Settings), as the CLI's does.
 */
export function AppRouter() {
  const [chosen, setChosen] = useState<string>();
  const [location] = useLocation();
  if (isOnlinePath(location)) return <OnlineRoutes />;
  return (
    <Switch>
      <Route path={ROUTES.mainMenu}>
        <MainMenuPage initial={chosen} onChoose={setChosen} />
      </Route>
      <Route path={ROUTES.settings} component={SettingsPage} />
      <Route path={ROUTES.solo}>
        <Suspense>
          <SoloPage />
        </Suspense>
      </Route>
      <Route>
        <Redirect to={ROUTES.mainMenu} replace />
      </Route>
    </Switch>
  );
}
