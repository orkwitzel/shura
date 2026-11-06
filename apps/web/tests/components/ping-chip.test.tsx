import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { PingChip } from '@/components/ping-chip';

describe('PingChip', () => {
  test('shows the ping in whole milliseconds', () => {
    render(<PingChip ping={41.6} />);
    expect(screen.getByText(/42 ms/)).toBeInTheDocument();
  });

  test('shows nothing before the first ping is back', () => {
    const { container } = render(<PingChip ping={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test.each([
    [79, 'good'],
    [80, 'fair'],
    [150, 'poor'],
  ] as const)('colours %i ms as %s (client-core’s pingQuality)', (ms, quality) => {
    const { container } = render(<PingChip ping={ms} />);
    expect(container.querySelector(`[data-quality="${quality}"]`)).not.toBeNull();
  });
});
