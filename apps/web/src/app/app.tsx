import { Backdrop } from '@/components/backdrop';
import { NeedsKeyboard } from '@/components/needs-keyboard';
import { useNeedsKeyboard } from '@/hooks/use-needs-keyboard';
import { useTheme } from '@/hooks/use-theme';
import { Notices } from '@/lib/notices';
import styles from './app.module.css';
import { AppProvider } from './provider';
import { AppRouter } from './router';

/** The frame every screen sits in: the theme's colours, the backdrop, the routes and the notices. */
function Shell() {
  useTheme();
  const needsKeyboard = useNeedsKeyboard();
  return (
    <div className={styles.shell}>
      <Backdrop />
      {needsKeyboard ? <NeedsKeyboard /> : <AppRouter />}
      <Notices />
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
