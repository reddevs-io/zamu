import { createFileRoute, useRouter } from '@tanstack/react-router';
import { acceptInvitation, getInvitation, guardAuthPage } from '~/lib/session';
import { ApiKeyHint, AuthHeading, AuthLayout, PRODUCT_NAME } from './-auth/AuthLayout';
import { ErrorBanner, type FormError, InviteForm } from './-auth/forms';
import type { InvitationState } from './-auth/queries';

export const Route = createFileRoute('/(auth)/invite/$id')({
  beforeLoad: ({ location }) => guardAuthPage('guest', location),
  loader: ({ params }) => getInvitation({ data: { id: params.id } }),
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

function InvitePage() {
  const invitation = Route.useLoaderData();
  const { id } = Route.useParams();
  const router = useRouter();
  const workspace = invitation.workspaceName;

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
            ? `${invitation.inviterName ?? 'Your admin'} invited you. Choose your name and a password.`
            : 'This invitation link cannot be used.'
        }
      />
      {invitation.state === 'pending' && invitation.email ? (
        <InviteForm email={invitation.email} onSubmit={accept} />
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
