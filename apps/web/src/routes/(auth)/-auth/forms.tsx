import { useState } from 'react';
import { Link } from 'react-aria-components';
import { Banner, Button, TextField } from '~/ui';
import { AuthForm, AuthHeading, SetupSteps } from './AuthLayout';
import {
  AccountFields,
  type FieldErrors,
  fieldErrors,
  hasErrors,
  InviteFields,
  passwordHint,
  SignInFields,
  WorkspaceFields,
} from './validation';

// Forms of the signed-out screens. They validate locally and hand valid values to `onSubmit`, which
// talks to the server and resolves to an error to show, or null. Routes wire them to Better Auth.

/** An error shown in the banner above a form. */
export interface FormError {
  message: string;
  /** Adds a "Go to sign in" link (already set up, account exists, unusable invitation). */
  signInLink?: boolean;
}

export const WRONG_CREDENTIALS = 'Wrong email or password. Check both and try again.';

const linkClass = 'font-semibold text-fg underline underline-offset-2 outline-none focus-visible:focus-ring';

export function ErrorBanner({ error }: { error: FormError }) {
  return (
    <Banner>
      {error.message}
      {error.signInLink ? (
        <>
          {' '}
          <Link href="/signin" className={linkClass}>
            Go to sign in
          </Link>
        </>
      ) : null}
    </Banner>
  );
}

function useSubmit<E>() {
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<E | null>): Promise<E | null> => {
    setPending(true);
    try {
      return await action();
    } finally {
      setPending(false);
    }
  };
  return { pending, run };
}

/** Single sign-on for a form: the button label and the action that sends the browser to the provider. */
export interface SsoAction {
  /** "Continue with Authentik". */
  label: string;
  /** Starts the redirect; resolves with an error message when it could not start. */
  onPress: () => Promise<string | null>;
}

/** "Continue with {provider}" (design frame 01), pending while the browser leaves for the provider. */
export function SsoButton({ sso, onError }: { sso: SsoAction; onError: (message: string) => void }) {
  const [pending, setPending] = useState(false);
  const press = async () => {
    setPending(true);
    const error = await sso.onPress();
    // On success the page unloads; keep the button pending until then.
    if (error) {
      setPending(false);
      onError(error);
    }
  };
  return (
    <Button variant="secondary" size="lg" fullWidth isPending={pending} onPress={press}>
      <span aria-hidden className="size-3.5 border-[1.5px] border-fg" />
      {sso.label}
    </Button>
  );
}

