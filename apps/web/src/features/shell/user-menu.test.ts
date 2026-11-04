import { describe, expect, it } from 'vitest';
import { personMenuSubtitle, userMenuSubtitle } from './user-menu';

const workspace = { id: 'w', name: 'Reddevs', slug: 'reddevs' };

describe('person menu subtitle', () => {
  it('shows the role and the workspace', () => {
    expect(userMenuSubtitle({ role: 'admin', workspace })).toBe('Admin · Reddevs');
  });

  it('shows the email, or the role and workspace when there is none', () => {
    expect(personMenuSubtitle({ role: 'member', workspace, user: { email: 'ana@northwind.dev' } })).toBe(
      'ana@northwind.dev',
    );
    expect(personMenuSubtitle({ role: 'admin', workspace, user: { email: null } })).toBe('Admin · Reddevs');
  });
});
