import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InviteForm, SetupForm, SignInForm, WRONG_CREDENTIALS } from './forms';

describe('SignInForm', () => {
  it('shows field errors and does not submit when empty', async () => {
    const onSubmit = vi.fn();
    render(<SignInForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the banner and marks the password field on wrong credentials', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ kind: 'credentials' });
    render(<SignInForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Email'), ' ana@reddevs.io ');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password{Enter}');

    expect(onSubmit).toHaveBeenCalledWith({ email: 'ana@reddevs.io', password: 'wrong-password' });
    expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_CREDENTIALS);
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');

    // Editing clears the error state.
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid');
  });

  it('hides the SSO button unless an OIDC sign-in is provided', () => {
    const { rerender } = render(<SignInForm onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /SSO/ })).not.toBeInTheDocument();
    rerender(<SignInForm onSubmit={vi.fn()} onSso={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue with SSO' })).toBeInTheDocument();
  });
});

describe('SetupForm', () => {
  it('counts the password down, then moves to the workspace step and submits both', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<SetupForm onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Use 12 characters or more.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Your name'), 'Ana Ruiz');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@reddevs.io');
    await userEvent.type(screen.getByLabelText('Password'), 'abcdefgh');
    expect(screen.getByText('12 characters or more. 4 to go.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Password'), 'ijkl');
    expect(screen.getByText('12 characters or more.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Name your workspace' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(screen.getByText('Enter a workspace name.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Workspace name'), ' Reddevs {Enter}');
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ana Ruiz',
      email: 'ana@reddevs.io',
      password: 'abcdefghijkl',
      workspaceName: 'Reddevs',
    });
  });

  it('shows a server error with a sign-in link and keeps values on Back', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ message: 'This server is already set up.', signInLink: true });
    render(<SetupForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Your name'), 'Ana');
    await userEvent.type(screen.getByLabelText('Email'), 'ana@reddevs.io');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery{Enter}');
    await userEvent.type(screen.getByLabelText('Workspace name'), 'Reddevs{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This server is already set up.');
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/signin');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByLabelText('Your name')).toHaveValue('Ana'));
  });
});

describe('InviteForm', () => {
  it('shows the email read-only and validates name and password', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<InviteForm email="tomas@reddevs.io" onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Email')).toHaveValue('tomas@reddevs.io');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');

    await userEvent.click(screen.getByRole('button', { name: 'Join workspace' }));
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Use 12 characters or more.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Your name'), 'Tomás Berg');
    await userEvent.type(screen.getByLabelText('Password'), 'tomas-password-long{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Tomás Berg', password: 'tomas-password-long' });
  });
});