/** The "or with email" divider between the SSO button and the password form. */
export function OrWithEmail() {
  return (
    <div className="flex items-center gap-3 text-[11.5px] text-faint">
      <span aria-hidden className="h-px flex-1 bg-line" />
      or with email
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Sign-in error: wrong credentials (banner and password field in error) or anything else. */
export type SignInError = { kind: 'credentials' } | { kind: 'other'; message: string };

export interface SignInFormProps {
  onSubmit: (values: { email: string; password: string }) => Promise<SignInError | null>;
  /** Rendered only when an OIDC provider is configured. */
  sso?: SsoAction;
  /** False when PASSWORD_LOGIN=disabled: the SSO button is the only control. */
  passwordLogin?: boolean;
  /** Shown in the banner on first render, such as an error the SSO redirect came back with. */
  initialError?: string;
}

export function SignInForm({ onSubmit, sso, passwordLogin = true, initialError }: SignInFormProps) {
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<SignInFields>>({});
  const [failure, setFailure] = useState<SignInError | null>(
    initialError ? { kind: 'other', message: initialError } : null,
  );
  const ssoFailed = (message: string) => setFailure({ kind: 'other', message });
  const { pending, run } = useSubmit<SignInError>();

  const update = (field: keyof typeof values) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (failure?.kind === 'credentials') setFailure(null);
  };

  const submit = async () => {
    const found = fieldErrors(SignInFields, values);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(() => onSubmit({ email: values.email.trim(), password: values.password }));
    // The banner is an alert, so screen readers announce it; focus stays put so the password field
    // shows its error border rather than the focus halo.
    setFailure(result);
  };

  const wrongCredentials = failure?.kind === 'credentials';
  const banner = failure ? (
    <ErrorBanner error={{ message: failure.kind === 'credentials' ? WRONG_CREDENTIALS : failure.message }} />
  ) : null;

  if (sso && !passwordLogin) {
    return (
      <>
        {banner}
        <div className="flex flex-col gap-3.5">
          <SsoButton sso={sso} onError={ssoFailed} />
        </div>
      </>
    );
  }

  return (
    <>
      {banner}
      <AuthForm label="Sign in" onSubmit={submit}>
        {sso ? (
          <>
            <SsoButton sso={sso} onError={ssoFailed} />
            <OrWithEmail />
          </>
        ) : null}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          value={values.email}
          onChange={update('email')}
          isInvalid={Boolean(errors.email)}
          errorMessage={errors.email}
          validationBehavior="aria"
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={update('password')}
          isInvalid={Boolean(errors.password) || wrongCredentials}
          errorMessage={errors.password}
          validationBehavior="aria"
        />
        <Button type="submit" variant="accent" size="lg" fullWidth isPending={pending}>
          Sign in
        </Button>
      </AuthForm>
    </>
  );
}

export interface SetupValues {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

export interface SetupFormProps {
  onSubmit: (values: SetupValues) => Promise<FormError | null>;
  /** Step 1 offers "Continue with {provider}" when SSO is configured. */
  sso?: SsoAction;
  /** False when PASSWORD_LOGIN=disabled: step 1 is the SSO button only. */
  passwordLogin?: boolean;
  /** Shown in the banner on first render, such as an error the SSO redirect came back with. */
  initialError?: FormError | null;
}

/** First-run form: the admin account (password or SSO), then the workspace name. */
export function SetupForm({ onSubmit, sso, passwordLogin = true, initialError = null }: SetupFormProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<SetupValues>({ name: '', email: '', password: '', workspaceName: '' });
  const [errors, setErrors] = useState<FieldErrors<SetupValues>>({});
  const [failure, setFailure] = useState<FormError | null>(initialError);
  const ssoFailed = (message: string) => setFailure({ message });
  const { pending, run } = useSubmit<FormError>();

  const update = (field: keyof SetupValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const next = () => {
    const found = fieldErrors(AccountFields, values);
    setErrors(found);
    if (!hasErrors(found)) setStep(2);
  };

  const submit = async () => {
    const found = fieldErrors(WorkspaceFields, values);
    setErrors(found);
    if (hasErrors(found)) return;
    setFailure(
      await run(() =>
        onSubmit({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          workspaceName: values.workspaceName.trim(),
        }),
      ),
    );
  };

  return (
    <>
      <SetupSteps step={step} />
      {step === 1 ? (
        <AuthHeading
          title="Set up this server"
          subtitle="You're the first person here, so this account becomes the admin."
        />
      ) : (
        <AuthHeading
          title="Name your workspace"
          subtitle="A workspace holds your projects, people and agents. You can add more later."
        />
      )}
      {failure ? <ErrorBanner error={failure} /> : null}
      {step === 1 && sso && !passwordLogin ? (
        <div className="flex flex-col gap-3.5">
          <SsoButton sso={sso} onError={ssoFailed} />
        </div>
      ) : step === 1 ? (
        <AuthForm label="Admin account" onSubmit={next}>
          {sso ? (
            <>
              <SsoButton sso={sso} onError={ssoFailed} />
              <OrWithEmail />
            </>
          ) : null}
          <TextField
            label="Your name"
            name="name"
            autoComplete="name"
            autoFocus={!sso}
            value={values.name}
            onChange={update('name')}
            isInvalid={Boolean(errors.name)}
            errorMessage={errors.name}
            validationBehavior="aria"
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={update('email')}
            isInvalid={Boolean(errors.email)}
            errorMessage={errors.email}
            validationBehavior="aria"
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={update('password')}
            description={passwordHint(values.password.length)}
            isInvalid={Boolean(errors.password)}
            errorMessage={errors.password}
            validationBehavior="aria"
          />
          <Button type="submit" variant="accent" size="lg" fullWidth>
            Continue
          </Button>
        </AuthForm>
      ) : (
        <AuthForm label="Workspace" onSubmit={submit}>
          <TextField
            label="Workspace name"
            name="workspaceName"
            autoComplete="organization"
            autoFocus
            value={values.workspaceName}
            onChange={update('workspaceName')}
            description="Usually your team or company name."
            isInvalid={Boolean(errors.workspaceName)}
            errorMessage={errors.workspaceName}
            validationBehavior="aria"
          />
          <div className="flex gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              isDisabled={pending}
              onPress={() => {
                setFailure(null);
                setStep(1);
              }}
            >
              Back
            </Button>
            <Button type="submit" variant="accent" size="lg" className="flex-1" isPending={pending}>
              Create workspace
            </Button>
          </div>
        </AuthForm>
      )}
    </>
  );
}

export interface WorkspaceFormProps {
  onSubmit: (workspaceName: string) => Promise<FormError | null>;
}

/** Setup step 2 after the admin signed in through SSO: only the workspace name. */
export function WorkspaceForm({ onSubmit }: WorkspaceFormProps) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<FormError | null>(null);
  const { pending, run } = useSubmit<FormError>();

  const submit = async () => {
    const found = fieldErrors(WorkspaceFields, { workspaceName });
    setError(found.workspaceName);
    if (hasErrors(found)) return;
    setFailure(await run(() => onSubmit(workspaceName.trim())));
  };

  return (
    <>
      <SetupSteps step={2} />
      <AuthHeading
        title="Name your workspace"
        subtitle="A workspace holds your projects, people and agents. You can add more later."
      />
      {failure ? <ErrorBanner error={failure} /> : null}
      <AuthForm label="Workspace" onSubmit={submit}>
        <TextField
          label="Workspace name"
          name="workspaceName"
          autoComplete="organization"
          autoFocus
          value={workspaceName}
          onChange={(value) => {
            setWorkspaceName(value);
            setError(undefined);
          }}
          description="Usually your team or company name."
          isInvalid={Boolean(error)}
          errorMessage={error}
          validationBehavior="aria"
        />
        <Button type="submit" variant="accent" size="lg" fullWidth isPending={pending}>
          Create workspace
        </Button>
      </AuthForm>
    </>
  );
}

export interface InviteFormProps {
  email: string;
  onSubmit: (values: { name: string; password: string }) => Promise<FormError | null>;
  /** "Continue with {provider}" when SSO is configured; the provider's email must match `email`. */
  sso?: SsoAction;
  /** False when PASSWORD_LOGIN=disabled: the SSO button is the only way to join. */
  passwordLogin?: boolean;
  /** Shown in the banner on first render, such as an error the SSO redirect came back with. */
  initialError?: FormError | null;
}

/** Invitation accept: the invited email (read-only), then SSO or a name and a password. */
export function InviteForm({
  email,
  onSubmit,
  sso,
  passwordLogin = true,
  initialError = null,
}: InviteFormProps) {
  const [values, setValues] = useState({ name: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<InviteFields>>({});
  const [failure, setFailure] = useState<FormError | null>(initialError);
  const ssoFailed = (message: string) => setFailure({ message });
  const { pending, run } = useSubmit<FormError>();

  const update = (field: keyof typeof values) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async () => {
    const found = fieldErrors(InviteFields, values);
    setErrors(found);
    if (hasErrors(found)) return;
    setFailure(await run(() => onSubmit({ name: values.name.trim(), password: values.password })));
  };

  const emailField = (
    <TextField
      label="Email"
      name="email"
      type="email"
      autoComplete="username"
      value={email}
      isReadOnly
      inputClassName="bg-band text-muted"
    />
  );

  if (sso && !passwordLogin) {
    return (
      <>
        {failure ? <ErrorBanner error={failure} /> : null}
        <div className="flex flex-col gap-3.5">
          {emailField}
          <SsoButton sso={sso} onError={ssoFailed} />
        </div>
      </>
    );
  }

  return (
    <>
      {failure ? <ErrorBanner error={failure} /> : null}
      <AuthForm label="Join workspace" onSubmit={submit}>
        {sso ? (
          <>
            <SsoButton sso={sso} onError={ssoFailed} />
            <OrWithEmail />
          </>
        ) : null}
        {emailField}
        <TextField
          label="Your name"
          name="name"
          autoComplete="name"
          autoFocus={!sso}
          value={values.name}
          onChange={update('name')}
          isInvalid={Boolean(errors.name)}
          errorMessage={errors.name}
          validationBehavior="aria"
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          description={passwordHint(values.password.length)}
          isInvalid={Boolean(errors.password)}
          errorMessage={errors.password}
          validationBehavior="aria"
        />
        <Button type="submit" variant="accent" size="lg" fullWidth isPending={pending}>
          Join workspace
        </Button>
      </AuthForm>
    </>
  );
}
