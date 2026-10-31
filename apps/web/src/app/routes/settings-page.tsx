import { useLocation } from 'wouter';
import { Panel } from '@/components/panel';
import { ROUTES } from '@/config/routes';
import { SettingsForm } from '@/features/settings/components/settings-form';
import styles from './settings-page.module.css';

/** The settings screen at `/settings` (design §13.2). Esc or Back returns to the main menu. */
export function SettingsPage() {
  const [, navigate] = useLocation();
  return (
    <main className={styles.page}>
      <Panel className={styles.panel}>
        <h1 className={styles.title}>Settings</h1>
        <SettingsForm onClose={() => navigate(ROUTES.mainMenu)} />
      </Panel>
    </main>
  );
}
