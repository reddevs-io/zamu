import { type Project, UpdateProjectInput } from '@pm/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { Heading } from 'react-aria-components';
import { orpc } from '~/lib/orpc';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Modal,
  Switch,
  TextField,
  useHotkeys,
} from '~/ui';
import { editProjectFailure } from './errors';

// Edit project: name, description, and the M2 feature switches. Turning milestones or cycles off hides
// their tab, filter and task fields; the data stays and comes back when the switch goes on again.
// Not in the design: it follows the New project dialog.

export type EditProjectField = 'name' | 'description';

export interface EditProjectChanges {
  name?: string;
  description?: string | null;
  usesMilestones?: boolean;
  usesCycles?: boolean;
}

export interface EditProjectFailure {
  field?: EditProjectField;
  message: string;
}

export interface EditProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Pick<Project, 'key' | 'name' | 'description' | 'usesMilestones' | 'usesCycles'>;
  /** Saves the changed fields; resolves to null on success or to the error to show. */
  onSubmit: (changes: EditProjectChanges) => Promise<EditProjectFailure | null>;
}

export function EditProjectDialog({ isOpen, onClose, project, onSubmit }: EditProjectDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={500}
      top={120}
    >
      <Dialog>
        <EditProjectForm project={project} onCancel={onClose} onSubmit={onSubmit} />
      </Dialog>
    </Modal>
  );
}

/** Only the fields that differ from the project. */
export function projectChanges(
  project: EditProjectDialogProps['project'],
  values: { name: string; description: string; usesMilestones: boolean; usesCycles: boolean },
): EditProjectChanges {
  const name = values.name.trim();
  const description = values.description.trim() || null;
  return {
    ...(name !== project.name ? { name } : {}),
    ...(description !== (project.description ?? null) ? { description } : {}),
    ...(values.usesMilestones !== project.usesMilestones ? { usesMilestones: values.usesMilestones } : {}),
    ...(values.usesCycles !== project.usesCycles ? { usesCycles: values.usesCycles } : {}),
  };
}

interface FormProps {
  project: EditProjectDialogProps['project'];
  onCancel: () => void;
  onSubmit: EditProjectDialogProps['onSubmit'];
}

function EditProjectForm({ project, onCancel, onSubmit }: FormProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [usesMilestones, setUsesMilestones] = useState(project.usesMilestones);
  const [usesCycles, setUsesCycles] = useState(project.usesCycles);
  const [errors, setErrors] = useState<Partial<Record<EditProjectField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (pending) return;
    const changes = projectChanges(project, { name, description, usesMilestones, usesCycles });
    if (!Object.keys(changes).length) {
      onCancel();
      return;
    }
    const parsed = UpdateProjectInput.safeParse({ project: project.key, ...changes });
    if (!parsed.success) {
      const next: Partial<Record<EditProjectField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name')
          next.name ??= issue.code === 'too_small' ? 'Enter a project name.' : 'Use 100 characters or fewer.';
        if (field === 'description') next.description ??= 'Use 2,000 characters or fewer.';
      }
      setErrors(next);
      if (next.name) nameRef.current?.focus();
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      const error = await onSubmit(changes);
      if (!error) return;
      if (error.field) setErrors({ [error.field]: error.message });
      else setFailure(error.message);
    } finally {
      setPending(false);
    }
  };

  useHotkeys({ 'Mod+Enter': () => void submit() }, { allowInOverlays: true });

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  return (
    <form noValidate onSubmit={onFormSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <span className="font-mono text-[10.5px] text-muted">{project.key}</span>
        <Heading slot="title" className="m-0 text-[13px] font-semibold">
          Edit project
        </Heading>
      </DialogHeader>
      <DialogBody>
        {failure ? <Banner>{failure}</Banner> : null}
        <TextField
          label="Name"
          name="name"
          inputRef={nameRef}
          autoFocus
          autoComplete="off"
          value={name}
          onChange={(value) => {
            setName(value);
            setErrors((current) => ({ ...current, name: undefined }));
            setFailure(null);
          }}
          isInvalid={Boolean(errors.name)}
          errorMessage={errors.name}
          validationBehavior="aria"
        />
        <TextField
          label={
            <>
              Description <span className="font-normal text-faint">optional</span>
            </>
          }
          name="description"
          autoComplete="off"
          placeholder="What this project covers"
          value={description}
          onChange={(value) => {
            setDescription(value);
            setErrors((current) => ({ ...current, description: undefined }));
          }}
          isInvalid={Boolean(errors.description)}
          errorMessage={errors.description}
          validationBehavior="aria"
        />
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[12px] font-semibold text-fg">Planning</legend>
          <FeatureSwitch
            label="Use milestones"
            description="Group tasks toward a goal with a target date."
            isSelected={usesMilestones}
            onChange={setUsesMilestones}
          />
          <FeatureSwitch
            label="Use cycles"
            description="Plan work in fixed-length cycles that roll unfinished tasks over."
            isSelected={usesCycles}
            onChange={setUsesCycles}
          />
          <p className="m-0 text-[11.5px] text-muted">
            Turning one off hides its tab, filter and task fields. Nothing is deleted.
          </p>
        </fieldset>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={onCancel}>
          Cancel
        </Button>
        <Button type="submit" aria-keyshortcuts="Meta+Enter Control+Enter" isPending={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

function FeatureSwitch({
  label,
  description,
  isSelected,
  onChange,
}: {
  label: string;
  description: string;
  isSelected: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Switch isSelected={isSelected} onChange={onChange} className="text-fg">
        <span className="text-[12.5px] text-fg">{label}</span>
      </Switch>
      <span className="pl-[34px] text-[11.5px] text-muted">{description}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wired to the API
// ---------------------------------------------------------------------------

export interface EditProjectDialogHostProps {
  project: EditProjectDialogProps['project'] | undefined;
  isOpen: boolean;
  onClose: () => void;
}

/** EditProjectDialog that saves through PATCH /projects/{project}. Render it where the dialog opens. */
export function EditProjectDialogHost({ project, isOpen, onClose }: EditProjectDialogHostProps) {
  const queryClient = useQueryClient();
  const update = useMutation(orpc.projects.update.mutationOptions());
  if (!project) return null;
  const onSubmit = async (changes: EditProjectChanges) => {
    try {
      await update.mutateAsync({ project: project.key, ...changes });
    } catch (error) {
      return editProjectFailure(error);
    }
    // The header tabs, the task fields and the planning pages read the flags from these.
    void queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
    onClose();
    return null;
  };
  return <EditProjectDialog isOpen={isOpen} onClose={onClose} project={project} onSubmit={onSubmit} />;
}
