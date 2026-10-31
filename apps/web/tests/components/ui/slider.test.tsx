import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { Slider } from '@/components/ui/slider';

describe('Slider', () => {
  test('is a native range named by its label, showing its value as text', () => {
    render(
      <Slider
        label="DAS"
        min={0}
        max={20}
        value={10}
        valueText="167 ms (10 frames)"
        onChange={vi.fn()}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'DAS' });
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveValue('10');
    expect(slider).toHaveAttribute('aria-valuetext', '167 ms (10 frames)');
    expect(screen.getByText('167 ms (10 frames)')).toBeInTheDocument();
  });

  test('reports a new value as a number', () => {
    const onChange = vi.fn<(value: number) => void>();
    render(<Slider label="Volume" min={0} max={10} value={5} valueText="50" onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '7' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(7);
  });
});
