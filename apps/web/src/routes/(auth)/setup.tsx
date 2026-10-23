import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { authClient, signInWithSso } from '~/lib/auth-client';
import { completeSetup, getSetupScreen, guardAuthPage, setupInstance } from '~/lib/session';
import { AuthHeading, AuthLayout, PRODUCT_NAME, SetupSteps } from './-auth/AuthLayout';
import {
  ErrorBanner,
  type FormError,
  SetupForm,
  type SetupValues,
  type SsoAction,
  SsoButton,
  WorkspaceForm,
} from './-auth/forms';
import { ssoErrorCode, ssoErrorMessage, ssoLabel } from './-auth/sso';

export const Route = createFileRoute('/(auth)/setup')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => {
    const error = ssoErrorCode(search.error);
    return error ? { error } : {};
  },
  beforeLoad: ({ location }) => guardAuthPage('setup', location),
  loader: () => getSetupScreen(),
  head: () => ({ meta: [{ title: `Set up · ${PRODUCT_NAME}` }] }),
  component: SetupPage,
});

const ALREADY_SET_UP: FormError = { message: 'This server is already set up.', signInLink: true };

function SetupPage() {
  const { state, signedIn, options } = Route.useLoaderData();
  const { error } = Route.useSearch();
  const router = useRouter();
  const providerName = options.sso?.providerName ?? null;
  const initialError = error && providerName ? ssoErrorMessage(error, providerName) : null;
  const sso = providerName
    ? {
        label: ssoLabel(providerName),
        onPress: () => signInWithSso({ intent: 'setup', callbackURL: '/setup', errorCallbackURL: '/setup' }),
      }
    : undefined;

  const setUp = async (values: SetupValues): Promise<FormError | null> => {
    const result = await setupInstance({ data: values });
    if (!result.ok) return result.code === 'ALREADY_SET_UP' ? ALREADY_SET_UP : { message: result.message };
    const { error } = await authClient.signIn.email({ email: values.email, password: values.password });
    if (error) {
      return { message: 'Your account is ready, but signing in failed.', signInLink: true };
    }
    await router.navigate({ to: '/' });
    return null;
  };

  const nameWorkspace = async (workspaceName: string): Promise<FormError | null> => {
    const result = await completeSetup({ data: { workspaceName } });
    if (!result.ok) return result.code === 'ALREADY_SET_UP' ? ALREADY_SET_UP : { message: result.message };
    await router.navigate({ to: '/' });
    return null;
  };

  return (
    <AuthLayout brand={PRODUCT_NAME}>
      {state === 'workspace' && signedIn ? (
        <WorkspaceForm onSubmit={nameWorkspace} />
      ) : state === 'workspace' ? (
        <ResumeSetup providerName={providerName} sso={sso} initialError={initialError} />
      ) : (
        <SetupForm
          onSubmit={setUp}
          sso={sso}
          passwordLogin={options.passwordLogin}
          initialError={initialError}
        />
      )}
    </AuthLayout>
  );
}

/** Setup was started through SSO and the admin's session ended before step 2: sign in again to finish. */
function ResumeSetup({
  providerName,
  sso,
  initialError,
}: {
  providerName: string | null;
  sso: SsoAction | undefined;
  initialError: FormError | null;
}) {
  const [failure, setFailure] = useState<FormError | null>(initialError);
  return (
    <>
      <SetupSteps step={2} />
      <AuthHeading
        title="Finish setting up this server"
        subtitle={`The admin account is ready. Continue with ${providerName ?? 'single sign-on'} as the admin to name the workspace.`}
      />
      {failure ? <ErrorBanner error={failure} /> : null}
      {sso ? (
        <div className="flex flex-col gap-3.5">
          <SsoButton sso={sso} onError={(message) => setFailure({ message })} />
        </div>
      ) : null}
    </>
  );
}
