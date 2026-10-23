import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditProjectDialog, projectChanges } from './EditProjectDialog';

vi.mock('~/lib/orpc', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  const fail = (): unknown =>
    new Proxy(() => {}, {
      get: (_target, key) => (typeof key === 'string' ? fail() : undefined),
      apply: () => Promise.reject(new Error('no API in these tests')),
    });
  const client = fail();
  return { client, orpc: createTanstackQueryUtils(client as never) };
});

const PROJECT = {
  key: 'PAY',
  name: 'Payments',
  description: 'Checkout and refunds',
  usesMilestones: true,
  usesCycles: true,
};

function setup(onSubmit = vi.fn().mockResolvedValue(null)) {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<EditProjectDialog isOpen onClose={onClose} project={PROJECT} onSubmit={onSubmit} />);
  return { user, onSubmit, onClose };
}

describe('EditProjectDialog', () => {
  it('shows the project with both switches on', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Edit project' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Payments');
    expect(screen.getByRole('switch', { name: 'Use milestones' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Use cycles' })).toBeChecked();
  });

  it('sends only what changed', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('switch', { name: 'Use cycles' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ usesCycles: false });
  });

  it('closes without a request when nothing changed', async () => {
    const { user, onSubmit, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses an empty name and shows server errors', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ message: "You don't have permission to change this project." });
    const { user } = setup(onSubmit);
    await user.clear(screen.getByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a project name.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Name'), 'Billing');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Billing' });
    expect(await screen.findByText("You don't have permission to change this project.")).toBeInTheDocument();
  });

  it('computes changes, clearing an emptied description', () => {
    expect(
      projectChanges(PROJECT, {
        name: ' Payments ',
        description: '  ',
        usesMilestones: false,
        usesCycles: true,
      }),
    ).toEqual({ description: null, usesMilestones: false });
  });
});
