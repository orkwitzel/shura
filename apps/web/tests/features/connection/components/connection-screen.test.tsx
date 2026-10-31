import type { OnlineConnection } from '@shura/client-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ConnectionScreen } from '@/features/connection/components/connection-screen';

function show(connection: OnlineConnection) {
  const props = { onRetry: vi.fn(), onBack: vi.fn(), onReload: vi.fn() };
  render(<ConnectionScreen connection={connection} {...props} />);
  return props;
}

describe('ConnectionScreen', () => {
  test('says it’s connecting, and Esc goes back', async () => {
    const { onBack } = show({ status: 'connecting' });
    expect(screen.getByRole('status')).toHaveTextContent('Connecting…');
    await userEvent.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledOnce();
  });

  test('when the server can’t be reached, offers Retry (Enter) and Back (Esc)', async () => {
    const { onRetry, onBack } = show({
      status: 'failed',
      reason: 'unreachable',
      message: "Can't reach the server.",
    });
    expect(screen.getByRole('heading', { name: 'Can’t reach the server' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onRetry).toHaveBeenCalledOnce();
    await userEvent.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledOnce();
  });

  test('another failure shows the server’s words, with Retry', () => {
    show({
      status: 'failed',
      reason: 'too_many_connections',
      message: 'Too many connections from your network. Try again in a minute.',
    });
    expect(screen.getByRole('heading', { name: 'Can’t play online' })).toBeInTheDocument();
    expect(screen.getByText(/Too many connections from your network/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });

  test('a version mismatch says a new version is out, and Enter reloads the page', async () => {
    const { onReload, onRetry } = show({
      status: 'failed',
      reason: 'version_mismatch',
      message: 'A new version of Shura is out: update to play online.',
    });
    expect(
      screen.getByRole('heading', { name: 'A new version of Shura is out' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(onReload).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
