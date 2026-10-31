import { act, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { setMedia } from '../support/match-media';

const QUERY = '(prefers-reduced-motion: reduce)';

function Motion() {
  return <p>{useReducedMotion() ? 'reduced' : 'full'}</p>;
}

describe('useReducedMotion', () => {
  test('is false when the system asks for no reduction', () => {
    render(<Motion />);
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  test('is true when the system asks for reduced motion', () => {
    setMedia(QUERY, true);
    render(<Motion />);
    expect(screen.getByText('reduced')).toBeInTheDocument();
  });

  test('follows the system setting as it changes', () => {
    render(<Motion />);
    act(() => setMedia(QUERY, true));
    expect(screen.getByText('reduced')).toBeInTheDocument();
    act(() => setMedia(QUERY, false));
    expect(screen.getByText('full')).toBeInTheDocument();
  });
});
