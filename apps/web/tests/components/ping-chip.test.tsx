import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { PingChip, pingQuality } from '@/components/ping-chip';

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
    [0, 'good'],
    [79, 'good'],
    [80, 'fair'],
    [149, 'fair'],
    [150, 'poor'],
    [400, 'poor'],
  ] as const)('%i ms is %s: green under 80, yellow under 150, red above', (ms, quality) => {
    expect(pingQuality(ms)).toBe(quality);
  });
});
