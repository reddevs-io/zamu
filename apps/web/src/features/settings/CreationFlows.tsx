// Create, then reveal once: the form dialog closes and the reveal dialog shows the new secret. The
// secret lives only in this component's state and is dropped when "I copied the key" is pressed.
import type { ApiKeyCreated } from '@pm/contracts';
import { useState } from 'react';
import { AddAgentDialog, type AddAgentDialogProps } from './AddAgentDialog';
import { KeyRevealDialog, type RevealedKey } from './KeyRevealDialog';
import { NewKeyDialog, type NewKeyDialogProps } from './NewKeyDialog';

export type AgentCreationProps = Omit<AddAgentDialogProps, 'onCreated'> & {
  serverUrl?: string;
  /** Called once the agent exists, before its key is shown. */
  onCreated?: AddAgentDialogProps['onCreated'];
};

export function AgentCreation({ serverUrl, onOpenChange, onCreated, ...props }: AgentCreationProps) {
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  return (
    <>
      <AddAgentDialog
        {...props}
        onOpenChange={onOpenChange}
        onCreated={(result) => {
          onOpenChange(false);
          setRevealed({ key: result.key, actsFor: result.agent.responsible?.name ?? null });
          onCreated?.(result);
        }}
      />
      <KeyRevealDialog revealed={revealed} onDone={() => setRevealed(null)} serverUrl={serverUrl} />
    </>
  );
}

export type KeyCreationProps = Omit<NewKeyDialogProps, 'onCreated'> & {
  /** For agent keys: the responsible human, shown as "Acts for …". */
  actsFor?: string | null;
  serverUrl?: string;
};

export function KeyCreation({ actsFor, serverUrl, onOpenChange, ...props }: KeyCreationProps) {
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  return (
    <>
      <NewKeyDialog
        {...props}
        onOpenChange={onOpenChange}
        onCreated={(key: ApiKeyCreated) => {
          onOpenChange(false);
          setRevealed({ key, actsFor: actsFor ?? null });
        }}
      />
      <KeyRevealDialog revealed={revealed} onDone={() => setRevealed(null)} serverUrl={serverUrl} />
    </>
  );
}
