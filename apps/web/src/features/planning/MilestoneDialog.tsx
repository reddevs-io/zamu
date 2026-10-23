import {
  CreateMilestoneInput,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUSES,
  type MilestoneStatus,
  type MilestoneWithProgress,
} from '@pm/contracts';
import { type FormEvent, useRef, useState } from 'react';
import { Heading } from 'react-aria-components';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  isMilestoneFilled,
  MilestoneGlyph,
  Modal,
  type OptionItem,
  Select,
  TextArea,
  TextField,
  useHotkeys,
} from '~/ui';
import { DateField, type QuickPick } from './DateField';
import { addDays, endOfMonth, endOfQuarter } from './dates';
import { fieldErrors, type WriteFailure } from './errors';
import { useSubmitHint } from './submit-hint';

// New milestone (frame 16) and Edit milestone. Name, Markdown description, target date with quick
// picks; Edit adds the status and Delete. The host does the request and returns what went wrong.

export type MilestoneField = 'name' | 'description' | 'targetDate';
const FIELDS: readonly MilestoneField[] = ['name', 'description', 'targetDate'];

export interface MilestoneValues {
  name: string;
  description: string | null;
  targetDate: string | null;
  status?: MilestoneStatus;
}

export interface MilestoneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectKey: string;
  /** Edit this milestone; without it the dialog creates one. */
  milestone?: MilestoneWithProgress;
  /** Today in the server's time zone, for the calendar and the quick picks. */
  today: string;
  /** Saves; resolves to null on success or to the error to show. */
  onSubmit: (values: MilestoneValues) => Promise<WriteFailure<MilestoneField> | null>;
  /** Edit only: deletes the milestone; resolves to null on success or to an error message. */
  onDelete?: () => Promise<string | null>;
}

export function MilestoneDialog({ isOpen, onClose, ...props }: MilestoneDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={560}
      top={100}
    >
      <Dialog>
        <MilestoneForm onCancel={onClose} {...props} />
      </Dialog>
    </Modal>
  );
}

const STATUS_ITEMS: OptionItem[] = MILESTONE_STATUSES.map((status) => ({
  id: status,
  label: MILESTONE_STATUS_LABELS[status],
  prefix: <MilestoneGlyph filled={isMilestoneFilled(status)} />,
}));

export function quickPicks(today: string): QuickPick[] {
  return [
    { label: 'In 2 weeks', date: addDays(today, 14) },
    { label: 'End of month', date: endOfMonth(today) },
    { label: 'End of quarter', date: endOfQuarter(today) },
    { label: 'Clear', date: null },
  ];
}

type FormProps = Omit<MilestoneDialogProps, 'isOpen' | 'onClose'> & { onCancel: () => void };

function MilestoneForm({ onCancel, projectKey, milestone, today, onSubmit, onDelete }: FormProps) {
  const isEdit = milestone != null;
  const [name, setName] = useState(milestone?.name ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [targetDate, setTargetDate] = useState<string | null>(milestone?.targetDate ?? null);
  const [status, setStatus] = useState<MilestoneStatus>(milestone?.status ?? 'planned');
  const [errors, setErrors] = useState<Partial<Record<MilestoneField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const submitHint = useSubmitHint();
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    if (pending) return;
    const trimmed = description.trim();
    const parsed = CreateMilestoneInput.safeParse({
      project: projectKey,
      name,
      description: trimmed ? trimmed : null,
      targetDate,
    });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error, FIELDS);
      setErrors(next);
      if (next.name) nameRef.current?.focus();
      else if (next.description) descriptionRef.current?.focus();
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      const error = await onSubmit({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        targetDate: parsed.data.targetDate ?? null,
        ...(isEdit ? { status } : {}),
      });
      if (!error) return;
      if (error.field) {
        setErrors({ [error.field]: error.message });
        if (error.field === 'name') nameRef.current?.focus();
      } else {
        setFailure(error.message);
      }
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!onDelete || pending) return;
    setPending(true);
    try {
      const error = await onDelete();
      if (error) {
        setFailure(error);
        setConfirmDelete(false);
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

  const taskCount = milestone?.progress.total ?? 0;

  return (
    <form noValidate onSubmit={onFormSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <span className="font-mono text-[10.5px] text-muted">{projectKey}</span>
        <Heading slot="title" className="m-0 text-[13px] font-semibold">
          {isEdit ? 'Edit milestone' : 'New milestone'}
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
        <TextArea
          label={
            <>
              Description <span className="font-normal text-faint">optional, Markdown</span>
            </>
          }
          name="description"
          inputRef={descriptionRef}
          rows={2}
          inputClassName="min-h-[64px]"
          placeholder="What does done look like?"
          value={description}
          onChange={(value) => {
            setDescription(value);
            setErrors((current) => ({ ...current, description: undefined }));
          }}
          isInvalid={Boolean(errors.description)}
          errorMessage={errors.description}
          validationBehavior="aria"
        />
        <div className="flex items-start gap-4">
          <DateField
            label="Target date"
            labelNote="optional"
            value={targetDate}
            onChange={(value) => {
              setTargetDate(value);
              setErrors((current) => ({ ...current, targetDate: undefined }));
            }}
            today={today}
            quickPicks={quickPicks(today)}
            width={220}
            inline
            errorMessage={errors.targetDate}
          />
          {isEdit ? (
            <Select
              label="Status"
              items={STATUS_ITEMS}
              value={status}
              onChange={(key) => {
                if (key != null) setStatus(key as MilestoneStatus);
              }}
              className="w-[180px]"
            />
          ) : null}
        </div>
      </DialogBody>
      {confirmDelete ? (
        <DialogFooter
          start={
            <span className="text-[12px] text-fg">
              Delete {milestone?.name}?{' '}
              <span className="text-muted">
                {taskCount
                  ? `Its ${taskCount} ${taskCount === 1 ? 'task loses' : 'tasks lose'} the milestone.`
                  : 'It has no tasks.'}
              </span>
            </span>
          }
        >
          <Button variant="secondary" onPress={() => setConfirmDelete(false)}>
            Keep it
          </Button>
          <Button variant="destructive" size="md" isPending={pending} onPress={() => void remove()}>
            Delete milestone
          </Button>
        </DialogFooter>
      ) : (
        <DialogFooter
          start={
            isEdit ? (
              onDelete ? (
                <Button variant="destructive" onPress={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              ) : null
            ) : (
              <span className="text-[11.5px] text-muted">
                Starts as Planned. It turns Active when a task in it starts.
              </span>
            )
          }
        >
          <Button variant="secondary" onPress={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            kbd={submitHint}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            isPending={pending}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}
