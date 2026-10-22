import { describe, expect, it } from 'vitest';
import { type AuthPage, authRedirect } from './guards';

const firstRun = { firstRun: true, signedIn: false };
const signedOut = { firstRun: false, signedIn: false };
const signedIn = { firstRun: false, signedIn: true };

describe('authRedirect', () => {
  describe('first run (no user yet)', () => {
    it.each<AuthPage>(['guest', 'app', 'any'])('sends %s pages to /setup', (page) => {
      expect(authRedirect(page, firstRun, '/projects')).toEqual({ to: '/setup' });
    });

    it('lets the setup form through', () => {
      expect(authRedirect('setup', firstRun)).toBeNull();
    });
  });

  describe('signed out', () => {
    it('sends signed-in pages to /signin and remembers where the visitor was going', () => {
      expect(authRedirect('app', signedOut, '/projects/PAY?status=todo')).toEqual({
        to: '/signin',
        redirect: '/projects/PAY?status=todo',
      });
    });

    it('does not add ?redirect= for the home page', () => {
      expect(authRedirect('app', signedOut, '/')).toEqual({ to: '/signin' });
    });

    it('closes the setup form once an admin exists', () => {
      expect(authRedirect('setup', signedOut)).toEqual({ to: '/signin' });
    });

    it('shows sign-in and invitation pages', () => {
      expect(authRedirect('guest', signedOut)).toBeNull();
      expect(authRedirect('any', signedOut)).toBeNull();
    });
  });

  describe('signed in', () => {
    it('shows signed-in pages', () => {
      expect(authRedirect('app', signedIn, '/projects')).toBeNull();
      expect(authRedirect('any', signedIn)).toBeNull();
    });

    it.each<AuthPage>(['guest', 'setup'])('sends %s pages home', (page) => {
      expect(authRedirect(page, signedIn)).toEqual({ to: '/' });
    });
  });
});
