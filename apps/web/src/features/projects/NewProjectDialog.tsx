import type { CreateProjectInput } from '@pm/contracts';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Modal,
  TextField,
  useHotkeys,
} from '~/ui';
import { newRepositoryHint, RepositoryField } from './RepositoryField';
import {
  type NewProjectErrors,
  type NewProjectField,
  type NewProjectValues,
  normalizeKeyInput,
  repositoryError,
  suggestKey,
  validateNewProject,
} from './validation';

/** What the server said: an error on one field (key or repository taken) or a message for the banner. */
export interface NewProjectFailure {
  field?: NewProjectField;
  message: string;
}

export interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Creates the project; resolves to null on success or to the error to show. */
  onSubmit: (input: CreateProjectInput) => Promise<NewProjectFailure | null>;
}

/**
 * New project dialog (frame 03-new-project, M2.1 frames 2a to 2d): name, key suggested from the name,
 * optional description and repository.
 */
export function NewProjectDialog({ isOpen, onClose, onSubmit }: NewProjectDialogProps) {
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
        <NewProjectForm onCancel={onClose} onSubmit={onSubmit} />
      </Dialog>
    </Modal>
  );
}

const EMPTY: NewProjectValues = { name: '', key: '', description: '', repository: '' };

/** Shortcut hint on the submit button: ⌘↵ or Ctrl↵. */
export function useSubmitHint(): string {
  // ⌘ on Apple platforms, Ctrl elsewhere. Read after mount: the server cannot know.
  const [hint, setHint] = useState('⌘↵');
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      '';
    if (!/mac|iphone|ipad|ipod/i.test(platform || navigator.userAgent)) setHint('Ctrl↵');
  }, []);
  return hint;
}

function keyHint(key: string, suggested: boolean): string {
  const example = key ? `Task IDs will look like ${key}-1.` : 'It prefixes task IDs, like PAY-42.';
  const prefix = suggested && key ? 'Suggested from the name. ' : '';
  return `${prefix}${example} You can change it until the first task exists.`;
}

export interface NewProjectFormProps {
  onCancel: () => void;
  onSubmit: NewProjectDialogProps['onSubmit'];
}

export function NewProjectForm({ onCancel, onSubmit }: NewProjectFormProps) {
  const [values, setValues] = useState<NewProjectValues>(EMPTY);
  // The key follows the name until the person types their own.
  const [keyEdited, setKeyEdited] = useState(false);
  const [errors, setErrors] = useState<NewProjectErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitHint = useSubmitHint();
  const inputs = {
    name: useRef<HTMLInputElement>(null),
    key: useRef<HTMLInputElement>(null),
    description: useRef<HTMLInputElement>(null),
    repository: useRef<HTMLInputElement>(null),
  };

  const clear = (field: NewProjectField) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure(null);
  };

  const onNameChange = (name: string) => {
    setValues((current) => ({ ...current, name, key: keyEdited ? current.key : suggestKey(name) }));
    clear('name');
    if (!keyEdited) clear('key');
  };

  const onKeyChange = (raw: string) => {
    const key = normalizeKeyInput(raw);
    setValues((current) => ({ ...current, key }));
    // Clearing the key hands it back to the suggestion.
    setKeyEdited(key !== '');
    clear('key');
  };

  const onDescriptionChange = (description: string) => {
    setValues((current) => ({ ...current, description }));
    clear('description');
  };

  const onRepositoryChange = (repository: string) => {
    setValues((current) => ({ ...current, repository }));
    clear('repository');
  };

  const onRepositoryBlur = () => {
    const error = repositoryError(values.repository);
    if (error) setErrors((current) => ({ ...current, repository: error }));
  };

  const submit = async () => {
    if (pending) return;
    const result = validateNewProject(values);
    if (!result.ok) {
      setErrors(result.errors);
      const first = (['name', 'key', 'description', 'repository'] as const).find(
        (field) => result.errors[field],
      );
      if (first) inputs[first].current?.focus();
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      const error = await onSubmit(result.input);
      if (!error) return;
      if (error.field) {
        setErrors({ [error.field]: error.message });
        inputs[error.field].current?.focus();
      } else {
        setFailure(error.message);
      }
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
      <DialogHeader title="New project" />
      <DialogBody>
        {failure ? <Banner>{failure}</Banner> : null}
        <TextField
          label="Name"
          name="name"
          inputRef={inputs.name}
          autoFocus
          autoComplete="off"
          value={values.name}
          onChange={onNameChange}
          isInvalid={Boolean(errors.name)}
          errorMessage={errors.name}
          validationBehavior="aria"
        />
        <TextField
          label="Key"
          name="key"
          inputRef={inputs.key}
          mono
          autoComplete="off"
          spellCheck="false"
          inputClassName="w-35 text-sm tracking-[0.04em]"
          value={values.key}
          onChange={onKeyChange}
          description={keyHint(values.key, !keyEdited)}
          isInvalid={Boolean(errors.key)}
          errorMessage={errors.key}
          validationBehavior="aria"
        />
        <TextField
          label={
            <>
              Description <span className="font-normal text-fg-3">optional</span>
            </>
          }
          name="description"
          inputRef={inputs.description}
          autoComplete="off"
          placeholder="What this project covers"
          value={values.description}
          onChange={onDescriptionChange}
          isInvalid={Boolean(errors.description)}
          errorMessage={errors.description}
          validationBehavior="aria"
        />
        <RepositoryField
          inputRef={inputs.repository}
          value={values.repository}
          onChange={onRepositoryChange}
          onBlur={onRepositoryBlur}
          description={newRepositoryHint(values.repository)}
          error={errors.repository}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          kbd={submitHint}
          aria-keyshortcuts="Meta+Enter Control+Enter"
          isPending={pending}
        >
          Create project
        </Button>
      </DialogFooter>
    </form>
  );
}
