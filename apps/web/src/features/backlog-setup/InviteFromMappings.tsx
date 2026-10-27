import type { Invitation, InvitationRole } from '@pm/contracts';
import { useRef } from 'react';
import { InviteDialog } from '~/features/settings/InviteDialog';
import { type InviteDraft, inviteHint } from './assignee-hints';

// Invite person from the Mappings step: the settings dialog with a line saying which assignee the
// invitation is for. Nothing maps on accept; the step tells the admin to map the value afterwards.

export interface InviteFromMappingsProps {
  /** The assignee to invite someone for; null keeps the dialog closed. */
  draft: InviteDraft | null;
  onClose: () => void;
  onSubmit: (input: { email: string; role: InvitationRole }) => Promise<Invitation>;
  /** The invitation exists; the dialog shows its link until Done. */
  onCreated: (draft: InviteDraft, invitation: Invitation) => void;
}

export function InviteFromMappings({ draft, onClose, onSubmit, onCreated }: InviteFromMappingsProps) {
  // Keeps the hint while the dialog closes.
  const last = useRef(draft);
  if (draft) last.current = draft;
  const shown = draft ?? last.current;
  return (
    <InviteDialog
      isOpen={draft !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={onSubmit}
      hint={shown ? inviteHint(shown) : undefined}
      onCreated={(invitation) => {
        if (shown) onCreated(shown, invitation);
      }}
    />
  );
}
