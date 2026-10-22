// Invitations: copyable links, no email in M1. Rows live in Better Auth's invitation table, so the
// organization plugin and the sign-up guard in @pm/auth see them.
import { INVITATION_EXPIRES_IN_SECONDS } from '@pm/auth';
import { AuthId, CreateInvitationInput, Invitation, type InvitationStatus } from '@pm/contracts';
import { type DbOrTx, schema } from '@pm/db';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type Actor, authorize, can } from './authz';
import type { DbContext, LinkContext } from './context';
import { Conflict, NotFound, parseInput } from './errors';
import { loadUsers, userRef } from './internal';
import { toWorkspaceRole } from './members';

const { invitation, member, user } = schema;

type InvitationRow = typeof invitation.$inferSelect;

/** Path of the accept page served by the web app (apps/web route /invite/$id). */
export function invitationPath(id: string): string {
  return `/invite/${id}`;
}

export function invitationLink(publicUrl: string, id: string): string {
  return new URL(invitationPath(id), publicUrl).toString();
}

function status(row: InvitationRow, now: Date): InvitationStatus {
  const value = row.status as InvitationStatus;
  if (value === 'pending' && row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return value;
}

async function toInvitations(
  db: DbOrTx,
  rows: InvitationRow[],
  link: ((id: string) => string) | null,
): Promise<Invitation[]> {
  const inviters = await loadUsers(
    db,
    rows.map((row) => row.inviterId),
  );
  const now = new Date();
  return rows.map((row) => {
    const inviter = inviters.get(row.inviterId);
    return Invitation.parse({
      id: row.id,
      email: row.email,
      role: toWorkspaceRole(row.role),
      status: status(row, now),
      invitedBy: inviter ? userRef(inviter) : { id: row.inviterId, name: 'Unknown', kind: 'person' },
      link: link ? link(row.id) : null,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    });
  });
}

/**
 * Invites a person by email. Admins only. Returns the invitation with its link, valid for 7 days.
 * Earlier pending invitations for the same email are canceled; Conflict when the email already
 * belongs to a member.
 */
export async function createInvitation(
  { db, publicUrl }: LinkContext,
  actor: Actor,
  input: z.input<typeof CreateInvitationInput>,
): Promise<Invitation> {
  const parsed = parseInput(CreateInvitationInput, input);
  authorize(actor, 'member.manage');
  const email = parsed.email.trim().toLowerCase();

  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: user.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, actor.workspaceId), eq(sql`lower(${user.email})`, email)))
      .limit(1);
    if (existing) throw new Conflict(`${email} is already a member of this workspace`);

    await tx
      .update(invitation)
      .set({ status: 'canceled' })
      .where(
        and(
          eq(invitation.organizationId, actor.workspaceId),
          eq(sql`lower(${invitation.email})`, email),
          eq(invitation.status, 'pending'),
        ),
      );
    const [created] = await tx
      .insert(invitation)
      .values({
        organizationId: actor.workspaceId,
        email,
        role: parsed.role,
        status: 'pending',
        expiresAt: new Date(Date.now() + INVITATION_EXPIRES_IN_SECONDS * 1000),
        inviterId: actor.userId,
      })
      .returning();
    if (!created) throw new Error('invitation insert returned no row');
    return created;
  });

  const [result] = await toInvitations(db, [row], (id) => invitationLink(publicUrl, id));
  if (!result) throw new Error('invitation could not be read back');
  return result;
}

/**
 * Pending invitations of the workspace, newest first. Ones past their expiry that the
 * invitations.expire job has not marked yet come back as `expired`. Links only for admins.
 */
export async function listInvitations({ db, publicUrl }: LinkContext, actor: Actor): Promise<Invitation[]> {
  authorize(actor, 'workspace.read');
  const rows = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, actor.workspaceId), eq(invitation.status, 'pending')))
    .orderBy(desc(invitation.createdAt), desc(invitation.id));
  const link = can(actor, 'member.manage') ? (id: string) => invitationLink(publicUrl, id) : null;
  return toInvitations(db, rows, link);
}

export const CancelInvitationInput = z.object({ id: AuthId });
export type CancelInvitationInput = z.output<typeof CancelInvitationInput>;

/** Cancels a pending invitation, so its link stops working. Admins only. */
export async function cancelInvitation(
  { db }: DbContext,
  actor: Actor,
  input: z.input<typeof CancelInvitationInput>,
): Promise<Invitation> {
  const { id } = parseInput(CancelInvitationInput, input);
  authorize(actor, 'member.manage');
  const [row] = await db
    .update(invitation)
    .set({ status: 'canceled' })
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.organizationId, actor.workspaceId),
        eq(invitation.status, 'pending'),
      ),
    )
    .returning();
  if (!row) throw new NotFound('Pending invitation not found');
  const [result] = await toInvitations(db, [row], null);
  if (!result) throw new Error('invitation could not be read back');
  return result;
}

/**
 * Marks pending invitations whose expiry has passed as `expired`. Run by the worker's daily
 * invitations.expire job; safe to run at any time. Returns how many were marked.
 */
export async function expireInvitations(
  { db }: DbContext,
  options: { now?: Date } = {},
): Promise<{ expired: number }> {
  const now = options.now ?? new Date();
  const rows = await db
    .update(invitation)
    .set({ status: 'expired' })
    .where(and(eq(invitation.status, 'pending'), lte(invitation.expiresAt, now)))
    .returning({ id: invitation.id });
  return { expired: rows.length };
}
