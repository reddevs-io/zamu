import { describe, expect, it } from 'vitest';
import { ssoErrorCode, ssoErrorMessage, ssoLabel } from './sso';

describe('SSO copy', () => {
  it('labels the button with the provider name', () => {
    expect(ssoLabel('Authentik')).toBe('Continue with Authentik');
    // OIDC_PROVIDER_NAME left at its default.
    expect(ssoLabel('SSO')).toBe('Continue with single sign-on');
  });

  it('explains every refusal in plain words, without exclamation marks', () => {
    const codes = [
      'access_denied',
      'sso_email_not_verified',
      'account_not_linked',
      'sso_no_account',
      'signup_disabled',
      'sso_account_not_allowed',
      'sso_already_set_up',
      'sso_not_set_up',
      'sso_invitation_email_mismatch',
      'sso_invitation_not_usable',
      'something_else',
    ];
    for (const code of codes) {
      const { message } = ssoErrorMessage(code, 'Authentik');
      expect(message).toMatch(/^[A-Z]/);
      expect(message).not.toContain('!');
    }
    expect(ssoErrorMessage('access_denied', 'Authentik').message).toContain('cancelled at Authentik');
  });

  it('names the invited address on an email mismatch', () => {
    expect(
      ssoErrorMessage('sso_invitation_email_mismatch', 'Authentik', { invitationEmail: 'tomas@reddevs.io' })
        .message,
    ).toContain('This invitation is for tomas@reddevs.io');
  });

  it('only accepts short codes from the URL', () => {
    expect(ssoErrorCode('sso_no_account')).toBe('sso_no_account');
    expect(ssoErrorCode('<script>')).toBeUndefined();
    expect(ssoErrorCode(['a'])).toBeUndefined();
    expect(ssoErrorCode('x'.repeat(65))).toBeUndefined();
  });
});
