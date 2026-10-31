import { SOLO_MODES, type SoloMode } from '@shura/client-core';
import { Redirect, useLocation, useParams } from 'wouter';
import { Panel } from '@/components/panel';
import { MenuList } from '@/components/ui/menu-list';
import { MODE_NAMES } from '@/config/modes';
import { ROUTES } from '@/config/routes';
import styles from './placeholder-page.module.css';

const isSoloMode = (mode: string | undefined): mode is SoloMode =>
  (SOLO_MODES as readonly (string | undefined)[]).includes(mode);

/**
 * A single-player game of the route's mode: a placeholder until #43. Any mode but `sprint`,
 * `marathon` or `ultra` redirects to the main menu (design §13.2).
 */
export function SoloPage() {
  const { mode } = useParams<{ mode: string }>();
  const [, navigate] = useLocation();
  if (!isSoloMode(mode)) return <Redirect to={ROUTES.mainMenu} replace />;
  return (
    <main>
      <Panel>
        <h1 className={styles.title}>{MODE_NAMES[mode]}</h1>
        <p className={styles.soon}>Coming soon</p>
        <MenuList
          label={MODE_NAMES[mode]}
          items={[{ id: 'back', label: 'Back to menu', onSelect: () => navigate(ROUTES.mainMenu) }]}
          autoFocus
        />
      </Panel>
    </main>
  );
}
