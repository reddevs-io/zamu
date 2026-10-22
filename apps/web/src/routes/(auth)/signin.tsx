import { createFileRoute, useRouter } from '@tanstack/react-router';
import { AUTH_ERRORS, authClient } from '~/lib/auth-client';
import { getInstanceName, guardAuthPage } from '~/lib/session';
import { ApiKeyHint, AuthHeading, AuthLayout, PRODUCT_NAME } from './-auth/AuthLayout';
import { type SignInError, SignInForm } from './-auth/forms';
import { safeRedirect } from './-auth/validation';

export const Route = createFileRoute('/(auth)/signin')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = safeRedirect(search.redirect);
    return redirect ? { redirect } : {};
  },
  beforeLoad: ({ location }) => guardAuthPage('guest', location),
  loader: async () => ({ instanceName: await getInstanceName() }),
  head: ({ loaderData }) => ({
    meta: [{ title: `Sign in · ${loaderData?.instanceName ?? PRODUCT_NAME}` }],
  }),
  component: SignInPage,
});

function SignInPage() {
  const { instanceName } = Route.useLoaderData();
  const { redirect } = Route.useSearch();
  const router = useRouter();
  const name = instanceName ?? PRODUCT_NAME;

  const signIn = async (values: { email: string; password: string }): Promise<SignInError | null> => {
    const { error } = await authClient.signIn.email(values);
    if (error) {
      if (error.code === AUTH_ERRORS.invalidCredentials || error.status === 401)
        return { kind: 'credentials' };
      return { kind: 'other', message: error.message || "Couldn't sign in. Try again." };
    }
    await router.navigate({ href: redirect ?? '/' });
    return null;
  };

  return (
    <AuthLayout brand={name}>
      <AuthHeading title={`Sign in to ${name}`} subtitle="Sign in with your email and password." />
      {/* SignInForm shows "Continue with SSO" when given onSso. No OIDC provider exists in M1; M2 passes it
          once the generic OAuth provider is configured. */}
      <SignInForm onSubmit={signIn} />
      <ApiKeyHint />
    </AuthLayout>
  );
}
