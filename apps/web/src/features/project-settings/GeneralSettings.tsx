// Project settings, General (frame 2a): name, key, description, repository and the planning
// switches. Replaces the Edit project dialog. While the project mirrors Backlog.md the key and the
// milestones switch are locked and say why; the repository can only be cleared, which pauses the mirror.
// Owners and admins get the Delete this project row at the bottom (PM-12).
import { parseRepositoryUrl, UpdateProjectInput } from '@pm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { useProjectSummary } from '~/features/project-header';
import { meQuery } from '~/features/projects/queries';
import { editRepositoryHint, RepositoryField } from '~/features/projects/RepositoryField';
import { normalizeKeyInput, repositoryError, repositoryMessage } from '~/features/projects/validation';
import { isAdminRole } from '~/features/settings/format';
import { orpc } from '~/lib/orpc';
import { Banner, Button, cn, lockedHatch, Skeleton, Switch, TextArea, TextField, useHotkeys } from '~/ui';
import { DeleteProjectDialog, DeleteProjectRow } from './DeleteProjectDialog';
import {
  type GeneralChanges,
  type GeneralFailure,
  type GeneralField,
  type GeneralProject,
  type GeneralValues,
  generalFailure,
  initialValues,
  keyLockReason,
  projectChanges,
} from './general';
import { hasTasksQuery, useDeleteProject } from './queries';

/** The General page wired to the API. */
export function GeneralSettings({ projectKey }: { projectKey: string }) {
  const project = useProjectSummary(projectKey);
  const hasTasks = useQuery(hasTasksQuery(projectKey)).data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const update = useMutation(orpc.projects.update.mutationOptions());
  const me = useQuery(meQuery());
  const canDelete = isAdminRole(me.data?.role);
  const remove = useDeleteProject(projectKey);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!project) return <GeneralSkeleton />;

  const onSubmit = async (changes: GeneralChanges): Promise<GeneralFailure | null> => {
    try {
      await update.mutateAsync({ project: project.key, ...changes });
    } catch (error) {
      return generalFailure(error);
    }
    // The rail, the header tabs, the task fields and the planning pages read the flags from these.
    await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
    if (changes.key) {
      void navigate({ to: '/p/$projectKey/settings', params: { projectKey: changes.key }, replace: true });
    }
    return null;
  };

  const backlog = project.backlog;
  return (
    <div className="flex max-w-[560px] flex-col gap-8">
      <GeneralForm
        // Another project (or a new key) starts the form over; a save keeps it, with "Saved." showing.
        key={project.key}
        project={project}
        hasTasks={hasTasks}
        onSubmit={onSubmit}
      />
      {canDelete ? (
        <>
          <DeleteProjectRow onDelete={() => setDeleteOpen(true)} />
          <DeleteProjectDialog
            isOpen={deleteOpen}
            onOpenChange={setDeleteOpen}
            projectKey={project.key}
            mirrored={backlog?.mode === 'mirror' && backlog.state !== 'detached'}
            onDelete={(confirmKey) => remove.mutateAsync(confirmKey)}
          />
        </>
      ) : null}
    </div>
  );
}

export interface GeneralFormProps {
  project: GeneralProject;
  /** undefined while the count loads; the key stays fixed until it is known. */
  hasTasks: boolean | undefined;
  /** Saves the changed fields; resolves to null on success or to the error to show. */
  onSubmit: (changes: GeneralChanges) => Promise<GeneralFailure | null>;
}

