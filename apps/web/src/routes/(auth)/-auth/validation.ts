import { MIN_PASSWORD_LENGTH } from '@pm/contracts';
import type { z } from 'zod';

// Form helpers shared by the sign-in, setup and invitation screens. The schemas (SignInFields,
// AccountFields, WorkspaceFields, SetupInput, InviteFields, AcceptInvitationInput) and their
// messages live in @pm/contracts. Client-safe: no server imports here.

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
