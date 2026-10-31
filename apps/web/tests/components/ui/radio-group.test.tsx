import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { RadioGroup } from '@/components/ui/radio-group';

const OPTIONS = [
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced', detail: 'no shake' },
  { value: 'off', label: 'Off' },
] as const;

describe('RadioGroup', () => {
  test('is a group of native radios named by its label, the value checked', () => {
    render(<RadioGroup label="Effects" options={OPTIONS} value="reduced" onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Effects' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Reduced/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Full' })).not.toBeChecked();
  });

  test('a click chooses an option', async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<RadioGroup label="Effects" options={OPTIONS} value="full" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('off');
  });

  test('the arrows choose the next option, from the keyboard alone', async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<RadioGroup label="Effects" options={OPTIONS} value="full" onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Full' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('reduced');
  });

  test('with no value, none is checked', () => {
    render(<RadioGroup label="Effects" options={OPTIONS} value={undefined} onChange={vi.fn()} />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });
});
