import { describe, expect, it } from 'vitest';
import { userMenuSubtitle } from './user-menu';

describe('userMenuSubtitle', () => {
  it('shows the role and the workspace', () => {
    expect(
      userMenuSubtitle({ role: 'admin', workspace: { id: 'w', name: 'Reddevs', slug: 'reddevs' } }),
    ).toBe('Admin · Reddevs');
  });
});