export function GeneralForm({ project, hasTasks, onSubmit }: GeneralFormProps) {
  const [values, setValues] = useState<GeneralValues>(() => initialValues(project));
  const [errors, setErrors] = useState<Partial<Record<GeneralField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const repositoryRef = useRef<HTMLInputElement>(null);

  const locked = project.locked ?? [];
  const mirrored = locked.length > 0;
  const keyLock = keyLockReason(project, hasTasks);
  const milestonesLocked = locked.includes('usesMilestones');

  const set = <K extends keyof GeneralValues>(field: K, value: GeneralValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure(null);
    setSaved(false);
  };

  const focusField = (field: GeneralField | undefined) => {
    if (field === 'name') nameRef.current?.focus();
    if (field === 'key') keyRef.current?.focus();
    if (field === 'repository') repositoryRef.current?.focus();
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (pending) return;
    const changes = projectChanges(project, values);
    if (!Object.keys(changes).length) {
      setSaved(true);
      return;
    }
    const parsed = UpdateProjectInput.safeParse({ project: project.key, ...changes });
    if (!parsed.success) {
      const next: Partial<Record<GeneralField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name')
          next.name ??= issue.code === 'too_small' ? 'Enter a project name.' : 'Use 100 characters or fewer.';
        if (field === 'key') next.key ??= 'Use 2 to 6 letters or digits, starting with a letter.';
        if (field === 'description') next.description ??= 'Use 2,000 characters or fewer.';
        if (field === 'repository') next.repository ??= repositoryMessage(issue.code);
      }
      setErrors(next);
      focusField(next.name ? 'name' : next.key ? 'key' : next.repository ? 'repository' : undefined);
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      const error = await onSubmit(changes);
      if (!error) {
        setSaved(true);
        return;
      }
      if (error.field && error.field !== 'usesMilestones') {
        setErrors({ [error.field]: error.message });
        focusField(error.field);
      } else {
        setFailure(error.message);
      }
    } finally {
      setPending(false);
    }
  };

  useHotkeys({ 'Mod+Enter': () => void submit() });

  const repositoryHint = mirrored ? mirroredRepositoryHint(values.repository, project) : null;

  return (
    <form noValidate onSubmit={submit} aria-label="General" className="flex max-w-[560px] flex-col gap-4">
      {failure ? <Banner>{failure}</Banner> : null}
      <TextField
        label="Name"
        name="name"
        inputRef={nameRef}
        autoComplete="off"
        value={values.name}
        onChange={(value) => set('name', value)}
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name}
        validationBehavior="aria"
      />
      <TextField
        label="Key"
        name="key"
        inputRef={keyRef}
        mono
        autoComplete="off"
        spellCheck="false"
        value={values.key}
        isReadOnly={keyLock !== null}
        inputClassName={cn(keyLock !== null && [lockedHatch, 'text-muted'].join(' '))}
        onChange={(value) => set('key', normalizeKeyInput(value))}
        description={
          keyLock ??
          `Task keys start with it, like ${values.key || project.key}-1. It can change while the project has no tasks.`
        }
        isInvalid={Boolean(errors.key)}
        errorMessage={errors.key}
        validationBehavior="aria"
      />
      <TextArea
        label="Description"
        name="description"
        rows={3}
        placeholder="What this project covers"
        value={values.description}
        onChange={(value) => set('description', value)}
        isInvalid={Boolean(errors.description)}
        errorMessage={errors.description}
        validationBehavior="aria"
      />
      <RepositoryField
        inputRef={repositoryRef}
        value={values.repository}
        onChange={(value) => set('repository', value)}
        onBlur={() => {
          const error = repositoryError(values.repository);
          if (error) setErrors((current) => ({ ...current, repository: error }));
        }}
        description={repositoryHint ?? editRepositoryHint(values.repository, project)}
        error={errors.repository}
      />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[12px] font-semibold text-fg">Planning</legend>
        <span className="flex items-center gap-2.5">
          <Switch
            isSelected={values.usesMilestones}
            isDisabled={milestonesLocked}
            onChange={(value) => set('usesMilestones', value)}
            aria-describedby={milestonesLocked ? 'milestones-locked' : undefined}
          >
            <span className="text-[12.5px] text-fg">Milestones</span>
          </Switch>
          {milestonesLocked ? (
            <span id="milestones-locked" className="text-[12.5px] text-faint">
              · stays on while Backlog.md is mirrored; its milestones live here
            </span>
          ) : null}
        </span>
        <Switch isSelected={values.usesCycles} onChange={(value) => set('usesCycles', value)}>
          <span className="text-[12.5px] text-fg">Cycles</span>
        </Switch>
        <p className="m-0 text-[11.5px] text-muted">
          Turning one off hides its tab, filter and task fields. Nothing is deleted.
        </p>
      </fieldset>
      <div className="flex items-center gap-2">
        <Button type="submit" isPending={pending}>
          Save
        </Button>
        {saved ? (
          <span role="status" className="text-[11.5px] text-muted">
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Repository hint of a mirrored project (frame 2a), or what clearing it does. */
function mirroredRepositoryHint(value: string, project: GeneralProject): ReactNode {
  const current = project.repository ? parseRepositoryUrl(project.repository)?.short : undefined;
  if (!value.trim() && project.repository) {
    return `Saving unlinks ${current ?? project.repository} and pauses the Backlog.md mirror.`;
  }
  const short = parseRepositoryUrl(value)?.short;
  if (!short) return null;
  return `Matches ${short}. The Backlog.md mirror reads this repository, so clearing it pauses the mirror.`;
}

function GeneralSkeleton() {
  return (
    <div aria-busy className="flex max-w-[560px] flex-col gap-5">
      {[38, 38, 60, 38].map((height, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <div key={index} className="flex flex-col gap-2">
          <Skeleton width={80} />
          <Skeleton height={height} />
        </div>
      ))}
    </div>
  );
}
