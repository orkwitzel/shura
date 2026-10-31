import { lazy, Suspense, useState } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { ROUTES } from '@/config/routes';
import { MainMenuPage } from './routes/main-menu-page';
import { SettingsPage } from './routes/settings-page';

// A game's page brings Pixi, the biggest part of the app, so it loads apart, when a game opens.
const SoloPage = lazy(async () => ({ default: (await import('./routes/solo-page')).SoloPage }));

/**
 * The routes (design §13.2): the main menu, the settings and a single-player game. Any other path
 * redirects to the main menu, replacing itself in the history. The main menu opens on the item it
 * was last left from (a mode, or Settings), as the CLI's does.
 */
export function AppRouter() {
  const [chosen, setChosen] = useState<string>();
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
