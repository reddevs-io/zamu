// The caller: user, workspace, role and how far their credentials reach.
import { Me } from '@pm/contracts';
import { schema } from '@pm/db';
import { eq, inArray } from 'drizzle-orm';
import { type Actor, authorize } from './authz';
import type { DbContext } from './context';
import { NotFound } from './errors';
import { loadUsers, userRef } from './internal';

export async function getMe({ db }: DbContext, actor: Actor): Promise<Me> {
  authorize(actor, 'workspace.read');
  const [[me], [workspace]] = await Promise.all([
    db.select().from(schema.user).where(eq(schema.user.id, actor.userId)).limit(1),
    db.select().from(schema.organization).where(eq(schema.organization.id, actor.workspaceId)).limit(1),
  ]);
  if (!me || !workspace) throw new NotFound('User or workspace not found');

  const responsible =
    me.kind === 'agent' && me.responsibleUserId
      ? (await loadUsers(db, [me.responsibleUserId])).get(me.responsibleUserId)
      : undefined;

  let scope = null;
  if (actor.scope) {
    const { projects, access } = actor.scope;
    if (projects === 'all') scope = { projects: 'all' as const, access };
    else {
      const rows = projects.length
        ? await db
            .select({ id: schema.project.id, key: schema.project.key, name: schema.project.name })
            .from(schema.project)
            .where(inArray(schema.project.id, projects))
        : [];
      scope = { projects: rows.filter((row) => projects.includes(row.id)), access };
    }
  }

  return Me.parse({
    user: {
      id: me.id,
      name: me.name,
      email: me.kind === 'agent' ? null : me.email,
      kind: me.kind,
      responsible: responsible ? userRef(responsible) : null,
    },
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    role: actor.role,
    auth: { method: actor.apiKeyId || actor.scope ? 'api_key' : 'session', scope },
  });
}
