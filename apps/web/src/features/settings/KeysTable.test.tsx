import type { ApiKeySummary } from '@pm/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KeysTable } from './KeysTable';

const ana = { id: '00000000-0000-4000-8000-000000000001', name: 'Ana Ruiz', kind: 'person' as const };
const claude = { id: '00000000-0000-4000-8000-000000000002', name: 'claude-dev', kind: 'agent' as const };

export function keySummary(overrides: Partial<ApiKeySummary> = {}): ApiKeySummary {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'CI runner',
    start: 'pm_live_Vb81',
    owner: claude,
    scope: { projects: 'all', access: 'write' },
    revoked: false,
    createdAt: '2026-10-12T10:00:00.000Z',
    lastUsedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe('KeysTable', () => {
  it('shows active keys with Revoke and revoked keys with the Revoked tag', async () => {
    const onRevoke = vi.fn();
    const active = keySummary();
    const revoked = keySummary({
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Old laptop',
      owner: ana,
      revoked: true,
      scope: {
        projects: [
          { id: '20000000-0000-4000-8000-000000000001', key: 'PAY', name: 'Payments' },
          { id: '20000000-0000-4000-8000-000000000002', key: 'CLI', name: 'pm CLI' },
        ],
        access: 'read',
      },
    });
    render(<KeysTable keys={[active, revoked]} onRevoke={onRevoke} />);

    const rows = screen.getAllByRole('row');
    const activeRow = rows.find((row) => within(row).queryByText('CI runner'));
    const revokedRow = rows.find((row) => within(row).queryByText('Old laptop'));
    if (!activeRow || !revokedRow) throw new Error('rows not rendered');

    expect(within(activeRow).getByText('pm_live_Vb81…')).toBeInTheDocument();
    expect(within(activeRow).getByText('Workspace · read and write')).toBeInTheDocument();
    expect(within(revokedRow).getByText('PAY, CLI · read only')).toBeInTheDocument();
    expect(within(revokedRow).getByText('Revoked')).toBeInTheDocument();
    expect(within(revokedRow).queryByRole('button', { name: /Revoke/ })).not.toBeInTheDocument();

    await userEvent.click(within(activeRow).getByRole('button', { name: 'Revoke CI runner' }));
    expect(onRevoke).toHaveBeenCalledWith(active);
  });
});
