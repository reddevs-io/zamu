// Add agent: name, responsible human, access and permission. On success the parent shows the agent's
// first key in the reveal-once dialog.
import { AgentName } from '@pm/contracts';
import { type FormEvent, useState } from 'react';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Modal,
  type OptionItem,
  Select,
  TextField,
} from '~/ui';
import { errorMessage, SettingsError } from './result';
import { DEFAULT_SCOPE, PICK_A_PROJECT, ScopeFields, type ScopeValue, toApiKeyScope } from './ScopeFields';
import type { AgentCreatedResult, CreateAgentValues, ScopeProject } from './types';

export interface AddAgentDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** People who can be responsible for the agent. */
  people: readonly { id: string; name: string }[];
  /** Preselected responsible human: the signed-in user. */
  defaultResponsibleId: string;
  projects: readonly ScopeProject[];
  onSubmit: (values: CreateAgentValues) => Promise<AgentCreatedResult>;
  /** Called after the agent exists; the dialog has closed by then. */
  onCreated: (result: AgentCreatedResult) => void;
  /** Prefilled name, for example from a Backlog.md assignee. */
  defaultName?: string;
  /** Prefilled access and permission. Defaults to the whole workspace, read and write. */
  defaultScope?: ScopeValue;
  /** Replaces the hint under the name field. */
  nameDescription?: string;
}

export function AddAgentDialog({ isOpen, onOpenChange, ...props }: AddAgentDialogProps) {
  return (
    <Modal width={560} top={70} isOpen={isOpen} onOpenChange={onOpenChange}>
      <AddAgentForm {...props} onCancel={() => onOpenChange(false)} />
    </Modal>
  );
}

interface FieldErrors {
  name?: string;
  responsible?: string;
  projects?: string;
  form?: string;
}

function AddAgentForm({
  people,
  defaultResponsibleId,
  projects,
  onSubmit,
  onCreated,
  onCancel,
  defaultName = '',
  defaultScope = DEFAULT_SCOPE,
  nameDescription = 'Lowercase, numbers and dashes. Shows in activity next to every change it makes.',
}: Omit<AddAgentDialogProps, 'isOpen' | 'onOpenChange'> & { onCancel: () => void }) {
  const [name, setName] = useState(defaultName);
  const [responsibleId, setResponsibleId] = useState(
    people.some((person) => person.id === defaultResponsibleId)
      ? defaultResponsibleId
      : (people[0]?.id ?? ''),
  );
  const [scope, setScope] = useState<ScopeValue>(defaultScope);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  const trimmed = name.trim();
  const responsible = people.find((person) => person.id === responsibleId);
  const options: OptionItem[] = people.map((person) => ({
    id: person.id,
    label: person.name,
    avatar: { name: person.name, kind: 'person' },
  }));

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (pending) return;
    const next: FieldErrors = {};
    const parsedName = AgentName.safeParse(trimmed);
    if (!parsedName.success) {
      next.name =
        trimmed.length < 2 ? 'Use at least 2 characters.' : 'Use lowercase letters, numbers and dashes.';
    }
    if (!responsible) next.responsible = 'Pick the person this agent acts for.';
    const apiScope = toApiKeyScope(scope);
    if (!apiScope) next.projects = PICK_A_PROJECT;
    setErrors(next);
    if (Object.keys(next).length > 0 || !apiScope) return;

    setPending(true);
    try {
      const result = await onSubmit({ name: trimmed, responsibleUserId: responsibleId, scope: apiScope });
      onCreated(result);
    } catch (error) {
      setPending(false);
      if (error instanceof SettingsError) {
        const fieldErrors: FieldErrors = {
          name: error.code === 'CONFLICT' ? error.message : error.issueFor('name'),
          responsible: error.issueFor('responsibleUserId'),
          projects: error.issueFor('scope'),
        };
        const placed = Object.values(fieldErrors).some(Boolean);
        setErrors(placed ? fieldErrors : { form: error.message });
      } else {
        setErrors({ form: errorMessage(error) });
      }
    }
  };

  const agentLabel = trimmed || 'docs-bot';
  return (
    <Dialog aria-label="Add agent">
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogHeader title="Add agent" />
        <DialogBody>
          {errors.form ? <Banner>{errors.form}</Banner> : null}
          <TextField
            label="Name"
            mono
            autoFocus
            value={name}
            onChange={(value) => {
              setName(value);
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
            isInvalid={Boolean(errors.name)}
            errorMessage={errors.name}
            description={nameDescription}
            autoComplete="off"
            spellCheck="false"
          />
          <Select
            label="Responsible human"
            items={options}
            selectedKey={responsibleId || null}
            onSelectionChange={(key) => setResponsibleId(key == null ? '' : String(key))}
            isInvalid={Boolean(errors.responsible)}
            errorMessage={errors.responsible}
            description={`The agent acts for this person. Activity reads "${agentLabel} for ${responsible?.name ?? 'them'}".`}
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
          start={<span className="text-[11.5px] text-muted">Creates the agent and its first API key.</span>}
        >
          <Button variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
          <Button type="submit" isPending={pending}>
            Create agent
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
