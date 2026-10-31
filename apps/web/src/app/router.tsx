import { Redirect, Route, Switch } from 'wouter';
import { ROUTES } from '@/config/routes';
import { MainMenuPage } from './routes/main-menu-page';
import { SettingsPage } from './routes/settings-page';
import { SoloPage } from './routes/solo-page';

/**
 * The routes (design §13.2): the main menu, the settings and a single-player game. Any other path
 * redirects to the main menu, replacing itself in the history.
 */
export function AppRouter() {
  return (
    <Switch>
      <Route path={ROUTES.mainMenu} component={MainMenuPage} />
      <Route path={ROUTES.settings} component={SettingsPage} />
      <Route path={ROUTES.solo} component={SoloPage} />
      <Route>
        <Redirect to={ROUTES.mainMenu} replace />
      </Route>
    </Switch>
  );
}
