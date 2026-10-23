import { REPOSITORY_URL_HINT } from '@pm/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditProjectDialog, type EditProjectDialogProps, projectChanges } from './EditProjectDialog';

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

const PROJECT: EditProjectDialogProps['project'] = {
  key: 'PAY',
  name: 'Payments',
  description: 'Checkout and refunds',
  usesMilestones: true,
  usesCycles: true,
  repository: 'https://gitlab.com/reddevs/payments.git',
};

function setup(onSubmit = vi.fn().mockResolvedValue(null), project = PROJECT) {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<EditProjectDialog isOpen onClose={onClose} project={project} onSubmit={onSubmit} />);
  return { user, onSubmit, onClose, repository: () => screen.getByLabelText(/Repository/) };
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
        repository: ' https://gitlab.com/reddevs/payments.git ',
        usesMilestones: false,
        usesCycles: true,
      }),
    ).toEqual({ description: null, usesMilestones: false });
  });

  it('computes repository changes: new URL, cleared to null, unchanged left out', () => {
    const values = {
      name: 'Payments',
      description: 'Checkout and refunds',
      repository: '',
      usesMilestones: true,
      usesCycles: true,
    };
    expect(projectChanges(PROJECT, { ...values, repository: 'git@gitlab.com:reddevs/pay.git' })).toEqual({
      repository: 'git@gitlab.com:reddevs/pay.git',
    });
    expect(projectChanges(PROJECT, { ...values, repository: '  ' })).toEqual({ repository: null });
    expect(projectChanges({ ...PROJECT, repository: null }, { ...values, repository: '' })).toEqual({});
  });
});

describe('EditProjectDialog repository', () => {
  it('shows the linked repository with the short form and pm link', () => {
    const { repository } = setup();
    expect(repository()).toHaveValue('https://gitlab.com/reddevs/payments.git');
    expect(repository()).toHaveAccessibleDescription(
      'Matches clones of gitlab.com/reddevs/payments, over HTTPS or SSH. From a clone, pm link --project PAY sets it too.',
    );
  });

  it('says what saving a cleared field does and sends null', async () => {
    const { user, onSubmit, repository } = setup();
    await user.clear(repository());
    expect(repository()).toHaveAccessibleDescription(
      'Saving unlinks gitlab.com/reddevs/payments. In that clone, pm commands need --project PAY again.',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ repository: null });
  });

  it('links an unlinked project', async () => {
    const { user, onSubmit, repository } = setup(undefined, { ...PROJECT, repository: null });
    expect(repository()).toHaveAccessibleDescription(/Inside a clone of it, pm picks this project/);
    await user.type(repository(), 'git@github.com:reddevs/pay.git');
    expect(repository()).toHaveAccessibleDescription(/^Matches clones of github\.com\/reddevs\/pay,/);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ repository: 'git@github.com:reddevs/pay.git' });
  });

  it('flags a URL that is not a clone URL on blur and does not save it', async () => {
    const { user, onSubmit, repository } = setup();
    await user.clear(repository());
    await user.type(repository(), 'reddevs/billing');
    expect(screen.queryByText(REPOSITORY_URL_HINT)).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText(REPOSITORY_URL_HINT)).toBeInTheDocument();
    expect(repository()).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(repository()).toHaveFocus();
  });

  it('puts a repository conflict on the field', async () => {
    const message =
      'Web app (WEB) already uses github.com/reddevs/web-app. A repository can belong to one project.';
    const onSubmit = vi.fn().mockResolvedValue({ field: 'repository', message });
    const { user, repository } = setup(onSubmit);
    await user.clear(repository());
    await user.type(repository(), 'git@github.com:reddevs/web-app.git');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(repository()).toHaveAttribute('aria-invalid', 'true');
    expect(repository()).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
