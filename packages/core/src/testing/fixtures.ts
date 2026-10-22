// Test fixtures for @pm/core: a workspace with people and an agent on the shared test database.
// Test-only (imports @pm/db/test, which imports vitest).
import { type Auth, createAuth } from '@pm/auth';
import { createDb, type Db, type DbHandle, schema } from '@pm/db';
import { sharedTestDatabaseUrl } from '@pm/db/test';
import type { Actor } from '../authz';
import type { CoreContext } from '../context';

export const TEST_SECRET = 'test-secret-test-secret-test-secret-0123';
export const TEST_PUBLIC_URL = 'http://localhost:3000';

export interface TestContext extends CoreContext {
  pool: DbHandle['pool'];
  url: string;
  close: () => Promise<void>;
}

export function testContext(): TestContext {
  const url = sharedTestDatabaseUrl();
  const { db, pool } = createDb(url);
  pool.on('error', () => {});
  const auth: Auth = createAuth({ db, secret: TEST_SECRET, baseUrl: TEST_PUBLIC_URL });
  return { db, auth, publicUrl: TEST_PUBLIC_URL, pool, url, close: () => pool.end() };
}

const unique = () => crypto.randomUUID().slice(0, 8);

export async function createUser(
  db: Db,
  values: Partial<typeof schema.user.$inferInsert> & { name: string },
): Promise<typeof schema.user.$inferSelect> {
  const [row] = await db
    .insert(schema.user)
    .values({ email: `${unique()}-${crypto.randomUUID()}@example.com`, ...values })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row;
}

export interface World {
  workspaceId: string;
  owner: typeof schema.user.$inferSelect;
  member: typeof schema.user.$inferSelect;
  agent: typeof schema.user.$inferSelect;
  /** Session actors: full member rights. */
  ownerActor: Actor;
  memberActor: Actor;
  /** The agent acting through a workspace-wide write key. */
  agentActor: Actor;
}

/** A fresh workspace: an owner, a member, and an agent the member is responsible for. */
export async function createWorld(db: Db, name = 'Reddevs'): Promise<World> {
  const [workspace] = await db
    .insert(schema.organization)
    .values({ name, slug: `${name.toLowerCase()}-${crypto.randomUUID()}` })
    .returning();
  if (!workspace) throw new Error('organization insert failed');
  const owner = await createUser(db, { name: `Ana Ruiz ${unique()}` });
  const member = await createUser(db, { name: `Tomás Berg ${unique()}` });
  const agent = await createUser(db, {
    name: `claude-dev-${unique()}`,
    kind: 'agent',
    responsibleUserId: member.id,
  });
  await db.insert(schema.member).values([
    { organizationId: workspace.id, userId: owner.id, role: 'owner' },
    { organizationId: workspace.id, userId: member.id, role: 'member' },
    { organizationId: workspace.id, userId: agent.id, role: 'member' },
  ]);
  const workspaceId = workspace.id;
  return {
    workspaceId,
    owner,
    member,
    agent,
    ownerActor: { userId: owner.id, kind: 'person', workspaceId, role: 'owner', onBehalfOfId: null },
    memberActor: { userId: member.id, kind: 'person', workspaceId, role: 'member', onBehalfOfId: null },
    agentActor: {
      userId: agent.id,
      kind: 'agent',
      workspaceId,
      role: 'member',
      scope: { projects: 'all', access: 'write' },
      onBehalfOfId: member.id,
      apiKeyId: crypto.randomUUID(),
    },
  };
}

/** A project key that is unique enough for tests sharing a workspace: a letter plus 5 random chars. */
export function randomProjectKey(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const chars = `${letters}0123456789`;
  let key = letters[Math.floor(Math.random() * letters.length)] as string;
  for (let i = 0; i < 5; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}
