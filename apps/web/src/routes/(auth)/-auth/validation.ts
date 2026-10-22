import { z } from 'zod';

// Form rules shared by the sign-in, setup and invitation screens and by the setup server function.
// Client-safe: no server imports here.

/** Same value as MIN_PASSWORD_LENGTH in @pm/auth (a test keeps them equal). */
export const MIN_PASSWORD_LENGTH = 12;
/** Better Auth's default maximum password length. */
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_NAME_LENGTH = 100;
export const MAX_WORKSPACE_NAME_LENGTH = 64;

export const messages = {
  name: 'Enter your name.',
  nameTooLong: `Use ${MAX_NAME_LENGTH} characters or fewer.`,
  email: 'Enter a valid email address.',
  password: 'Enter your password.',
  newPassword: `Use ${MIN_PASSWORD_LENGTH} characters or more.`,
  passwordTooLong: `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`,
  workspaceName: 'Enter a workspace name.',
  workspaceNameTooLong: `Use ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer.`,
} as const;

const name = z.string().trim().min(1, messages.name).max(MAX_NAME_LENGTH, messages.nameTooLong);
const email = z.string().trim().pipe(z.email(messages.email));
const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, messages.newPassword)
  .max(MAX_PASSWORD_LENGTH, messages.passwordTooLong);

export const SignInFields = z.object({
  email,
  password: z.string().min(1, messages.password),
});
export type SignInFields = z.input<typeof SignInFields>;

export const AccountFields = z.object({ name, email, password: newPassword });
export type AccountFields = z.input<typeof AccountFields>;

export const WorkspaceFields = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(1, messages.workspaceName)
    .max(MAX_WORKSPACE_NAME_LENGTH, messages.workspaceNameTooLong),
});
export type WorkspaceFields = z.input<typeof WorkspaceFields>;

/** Input of the setup server function: both steps of the first-run form. */
export const SetupInput = AccountFields.extend(WorkspaceFields.shape);
export type SetupInput = z.output<typeof SetupInput>;

export const InviteFields = z.object({ name, password: newPassword });
export type InviteFields = z.input<typeof InviteFields>;

/** Input of the invitation accept server function. The email always comes from the invitation. */
export const AcceptInvitationInput = InviteFields.extend({ invitationId: z.uuid() });
export type AcceptInvitationInput = z.output<typeof AcceptInvitationInput>;

export type FieldErrors<T> = Partial<Record<keyof T & string, string>>;

/** First error message per field, or an empty object when the values are valid. */
export function fieldErrors<S extends z.ZodObject>(schema: S, values: z.input<S>): FieldErrors<z.input<S>> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in errors)) errors[key] = issue.message;
  }
  return errors as FieldErrors<z.input<S>>;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/** Live hint under a new-password field: "12 characters or more. 4 to go." */
export function passwordHint(length: number): string {
  const rule = `${MIN_PASSWORD_LENGTH} characters or more.`;
  const left = MIN_PASSWORD_LENGTH - length;
  return length > 0 && left > 0 ? `${rule} ${left} to go.` : rule;
}

/** Keeps ?redirect= on /signin to same-origin paths, so the sign-in form cannot send people elsewhere. */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined;
  if (value.startsWith('/signin') || value.startsWith('/setup')) return undefined;
  return value;
}
