import { describe, expect, it } from 'vitest';
import { colorSchemeFor, themeClass } from './theme';

describe('theme class and color scheme', () => {
  it('forces Light and Dark, and leaves System to the browser', () => {
    expect(themeClass('light')).toBe('light');
    expect(themeClass('dark')).toBe('dark');
    expect(themeClass('system')).toBeUndefined();
    expect(themeClass(undefined)).toBeUndefined();
    expect(colorSchemeFor('dark')).toBe('dark');
    expect(colorSchemeFor('light')).toBe('light');
    expect(colorSchemeFor('system')).toBe('light dark');
    expect(colorSchemeFor(undefined)).toBe('light dark');
  });
});
