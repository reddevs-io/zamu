// The Zamu mark: which drawing it picks for its size, its colours, and how assistive tech sees it.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ZamuMark } from './Logo';

function mark(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg[data-glyph="zamu"]');
  if (!(svg instanceof SVGSVGElement)) throw new Error('no mark');
  return svg;
}

describe('ZamuMark', () => {
  it('uses the 16 px grid drawing below 32 px and the full drawing from 32 px', () => {
    const small = render(<ZamuMark size={16} />);
    expect(mark(small.container).getAttribute('viewBox')).toBe('0 0 16 16');
    const large = render(<ZamuMark size={32} />);
    expect(mark(large.container).getAttribute('viewBox')).toBe('7 7 50 50');
    expect(mark(large.container).getAttribute('width')).toBe('32');
  });

  it('draws one accent quarter, or none when mono', () => {
    const { container, rerender } = render(<ZamuMark size={64} />);
    expect(container.querySelectorAll('.fill-accent')).toHaveLength(1);
    expect(container.querySelectorAll('.fill-fg')).toHaveLength(3);
    rerender(<ZamuMark size={64} mono />);
    expect(container.querySelectorAll('.fill-accent')).toHaveLength(0);
  });

  it('is hidden from assistive tech unless it has a label', () => {
    const { container, rerender } = render(<ZamuMark />);
    expect(mark(container).getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<ZamuMark label="Zamu" />);
    expect(screen.getByRole('img', { name: 'Zamu' })).toBeTruthy();
  });
});
