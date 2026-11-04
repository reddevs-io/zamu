import { createFileRoute, useRouter } from '@tanstack/react-router';
import { signInWithSso } from '~/lib/auth-client';
import { acceptInvitation, getInvitation, getSignInOptions, guardAuthPage } from '~/lib/session';
import { ApiKeyHint, AuthHeading, AuthLayout, PRODUCT_NAME } from './-auth/AuthLayout';
import { ErrorBanner, type FormError, InviteForm } from './-auth/forms';
import type { InvitationState } from './-auth/queries';
import { ssoErrorCode, ssoErrorMessage, ssoLabel, ssoName } from './-auth/sso';

export const Route = createFileRoute('/(auth)/invite/$id')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => {
    const error = ssoErrorCode(search.error);
    return error ? { error } : {};
  },
  beforeLoad: ({ location }) => guardAuthPage('guest', location),
  loader: async ({ params }) => {
    const [invitation, options] = await Promise.all([
      getInvitation({ data: { id: params.id } }),
      getSignInOptions(),
    ]);
    return { ...invitation, options };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `Join ${loaderData?.workspaceName ?? 'workspace'} · ${PRODUCT_NAME}` }],
  }),
  component: InvitePage,
});

/** Banner copy for invitations that can no longer be accepted. */
const UNUSABLE: Record<Exclude<InvitationState, 'pending'>, string> = {
  expired: 'This invitation has expired. Ask your admin for a new link.',
  used: 'This invitation has already been used.',
  canceled: 'This invitation was withdrawn. Ask your admin for a new link.',
  'not-found': "This invitation link doesn't work. Check the link or ask your admin for a new one.",
};

function pendingSubtitle(inviter: string, providerName: string | null, passwordLogin: boolean): string {
  if (!providerName) return `${inviter} invited you. Choose your name and a password.`;
  const sso = ssoName(providerName);
  if (!passwordLogin) return `${inviter} invited you. Continue with ${sso} to join.`;
  return `${inviter} invited you. Choose your name and a password, or continue with ${sso}.`;
}

function InvitePage() {
  const { options, ...invitation } = Route.useLoaderData();
  const { id } = Route.useParams();
  const { error } = Route.useSearch();
  const router = useRouter();
  const workspace = invitation.workspaceName;
  const providerName = options.sso?.providerName ?? null;

  const accept = async (values: { name: string; password: string }): Promise<FormError | null> => {
    // The server creates the account for the invitation's email, sets the session cookie and joins
    // the workspace; the browser only proves it holds the invitation id.
    const result = await acceptInvitation({ data: { invitationId: id, ...values } });
    if (!result.ok) {
      switch (result.code) {
        case 'ACCOUNT_EXISTS':
          return { message: 'An account with this email already exists.', signInLink: true };
        case 'INVITATION_NOT_USABLE':
          return {
            message: "This invitation can't be used any more. Ask your admin for a new link.",
            signInLink: true,
          };
        case 'PASSWORD_LOGIN_DISABLED':
          return {
            message: `Password sign-in is turned off. ${providerName ? ssoLabel(providerName) : 'Use single sign-on'} instead.`,
          };
        default:
          return { message: result.message };
      }
    }
    await router.navigate({ to: '/' });
    return null;
  };

  return (
    <AuthLayout brand={workspace ?? PRODUCT_NAME}>
      <AuthHeading
        title={workspace ? `Join ${workspace}` : 'Join a workspace'}
        subtitle={
          invitation.state === 'pending'
            ? pendingSubtitle(invitation.inviterName ?? 'Your admin', providerName, options.passwordLogin)
            : 'This invitation link cannot be used.'
        }
      />
      {invitation.state === 'pending' && invitation.email ? (
        <InviteForm
          email={invitation.email}
          onSubmit={accept}
          passwordLogin={options.passwordLogin}
          initialError={
            error && providerName
              ? ssoErrorMessage(error, providerName, { invitationEmail: invitation.email })
              : null
          }
          sso={
            providerName
              ? {
                  label: ssoLabel(providerName),
                  onPress: () =>
                    signInWithSso({
                      intent: 'invite',
                      invitationId: id,
                      callbackURL: '/',
                      errorCallbackURL: `/invite/${id}`,
                    }),
                }
              : undefined
          }
        />
      ) : (
        <ErrorBanner
          error={{
            message: UNUSABLE[invitation.state === 'pending' ? 'not-found' : invitation.state],
            signInLink: true,
          }}
        />
      )}
      <ApiKeyHint />
    </AuthLayout>
  );
}
