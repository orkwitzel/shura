import { ClientCoreProvider } from '@shura/client-core/react';
import type { ReactNode } from 'react';
import { recordsStore } from '@/stores/records-store';
import { settingsStore } from '@/stores/settings-store';

/** Gives the app the settings and records stores, where client-core's hooks find them. */
export function AppProvider({ children }: { readonly children?: ReactNode }) {
  return (
    <ClientCoreProvider settings={settingsStore} records={recordsStore}>
      {children}
    </ClientCoreProvider>
  );
}
