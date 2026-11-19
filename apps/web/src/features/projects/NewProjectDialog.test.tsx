import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REPOSITORY_URL_HINT } from '@zamu/contracts';
import { describe, expect, it, vi } from 'vitest';
import { NewProjectDialog, type NewProjectDialogProps } from './NewProjectDialog';

function setup(onSubmit: NewProjectDialogProps['onSubmit'] = vi.fn().mockResolvedValue(null)) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<NewProjectDialog isOpen onClose={onClose} onSubmit={onSubmit} />);
  return {
    user,
    onClose,
    onSubmit,
    name: () => screen.getByLabelText('Name'),
    key: () => screen.getByLabelText('Key') as HTMLInputElement,
    description: () => screen.getByLabelText(/Description/),
    repository: () => screen.getByLabelText(/Repository/),
  };
}

describe('NewProjectDialog', () => {
  it('opens on the name field, labelled by its title', () => {
    const { name } = setup();
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument();
    expect(name()).toHaveFocus();
  });

  it('suggests the key from the name until the key is edited', async () => {
    const { user, name, key } = setup();
    await user.type(name(), 'Billing reconciliation');
    expect(key().value).toBe('BIL');
    expect(screen.getByText(/Suggested from the name\. Task IDs will look like BIL-1\./)).toBeInTheDocument();

    await user.clear(key());
    await user.type(key(), 'rec');
    expect(key().value).toBe('REC');
    expect(screen.queryByText(/Suggested from the name/)).not.toBeInTheDocument();
    expect(screen.getByText(/Task IDs will look like REC-1\./)).toBeInTheDocument();

    // A custom key survives name edits.
    await user.type(name(), ' 2027');
    expect(key().value).toBe('REC');

    // Clearing the key hands it back to the suggestion.
    await user.clear(key());
    await user.type(name(), 's');
    expect(key().value).toBe('BIL');
  });

  it('shows field errors from the contract schema and does not submit', async () => {
    const { user, onSubmit, name, key } = setup();
    await user.click(screen.getByRole('button', { name: /Create project/ }));
    expect(screen.getByText('Enter a project name.')).toBeInTheDocument();
    expect(screen.getByText('Use 2 to 6 letters or digits, starting with a letter.')).toBeInTheDocument();
    expect(name()).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(name(), '42 things');
    expect(screen.queryByText('Enter a project name.')).not.toBeInTheDocument();
    await user.clear(key());
    await user.type(key(), '4X');
    await user.click(screen.getByRole('button', { name: /Create project/ }));
    expect(key()).toHaveAttribute('aria-invalid', 'true');
    expect(key()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid input with Mod+Enter from any field', async () => {
    const { user, onSubmit, name, description } = setup();
    await user.type(name(), '  Billing reconciliation ');
    await user.type(description(), 'Match Stripe payouts to invoices');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Billing reconciliation',
        key: 'BIL',
        description: 'Match Stripe payouts to invoices',
      }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits with Enter and leaves out an empty description', async () => {
    const { user, onSubmit, name } = setup();
    await user.type(name(), 'Payments{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Payments', key: 'PAY' }));
  });

  it('puts a taken key on the key field and a general error in the banner', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce({ field: 'key', message: 'PAY is already used by another project.' })
      .mockResolvedValueOnce({ message: "Couldn't create the project." });
    const { user, name, key } = setup(onSubmit);
    await user.type(name(), 'Payments{Enter}');
    expect(await screen.findByText('PAY is already used by another project.')).toBeInTheDocument();
    expect(key()).toHaveAttribute('aria-invalid', 'true');
    expect(key()).toHaveFocus();

    await user.clear(key());
    await user.type(key(), 'PAY2{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't create the project.");
    expect(onSubmit).toHaveBeenLastCalledWith({ name: 'Payments', key: 'PAY2' });
  });

  it('shows an optional repository field that reads the URL back as it is typed', async () => {
    const { user, repository } = setup();
    expect(repository()).toHaveAttribute('placeholder', 'https://gitlab.com/team/repo.git');
    expect(repository()).toHaveAccessibleDescription(
      'The URL you clone from, HTTPS or SSH. Inside a clone of it, zamu picks this project without --project.',
    );
    await user.type(repository(), 'git@gitlab.com:reddevs/billing.git');
    expect(repository()).toHaveAccessibleDescription(
      'Matches clones of gitlab.com/reddevs/billing, over HTTPS or SSH.',
    );
  });

  it('sends the repository when one is given', async () => {
    const { user, onSubmit, name, repository } = setup();
    await user.type(name(), 'Billing reconciliation');
    await user.type(repository(), ' git@gitlab.com:reddevs/billing.git {Enter}');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Billing reconciliation',
        key: 'BIL',
        repository: 'git@gitlab.com:reddevs/billing.git',
      }),
    );
  });

  it('flags a value that is not a clone URL when the field is left, and on submit', async () => {
    const { user, onSubmit, name, repository } = setup();
    await user.type(name(), 'Billing');
    await user.type(repository(), 'reddevs/billing');
    expect(screen.queryByText(REPOSITORY_URL_HINT)).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText(REPOSITORY_URL_HINT)).toBeInTheDocument();
    expect(repository()).toHaveAttribute('aria-invalid', 'true');

    // Typing clears the error until the next check.
    await user.type(repository(), 'x');
    expect(screen.queryByText(REPOSITORY_URL_HINT)).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByText(REPOSITORY_URL_HINT)).toBeInTheDocument();
    expect(repository()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('puts a taken repository on the repository field', async () => {
    const message =
      'Payments (PAY) already uses gitlab.com/reddevs/payments. A repository can belong to one project.';
    const onSubmit = vi.fn().mockResolvedValue({ field: 'repository', message });
    const { user, name, key, repository } = setup(onSubmit);
    await user.type(name(), 'Billing');
    await user.type(repository(), 'https://gitlab.com/reddevs/payments.git{Enter}');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(repository()).toHaveAttribute('aria-invalid', 'true');
    expect(repository()).toHaveFocus();
    expect(key()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes with Cancel and Esc', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
