// Invite person: email and role, then the invitation link to copy. M1 sends no email.
import type { Invitation, InvitationRole } from '@pm/contracts';
import { type FormEvent, useState } from 'react';
import { z } from 'zod';
import {
  Banner,
  Button,
  CodeBlock,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Modal,
  Select,
  TextField,
} from '~/ui';
import { formatExpiry, formatShortDate } from './format';
import { errorMessage, SettingsError } from './result';

export interface InviteDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (input: { email: string; role: InvitationRole }) => Promise<Invitation>;
  /** Line under the email field, for example who the invitation is for. */
  hint?: string;
  /** The invitation exists; the dialog now shows its link. */
  onCreated?: (invitation: Invitation) => void;
}

const ROLE_OPTIONS = [
  { id: 'member', label: 'Member', description: 'Works on tasks, adds their own API keys' },
  { id: 'admin', label: 'Admin', description: 'Also manages members, agents and every API key' },
];

const Email = z.email();

export function InviteDialog({ isOpen, onOpenChange, onSubmit, hint, onCreated }: InviteDialogProps) {
  return (
    <Modal width={520} top={96} isOpen={isOpen} onOpenChange={onOpenChange}>
      <InviteContent
        onSubmit={onSubmit}
        close={() => onOpenChange(false)}
        hint={hint}
        onCreated={onCreated}
      />
    </Modal>
  );
}

export interface InviteContentProps extends Pick<InviteDialogProps, 'onSubmit' | 'hint' | 'onCreated'> {
  close: () => void;
}

export function InviteContent({ onSubmit, close, hint, onCreated }: InviteContentProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitationRole>('member');
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (pending) return;
    const value = email.trim();
    if (!Email.safeParse(value).success) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setPending(true);
    setFormError(undefined);
    try {
      const created = await onSubmit({ email: value, role });
      setInvitation(created);
      onCreated?.(created);
    } catch (error) {
      if (error instanceof SettingsError && error.code === 'CONFLICT') setEmailError(error.message);
      else setFormError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  if (invitation) {
    return (
      <Dialog aria-label="Invitation link">
        <DialogHeader title={`Invitation for ${invitation.email}`} />
        <DialogBody>
          <Banner tone="info">
            No email is sent. Share this link with {invitation.email}. It works once and{' '}
            {formatExpiry(invitation.expiresAt)} ({formatShortDate(invitation.expiresAt)}).
          </Banner>
          {invitation.link ? (
            <CodeBlock copyable copyLabel="Copy invitation link">
              {invitation.link}
            </CodeBlock>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button autoFocus onPress={close}>
            Done
          </Button>
        </DialogFooter>
      </Dialog>
    );
  }

  return (
    <Dialog aria-label="Invite person">
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader title="Invite person" />
        <DialogBody>
          {formError ? <Banner>{formError}</Banner> : null}
          <TextField
            label="Email"
            type="email"
            autoFocus
            value={email}
            onChange={(value) => {
              setEmail(value);
              setEmailError(undefined);
            }}
            isInvalid={Boolean(emailError)}
            errorMessage={emailError}
            description={hint}
            placeholder="name@company.com"
            autoComplete="off"
          />
          <Select
            label="Role"
            items={ROLE_OPTIONS}
            selectedKey={role}
            onSelectionChange={(key) => setRole(key === 'admin' ? 'admin' : 'member')}
          />
        </DialogBody>
        <DialogFooter
          start={
            <span className="text-[11.5px] text-muted">You get a link to send. It expires in 7 days.</span>
          }
        >
          <Button variant="secondary" onPress={close}>
            Cancel
          </Button>
          <Button type="submit" isPending={pending}>
            Create invitation link
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
