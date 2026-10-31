import { Backdrop } from '@/components/backdrop';
import { NeedsKeyboard } from '@/components/needs-keyboard';
import { useNeedsKeyboard } from '@/hooks/use-needs-keyboard';
import { useTheme } from '@/hooks/use-theme';
import styles from './app.module.css';
import { AppProvider } from './provider';
import { AppRouter } from './router';

/** The frame every screen sits in: the theme's colours, the backdrop, and the routes. */
function Shell() {
  useTheme();
  const needsKeyboard = useNeedsKeyboard();
  return (
    <div className={styles.shell}>
      <Backdrop />
      {needsKeyboard ? <NeedsKeyboard /> : <AppRouter />}
    </div>
  );
}

/** The web app (design §13.2). */
export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
