import type { Db } from '@zamu/db';
import { z } from 'zod';

// Read-only lookups for the signed-out screens. Server-only: called from server function handlers.

/** Name of the instance's first workspace, shown on the sign-in screen; null before setup. */
export async function loadInstanceName(db: Db): Promise<string | null> {
  const row = await db.query.organization.findFirst({
    columns: { name: true },
    orderBy: { createdAt: 'asc' },
  });
  return row?.name ?? null;
}

export type InvitationState = 'pending' | 'expired' | 'used' | 'canceled' | 'not-found';

export interface InvitationDetails {
  state: InvitationState;
  /** Present unless the invitation does not exist. */
  email: string | null;
  workspaceName: string | null;
  inviterName: string | null;
}

const NOT_FOUND: InvitationDetails = {
  state: 'not-found',
  email: null,
  workspaceName: null,
  inviterName: null,
};

function stateOf(status: string, expiresAt: Date, now: Date): InvitationState {
  if (status === 'accepted') return 'used';
  if (status === 'canceled' || status === 'rejected') return 'canceled';
  if (status === 'expired' || expiresAt.getTime() <= now.getTime()) return 'expired';
  return status === 'pending' ? 'pending' : 'canceled';
}

/** The invitation behind an /invite/$id link. The id is the secret, so unknown ids reveal nothing. */
export async function loadInvitation(db: Db, id: string, now = new Date()): Promise<InvitationDetails> {
  if (!z.uuid().safeParse(id).success) return NOT_FOUND;
  const row = await db.query.invitation.findFirst({
    columns: { email: true, status: true, expiresAt: true },
    with: { organization: { columns: { name: true } }, inviter: { columns: { name: true } } },
    where: { id },
  });
  if (!row) return NOT_FOUND;
  return {
    state: stateOf(row.status, row.expiresAt, now),
    email: row.email,
    workspaceName: row.organization.name,
    inviterName: row.inviter.name,
  };
}
