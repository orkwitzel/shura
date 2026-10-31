import { useLocation } from 'wouter';
import { Panel } from '@/components/panel';
import { MenuList } from '@/components/ui/menu-list';
import { ROUTES } from '@/config/routes';
import styles from './placeholder-page.module.css';

/** The settings screen: a placeholder until #46. */
export function SettingsPage() {
  const [, navigate] = useLocation();
  return (
    <main>
      <Panel>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.soon}>Coming soon</p>
        <MenuList
          label="Settings"
          items={[{ id: 'back', label: 'Back to menu', onSelect: () => navigate(ROUTES.mainMenu) }]}
          autoFocus
        />
      </Panel>
    </main>
  );
}
