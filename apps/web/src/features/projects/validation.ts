import { CreateProjectInput, suggestProjectKey } from '@pm/contracts';

// Validation of the New project dialog. The contract schema is the source of truth; this module only
// turns its issues into one message per field and keeps the copy short.

export interface NewProjectValues {
  name: string;
  key: string;
  description: string;
}

export type NewProjectField = keyof NewProjectValues;
export type NewProjectErrors = Partial<Record<NewProjectField, string>>;

export type NewProjectValidation =
  | { ok: true; input: CreateProjectInput }
  | { ok: false; errors: NewProjectErrors };

const FIELDS: readonly NewProjectField[] = ['name', 'key', 'description'];

function messageFor(field: NewProjectField, code: string, message: string): string {
  if (field === 'name') {
    if (code === 'too_small') return 'Enter a project name.';
    if (code === 'too_big') return 'Use 100 characters or fewer.';
  }
  if (field === 'key') return 'Use 2 to 6 letters or digits, starting with a letter.';
  if (field === 'description' && code === 'too_big') return 'Use 2,000 characters or fewer.';
  return message;
}

/** Validates the form with CreateProjectInput; an empty description is left out. */
export function validateNewProject(values: NewProjectValues): NewProjectValidation {
  const description = values.description.trim();
  const result = CreateProjectInput.safeParse({
    name: values.name,
    key: values.key,
    ...(description ? { description } : {}),
  });
  if (result.success) return { ok: true, input: result.data };
  const errors: NewProjectErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || !FIELDS.includes(field as NewProjectField)) continue;
    const name = field as NewProjectField;
    errors[name] ??= messageFor(name, issue.code, issue.message);
  }
  return { ok: false, errors };
}

/** The key suggested for a name ("Billing reconciliation" → "BIL"), or "" when none fits. */
export function suggestKey(name: string): string {
  return suggestProjectKey(name) ?? '';
}

/** Key as typed: upper-cased, spaces removed, capped at 6 characters. */
export function normalizeKeyInput(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase().slice(0, 6);
}
