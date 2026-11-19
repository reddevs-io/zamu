import { type Cycle, CycleName, MAX_CYCLE_DAYS } from '@zamu/contracts';
import { type FormEvent, useId, useRef, useState } from 'react';
import { TextField as AriaTextField, Input } from 'react-aria-components';
import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  FieldError,
  Label,
  Modal,
  useHotkeys,
} from '~/ui';
import { DateField } from './DateField';
import {
  addDays,
  formatDay,
  formatLength,
  formatLengthSentence,
  formatLongWeekdayDay,
  formatWeekdayDay,
  lengthInDays,
  nextMonday,
} from './dates';
import type { WriteFailure } from './errors';
import { useSubmitHint } from './submit-hint';

// New cycle and Edit cycle, on the Margin dialog. The name is optional and reads "Cycle 15 · …"; the dates are
// prefilled from the last cycle (the day after it ends, same length) or, for the first cycle, two weeks
// from next Monday, as core does when they are omitted.

export type CycleField = 'name' | 'startsOn' | 'endsOn';

export interface CycleValues {
  name: string | null;
  startsOn: string;
  endsOn: string;
}

export interface CycleDefaults {
  startsOn: string;
  endsOn: string;
  /** Sentence under the dates while they are the defaults. */
  hint: string;
}

/** Default dates of the next cycle, mirroring core's createCycle. */
export function cycleDefaults(
  cycles: readonly Pick<Cycle, 'number' | 'startsOn' | 'endsOn'>[],
  today: string,
): CycleDefaults {
  const last = [...cycles].sort((a, b) => b.endsOn.localeCompare(a.endsOn) || b.number - a.number)[0];
  if (!last) {
    const startsOn = nextMonday(today);
    return {
      startsOn,
      endsOn: addDays(startsOn, 13),
      hint: `${formatLengthSentence(14)} from ${formatLongWeekdayDay(startsOn)}. You can change the length.`,
    };
  }
  const length = lengthInDays(last.startsOn, last.endsOn);
  const afterLast = addDays(last.endsOn, 1);
  const startsOn = afterLast < today ? today : afterLast;
  const after =
    startsOn === afterLast ? `It starts the day after Cycle ${last.number} ends.` : 'It starts today.';
  return {
    startsOn,
    endsOn: addDays(startsOn, length - 1),
    hint: `${capitalize(formatLength(length))}, the same length as Cycle ${last.number}. ${after}`,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Problem with the dates before sending them, or null. */
export function checkCycleDates(startsOn: string, endsOn: string, today: string): string | null {
  const days = lengthInDays(startsOn, endsOn);
  if (days < 1) return 'End on or after the start date.';
  if (days > MAX_CYCLE_DAYS) return `Keep cycles to ${MAX_CYCLE_DAYS} days or fewer.`;
  if (endsOn < today) return 'A cycle cannot end before today.';
  return null;
}

export interface CycleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectKey: string;
  /** Number the new cycle gets, or the number of the cycle being edited. */
  number: number;
  /** Prefilled dates and their hint. */
  defaults: CycleDefaults;
  /** Edit this cycle: dates change only while it is Upcoming. */
  cycle?: Pick<Cycle, 'name' | 'startsOn' | 'endsOn' | 'state'>;
  today: string;
  onSubmit: (values: CycleValues) => Promise<WriteFailure<CycleField> | null>;
}

export function CycleDialog({ isOpen, onClose, ...props }: CycleDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={500}
      top={110}
    >
      <Dialog>
        <CycleForm onCancel={onClose} {...props} />
      </Dialog>
    </Modal>
  );
}

type FormProps = Omit<CycleDialogProps, 'isOpen' | 'onClose'> & { onCancel: () => void };

