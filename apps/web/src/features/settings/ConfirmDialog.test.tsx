import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { SettingsError } from './result';

function Harness({ onConfirm }: { onConfirm: () => Promise<unknown> }) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      isOpen={open}
      onOpenChange={setOpen}
      title="Revoke key?"
      confirmLabel="Revoke"
      onConfirm={onConfirm}
    >
      "CI runner" stops working right away.
    </ConfirmDialog>
  );
}

describe('ConfirmDialog (revoke)', () => {
  it('runs the action and closes', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Harness onConfirm={onConfirm} />);
    expect(screen.getByRole('alertdialog', { name: 'Revoke key?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('stays open with the server message when the action fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(
      new SettingsError({
        code: 'FORBIDDEN',
        message: 'You can revoke only your own keys or keys of agents you are responsible for',
        issues: [],
      }),
    );
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can revoke only your own keys or keys of agents you are responsible for',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('closes without running the action on Cancel', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
