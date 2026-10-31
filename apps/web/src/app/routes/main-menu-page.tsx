import { SOLO_MODES } from '@shura/client-core';
import { useRecordsStore, useSettingsStore } from '@shura/client-core/react';
import { useLocation } from 'wouter';
import { Logo } from '@/components/logo';
import { Panel } from '@/components/panel';
import { type MenuItem, MenuList } from '@/components/ui/menu-list';
import { MODE_NAMES } from '@/config/modes';
import { ROUTES, soloPath } from '@/config/routes';
import { PersonalBestSummary } from '@/features/personal-bests/components/personal-best-summary';
import styles from './main-menu-page.module.css';

/**
 * The main menu (design §13.2): Play online (disabled until M4), the single-player modes, each with
 * its personal best, and Settings. There is no Quit. Below it, why the stored settings or records
 * couldn't be used, if they couldn't.
 */
export function MainMenuPage() {
  const [, navigate] = useLocation();
  const notices = [useSettingsStore().problem, useRecordsStore().problem].filter(
    (notice) => notice !== null,
  );

  const items: MenuItem[] = [
    {
      id: 'online',
      label: 'Play online',
      detail: 'coming soon',
      disabled: true,
      onSelect: () => {},
    },
    ...SOLO_MODES.map(
      (mode, index): MenuItem => ({
        id: mode,
        label: MODE_NAMES[mode],
        detail: <PersonalBestSummary mode={mode} />,
        heading: index === 0 ? 'Single player' : undefined,
        onSelect: () => navigate(soloPath(mode)),
      }),
    ),
    { id: 'settings', label: 'Settings', onSelect: () => navigate(ROUTES.settings) },
  ];

  return (
    <main className={styles.page}>
      <Panel>
        <Logo />
        <p className={styles.tagline}>שורה · row by row</p>
        <MenuList label="Main menu" items={items} autoFocus />
        <p className={styles.hint}>
          <kbd>↑</kbd>
          <kbd>↓</kbd> choose <kbd>Enter</kbd> select
        </p>
      </Panel>
      {notices.length > 0 && (
        <div role="status" className={styles.notices}>
          {notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      )}
    </main>
  );
}
