import { createFileRoute, useRouter } from '@tanstack/react-router';
import { authClient, signInWithSso } from '~/lib/auth-client';
import { getInstanceName, getSignInOptions, guardAuthPage } from '~/lib/session';
import { ApiKeyHint, AuthHeading, AuthLayout, PRODUCT_NAME } from './-auth/AuthLayout';
import { type SignInError, SignInForm, signInError } from './-auth/forms';
import { ssoErrorCode, ssoErrorMessage, ssoLabel, ssoName } from './-auth/sso';
import { safeRedirect } from './-auth/validation';

export const Route = createFileRoute('/(auth)/signin')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => {
    const redirect = safeRedirect(search.redirect);
    const error = ssoErrorCode(search.error);
    return { ...(redirect ? { redirect } : {}), ...(error ? { error } : {}) };
  },
  beforeLoad: ({ location }) => guardAuthPage('guest', location),
  loader: async () => {
    const [instanceName, options] = await Promise.all([getInstanceName(), getSignInOptions()]);
    return { instanceName, options };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `Sign in · ${loaderData?.instanceName ?? PRODUCT_NAME}` }],
  }),
  component: SignInPage,
});

function subtitle(providerName: string | null, passwordLogin: boolean): string {
  if (providerName && !passwordLogin) return `Continue with ${ssoName(providerName)} to sign in.`;
  return 'Use the email your workspace invite went to.';
}

function SignInPage() {
  const { instanceName, options } = Route.useLoaderData();
  const { redirect, error } = Route.useSearch();
  const router = useRouter();
  const name = instanceName ?? PRODUCT_NAME;
  const providerName = options.sso?.providerName ?? null;

  const signIn = async (values: { email: string; password: string }): Promise<SignInError | null> => {
    const { error } = await authClient.signIn.email(values);
    if (error) return signInError(error);
    await router.navigate({ href: redirect ?? '/' });
    return null;
  };

  return (
    <AuthLayout brand={name}>
      <AuthHeading title="Sign in" subtitle={subtitle(providerName, options.passwordLogin)} />
      <SignInForm
        onSubmit={signIn}
        passwordLogin={options.passwordLogin}
        initialError={error && providerName ? ssoErrorMessage(error, providerName).message : undefined}
        sso={
          providerName
            ? {
                label: ssoLabel(providerName),
                onPress: () =>
                  signInWithSso({
                    intent: 'signin',
                    callbackURL: redirect ?? '/',
                    errorCallbackURL: '/signin',
                  }),
              }
            : undefined
        }
      />
      <ApiKeyHint />
    </AuthLayout>
  );
}
