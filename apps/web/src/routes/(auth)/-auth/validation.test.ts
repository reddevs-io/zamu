import { MIN_PASSWORD_LENGTH as SERVER_MIN_PASSWORD_LENGTH } from '@pm/auth';
import { describe, expect, it } from 'vitest';
import {
  AccountFields,
  fieldErrors,
  InviteFields,
  MIN_PASSWORD_LENGTH,
  messages,
  passwordHint,
  SetupInput,
  SignInFields,
  safeRedirect,
  WorkspaceFields,
} from './validation';

describe('form validation', () => {
  it('uses the same minimum password length as the server', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(SERVER_MIN_PASSWORD_LENGTH);
  });

  it('sign-in needs an email and a password', () => {
    expect(fieldErrors(SignInFields, { email: '', password: '' })).toEqual({
      email: messages.email,
      password: messages.password,
    });
    expect(fieldErrors(SignInFields, { email: 'ana@', password: 'x' })).toEqual({ email: messages.email });
    // Any password length is accepted at sign-in; the server decides.
    expect(fieldErrors(SignInFields, { email: ' ana@reddevs.io ', password: 'x' })).toEqual({});
  });

  it('the admin account needs a name, a valid email and 12 characters of password', () => {
    expect(fieldErrors(AccountFields, { name: '  ', email: 'nope', password: 'short' })).toEqual({
      name: messages.name,
      email: messages.email,
      password: messages.newPassword,
    });
    expect(
      fieldErrors(AccountFields, { name: 'Ana', email: 'ana@reddevs.io', password: 'a'.repeat(12) }),
    ).toEqual({});
    expect(
      fieldErrors(AccountFields, { name: 'Ana', email: 'ana@reddevs.io', password: 'a'.repeat(129) }),
    ).toEqual({
      password: messages.passwordTooLong,
    });
  });

  it('the workspace needs a name', () => {
    expect(fieldErrors(WorkspaceFields, { workspaceName: ' ' })).toEqual({
      workspaceName: messages.workspaceName,
    });
    expect(fieldErrors(WorkspaceFields, { workspaceName: 'x'.repeat(65) })).toEqual({
      workspaceName: messages.workspaceNameTooLong,
    });
    expect(fieldErrors(WorkspaceFields, { workspaceName: 'Reddevs' })).toEqual({});
  });

  it('invitation accept needs a name and 12 characters of password', () => {
    expect(fieldErrors(InviteFields, { name: '', password: 'elevenchars' })).toEqual({
      name: messages.name,
      password: messages.newPassword,
    });
  });

  it('the setup server input trims names and email', () => {
    expect(
      SetupInput.parse({
        name: ' Ana Ruiz ',
        email: ' ana@reddevs.io ',
        password: 'correct-horse-battery',
        workspaceName: ' Reddevs ',
      }),
    ).toEqual({
      name: 'Ana Ruiz',
      email: 'ana@reddevs.io',
      password: 'correct-horse-battery',
      workspaceName: 'Reddevs',
    });
    expect(
      SetupInput.safeParse({ name: 'Ana', email: 'ana@reddevs.io', password: 'short', workspaceName: 'R' })
        .success,
    ).toBe(false);
  });
});

describe('passwordHint', () => {
  it('counts down to 12 characters', () => {
    expect(passwordHint(0)).toBe('12 characters or more.');
    expect(passwordHint(8)).toBe('12 characters or more. 4 to go.');
    expect(passwordHint(11)).toBe('12 characters or more. 1 to go.');
    expect(passwordHint(12)).toBe('12 characters or more.');
    expect(passwordHint(40)).toBe('12 characters or more.');
  });
});

describe('safeRedirect', () => {
  it('keeps same-origin paths', () => {
    expect(safeRedirect('/projects/PAY?status=todo')).toBe('/projects/PAY?status=todo');
  });

  it.each([
    undefined,
    42,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/signin',
    '/setup',
  ])('drops %s', (value) => {
    expect(safeRedirect(value)).toBeUndefined();
  });
});
