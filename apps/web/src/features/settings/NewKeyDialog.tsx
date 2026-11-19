// New key: name, access and permission, for yourself or for an agent. On success the parent shows
// the key in the reveal-once dialog.
import type { ApiKeyCreated } from '@zamu/contracts';
import { type FormEvent, useState } from 'react';
import { Banner, Button, Dialog, DialogBody, DialogFooter, DialogHeader, Modal, TextField } from '~/ui';
import { errorMessage, SettingsError } from './result';
import { DEFAULT_SCOPE, PICK_A_PROJECT, ScopeFields, type ScopeValue, toApiKeyScope } from './ScopeFields';
import type { CreateApiKeyValues, ScopeProject } from './types';

export interface NewKeyDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The agent the key is for; null creates a key for yourself. */
  agent: { id: string; name: string } | null;
  projects: readonly ScopeProject[];
  onSubmit: (values: CreateApiKeyValues) => Promise<ApiKeyCreated>;
  onCreated: (key: ApiKeyCreated) => void;
}

const MAX_NAME = 100;

export function NewKeyDialog({ isOpen, onOpenChange, ...props }: NewKeyDialogProps) {
  return (
    <Modal width={560} top={70} isOpen={isOpen} onOpenChange={onOpenChange}>
      <NewKeyForm {...props} onCancel={() => onOpenChange(false)} />
    </Modal>
  );
}

interface FieldErrors {
  name?: string;
  projects?: string;
  form?: string;
}

function NewKeyForm({
  agent,
  projects,
  onSubmit,
  onCreated,
  onCancel,
}: Omit<NewKeyDialogProps, 'isOpen' | 'onOpenChange'> & { onCancel: () => void }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ScopeValue>(DEFAULT_SCOPE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    const next: FieldErrors = {};
    if (!trimmed) next.name = 'Name the key, for example after the machine it runs on.';
    else if (trimmed.length > MAX_NAME) next.name = `Use ${MAX_NAME} characters or fewer.`;
    const apiScope = toApiKeyScope(scope);
    if (!apiScope) next.projects = PICK_A_PROJECT;
    setErrors(next);
    if (Object.keys(next).length > 0 || !apiScope) return;

    setPending(true);
    try {
      const created = await onSubmit({
        name: trimmed,
        scope: apiScope,
        ...(agent ? { ownerId: agent.id } : {}),
      });
      onCreated(created);
    } catch (error) {
      setPending(false);
      if (error instanceof SettingsError) {
        const fieldErrors: FieldErrors = { name: error.issueFor('name'), projects: error.issueFor('scope') };
        setErrors(fieldErrors.name || fieldErrors.projects ? fieldErrors : { form: error.message });
      } else {
        setErrors({ form: errorMessage(error) });
      }
    }
  };

  return (
    <Dialog aria-label={agent ? `New key for ${agent.name}` : 'New key'}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader title={agent ? `New key for ${agent.name}` : 'New key'} />
        <DialogBody>
          {errors.form ? <Banner>{errors.form}</Banner> : null}
          <TextField
            label="Name"
            autoFocus
            value={name}
            onChange={(value) => {
              setName(value);
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
            placeholder={agent ? `${agent.name} on the CI runner` : 'My laptop'}
            isInvalid={Boolean(errors.name)}
            errorMessage={errors.name}
            description="Where the key is used, so you know which one to revoke later."
            autoComplete="off"
          />
          <ScopeFields
            value={scope}
            onChange={(value) => {
              setScope(value);
              if (errors.projects) setErrors({ ...errors, projects: undefined });
            }}
            projects={projects}
            projectsError={errors.projects}
          />
        </DialogBody>
        <DialogFooter
          start={
            <span className="text-xs text-fg-2">
              {agent ? `The key acts as ${agent.name}.` : 'The key acts as you.'}
            </span>
          }
        >
          <Button variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
          <Button type="submit" isPending={pending}>
            Create key
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
