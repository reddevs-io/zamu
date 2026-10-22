import { type Db, type DbOrTx, schema } from '@pm/db';
import { sql } from 'drizzle-orm';
import type { Auth } from './auth';
import { MIN_PASSWORD_LENGTH } from './options';

/** Better Auth's default maximum password length. */
const MAX_PASSWORD_LENGTH = 128;

/** Advisory lock key that serialises concurrent bootstrapAdmin calls. */
const BOOTSTRAP_LOCK_KEY = 7_331_001;

/** Databases known to have users. A deleted last user is not a supported state, so this never resets. */
const setUp = new WeakSet<object>();

/** True when no user exists yet, so the instance still needs its first admin. */
export async function isFirstRun(db: DbOrTx): Promise<boolean> {
  if (setUp.has(db)) return false;
  const rows = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
  if (rows.length > 0) {
    setUp.add(db);
    return false;
  }
  return true;
}

export type BootstrapErrorCode = 'ALREADY_SET_UP' | 'INVALID_INPUT';

export class BootstrapError extends Error {
  constructor(
    readonly code: BootstrapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BootstrapError';
  }
}

export interface BootstrapAdminInput {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

export interface BootstrapAdminResult {
  userId: string;
  workspaceId: string;
}

/** URL-safe slug for an organization; Better Auth requires one. */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'workspace';
}

function validate(input: BootstrapAdminInput): BootstrapAdminInput {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const workspaceName = input.workspaceName.trim();
  if (!name) throw new BootstrapError('INVALID_INPUT', 'Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new BootstrapError('INVALID_INPUT', 'Email is invalid.');
  if (!workspaceName) throw new BootstrapError('INVALID_INPUT', 'Workspace name is required.');
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new BootstrapError('INVALID_INPUT', `Password needs ${MIN_PASSWORD_LENGTH} characters or more.`);
  }
  if (input.password.length > MAX_PASSWORD_LENGTH) {
    throw new BootstrapError('INVALID_INPUT', `Password is longer than ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return { name, email, password: input.password, workspaceName };
}

/**
 * First-run setup: creates the admin user with a password, the workspace and the owner membership
 * in one transaction. Throws BootstrapError('ALREADY_SET_UP') once any user exists.
 * The caller signs the admin in afterwards (auth.api.signInEmail).
 */
export async function bootstrapAdmin(
  { auth, db }: { auth: Auth; db: Db },
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const { name, email, password, workspaceName } = validate(input);
  const context = await auth.$context;
  const passwordHash = await context.password.hash(password);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
    if (!(await isFirstRun(tx))) {
      throw new BootstrapError('ALREADY_SET_UP', 'This instance already has an admin.');
    }
    const [user] = await tx.insert(schema.user).values({ name, email, kind: 'person' }).returning();
    if (!user) throw new Error('bootstrapAdmin: user insert returned no row');
    await tx.insert(schema.account).values({
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: passwordHash,
    });
    const [workspace] = await tx
      .insert(schema.organization)
      .values({ name: workspaceName, slug: slugify(workspaceName) })
      .returning();
    if (!workspace) throw new Error('bootstrapAdmin: organization insert returned no row');
    await tx.insert(schema.member).values({ organizationId: workspace.id, userId: user.id, role: 'owner' });
    return { userId: user.id, workspaceId: workspace.id };
  });

  setUp.add(db);
  return result;
}
