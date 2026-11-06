import { ClientCoreProvider } from '@shura/client-core/react';
import type { ReactNode } from 'react';
import { serverApi } from '@/lib/server-api';
import { recordsStore } from '@/stores/records-store';
import { settingsStore } from '@/stores/settings-store';

/**
 * Gives the app the settings and records stores, and the server's API client, where client-core's
 * hooks find them.
 */
export function AppProvider({ children }: { readonly children?: ReactNode }) {
  return (
    <ClientCoreProvider settings={settingsStore} records={recordsStore} api={serverApi}>
      {children}
    </ClientCoreProvider>
  );
}
