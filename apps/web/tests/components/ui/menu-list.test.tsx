import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { type MenuItem, MenuList } from '@/components/ui/menu-list';

function menu(overrides: Partial<Record<string, Partial<MenuItem>>> = {}) {
  const selected = vi.fn<(id: string) => void>();
  const items: MenuItem[] = ['online', 'sprint', 'marathon', 'ultra', 'settings'].map((id) => ({
    id,
    label: id[0]?.toUpperCase() + id.slice(1),
    onSelect: () => selected(id),
    ...overrides[id],
  }));
  return { items, selected };
}

const item = (name: string) => screen.getByRole('menuitem', { name });

describe('MenuList', () => {
  test('lists its items as a menu, the first one focused', () => {
    const { items } = menu();
    render(<MenuList label="Main menu" items={items} autoFocus />);
    expect(screen.getByRole('menu', { name: 'Main menu' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
    expect(item('Online')).toHaveFocus();
  });

  test('starts on the initial item', () => {
    const { items } = menu();
    render(<MenuList label="Main menu" items={items} initial="settings" autoFocus />);
    expect(item('Settings')).toHaveFocus();
  });

  test('the arrows move between items and Enter chooses one', async () => {
    const { items, selected } = menu();
    render(<MenuList label="Main menu" items={items} autoFocus />);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(item('Marathon')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(item('Sprint')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(selected).toHaveBeenCalledExactlyOnceWith('sprint');
  });

  test('the arrows stop at the ends, as in the CLI', async () => {
    const { items } = menu();
    render(<MenuList label="Main menu" items={items} autoFocus />);
    await userEvent.keyboard('{ArrowUp}');
    expect(item('Online')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown>6/}');
    expect(item('Settings')).toHaveFocus();
  });

  test('the arrows skip disabled items', async () => {
    const { items, selected } = menu({ online: { disabled: true }, marathon: { disabled: true } });
    render(<MenuList label="Main menu" items={items} autoFocus />);
    expect(item('Sprint')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(item('Ultra')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(item('Sprint')).toHaveFocus();
    expect(item('Online')).toBeDisabled();
    await userEvent.click(item('Online'));
    expect(selected).not.toHaveBeenCalled();
  });

  test('clicking an item chooses it', async () => {
    const { items, selected } = menu();
    render(<MenuList label="Main menu" items={items} />);
    await userEvent.click(item('Ultra'));
    expect(selected).toHaveBeenCalledExactlyOnceWith('ultra');
  });

  test("an item's detail describes it", () => {
    const { items } = menu({ online: { detail: 'coming soon' } });
    render(<MenuList label="Main menu" items={items} />);
    expect(item('Online')).toHaveAccessibleDescription('coming soon');
  });

  test('only the current item is in the tab order', async () => {
    const { items } = menu();
    render(<MenuList label="Main menu" items={items} autoFocus />);
    await userEvent.keyboard('{ArrowDown}');
    const inTabOrder = screen
      .getAllByRole('menuitem')
      .filter((each) => each.getAttribute('tabindex') === '0');
    expect(inTabOrder).toEqual([item('Sprint')]);
  });
});