function CycleForm({ onCancel, projectKey, number, defaults, cycle, today, onSubmit }: FormProps) {
  const isEdit = cycle != null;
  const datesLocked = isEdit && cycle.state !== 'upcoming';
  const [name, setName] = useState(cycle?.name ?? '');
  const [startsOn, setStartsOn] = useState(cycle?.startsOn ?? defaults.startsOn);
  const [endsOn, setEndsOn] = useState(cycle?.endsOn ?? defaults.endsOn);
  const [errors, setErrors] = useState<Partial<Record<CycleField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitHint = useSubmitHint();
  const nameRef = useRef<HTMLInputElement>(null);
  const prefixId = useId();

  const isDefault = !isEdit && startsOn === defaults.startsOn && endsOn === defaults.endsOn;
  const length = lengthInDays(startsOn, endsOn);
  const hint = datesLocked
    ? `Cycle ${number} has started: only its name can change.`
    : isDefault
      ? defaults.hint
      : length >= 1
        ? `${capitalize(formatLength(length))}, ${formatDay(startsOn)} to ${formatDay(endsOn)}.`
        : '';

  const submit = async () => {
    if (pending) return;
    const trimmed = name.trim();
    const nameCheck = trimmed ? CycleName.safeParse(trimmed) : null;
    const dateProblem = datesLocked ? null : checkCycleDates(startsOn, endsOn, today);
    if ((nameCheck && !nameCheck.success) || dateProblem) {
      setErrors({
        ...(nameCheck && !nameCheck.success ? { name: 'Use 100 characters or fewer.' } : {}),
        ...(dateProblem ? { endsOn: dateProblem } : {}),
      });
      if (nameCheck && !nameCheck.success) nameRef.current?.focus();
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      const error = await onSubmit({ name: trimmed || null, startsOn, endsOn });
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

  const clearDateErrors = () => {
    setErrors((current) => ({ ...current, startsOn: undefined, endsOn: undefined }));
    setFailure(null);
  };

  return (
    <form noValidate onSubmit={onFormSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title={isEdit ? `Edit Cycle ${number}` : 'New cycle'}>
        <span className="text-sm text-fg-3 tabular-nums">{projectKey}</span>
      </DialogHeader>
      <DialogBody>
        {failure ? <Banner>{failure}</Banner> : null}
        <AriaTextField
          name="name"
          value={name}
          onChange={(value) => {
            setName(value);
            setErrors((current) => ({ ...current, name: undefined }));
          }}
          autoFocus
          isInvalid={Boolean(errors.name)}
          validationBehavior="aria"
          className="flex flex-col gap-1.5"
        >
          <Label>
            Name <span className="font-normal text-fg-3">optional</span>
          </Label>
          <div
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-sm border bg-surface px-2.75 text-md',
              'focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]',
              errors.name ? 'border-danger shadow-[0_0_0_3px_var(--danger-soft)]' : 'border-line',
            )}
          >
            <span id={prefixId} className="shrink-0 text-fg-2 tabular-nums">
              Cycle {number} ·
            </span>
            <Input
              ref={nameRef}
              aria-describedby={prefixId}
              autoComplete="off"
              placeholder="What is this cycle about?"
              className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
            />
          </div>
          <FieldError>{errors.name}</FieldError>
        </AriaTextField>
        <div className="grid grid-cols-2 gap-3">
          <DateField
            label="Starts"
            value={startsOn}
            onChange={(value) => {
              if (!value) return;
              // Moving the start keeps the length, as people usually shift a cycle rather than resize it.
              const keep = lengthInDays(startsOn, endsOn);
              setStartsOn(value);
              if (keep >= 1) setEndsOn(addDays(value, keep - 1));
              clearDateErrors();
            }}
            format={formatWeekdayDay}
            isDisabled={datesLocked}
            errorMessage={errors.startsOn}
          />
          <DateField
            label="Ends"
            value={endsOn}
            onChange={(value) => {
              if (!value) return;
              setEndsOn(value);
              clearDateErrors();
            }}
            format={formatWeekdayDay}
            isDisabled={datesLocked}
            errorMessage={errors.endsOn}
          />
        </div>
        {hint ? <p className="m-0 text-xs text-fg-3">{hint}</p> : null}
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
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
