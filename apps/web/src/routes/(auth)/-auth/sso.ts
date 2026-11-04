// Single sign-on on the signed-out screens: what the server allows, and the copy for errors the provider
// redirect brings back (?error=<code>). Client-safe: no server imports here.

/** Sign-in methods the server allows (lib/session.ts getSignInOptions). */
export interface SignInOptions {
  /** Null when SSO is not configured. */
  sso: { providerName: string } | null;
  /** False when PASSWORD_LOGIN=disabled. */
  passwordLogin: boolean;
}

/** OIDC_PROVIDER_NAME's default (packages/auth DEFAULT_OIDC_PROVIDER_NAME): no real name was set. */
const UNNAMED_PROVIDER = 'SSO';

/** The provider's name for the button, or "single sign-on" when the server didn't name it. */
export function ssoName(providerName: string): string {
  return providerName === UNNAMED_PROVIDER ? 'single sign-on' : providerName;
}

/** "Continue with Authentik", or "Continue with single sign-on" (frame 128). */
export function ssoLabel(providerName: string): string {
  return `Continue with ${ssoName(providerName)}`;
}

/** Banner copy for the `error` an SSO sign-in came back with. */
export function ssoErrorMessage(
  code: string,
  providerName: string,
  context: { invitationEmail?: string | null } = {},
): { message: string; signInLink?: boolean } {
  switch (code) {
    case 'access_denied':
      return { message: `Sign-in was cancelled at ${providerName}. Try again when you're ready.` };
    case 'sso_email_not_verified':
    case 'account_not_linked':
      return {
        message: `${providerName} hasn't verified your email address. Verify it there, then try again.`,
      };
    case 'sso_no_account':
    case 'signup_disabled':
      return { message: "There's no account for you here yet. Ask your admin for an invitation." };
    case 'sso_account_not_allowed':
      return { message: `This account can't sign in with ${providerName}.` };
    case 'sso_already_set_up':
      return { message: 'This server is already set up.', signInLink: true };
    case 'sso_not_set_up':
      return { message: "This server isn't set up yet. Ask your admin to finish setup first." };
    case 'sso_invitation_email_mismatch':
      return {
        message: context.invitationEmail
          ? `This invitation is for ${context.invitationEmail}. Your ${providerName} account uses another address, so nothing was created.`
          : `Your ${providerName} account uses another address than the invitation, so nothing was created.`,
      };
    case 'sso_invitation_not_usable':
      return {
        message: "This invitation can't be used any more. Ask your admin for a new link.",
        signInLink: true,
      };
    default:
      return {
        message: `Signing in with ${providerName} didn't work. Try again, or ask your admin to check the single sign-on settings.`,
      };
  }
}

/** Keeps `?error=` to a short code, so the page never echoes arbitrary text from the URL. */
export function ssoErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9_]{1,64}$/i.test(value) ? value : undefined;
}
