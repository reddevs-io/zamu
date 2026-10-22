import { createFileRoute, useRouter } from '@tanstack/react-router';
import { authClient } from '~/lib/auth-client';
import { guardAuthPage, setupInstance } from '~/lib/session';
import { AuthLayout, PRODUCT_NAME } from './-auth/AuthLayout';
import { type FormError, SetupForm, type SetupValues } from './-auth/forms';

export const Route = createFileRoute('/(auth)/setup')({
  beforeLoad: ({ location }) => guardAuthPage('setup', location),
  head: () => ({ meta: [{ title: `Set up · ${PRODUCT_NAME}` }] }),
  component: SetupPage,
});

function SetupPage() {
  const router = useRouter();

  const setUp = async (values: SetupValues): Promise<FormError | null> => {
    const result = await setupInstance({ data: values });
    if (!result.ok) {
      return result.code === 'ALREADY_SET_UP'
        ? { message: 'This server is already set up.', signInLink: true }
        : { message: result.message };
    }
    const { error } = await authClient.signIn.email({ email: values.email, password: values.password });
    if (error) {
      return { message: 'Your account is ready, but signing in failed.', signInLink: true };
    }
    await router.navigate({ to: '/' });
    return null;
  };

  return (
    <AuthLayout brand={PRODUCT_NAME}>
      <SetupForm onSubmit={setUp} />
    </AuthLayout>
  );
}
