import type { Cycle, TaskListItem } from '@pm/contracts';
import { useState } from 'react';
import {
  Avatar,
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Label,
  Modal,
  RadioCard,
  RadioGroup,
  StatusSquare,
  UnassignedAvatar,
} from '~/ui';
import { addDays, formatDay, formatRange, lengthInDays } from './dates';
import { compareTasks, STATUS_ORDER } from './PlanningTaskTable';

// End cycle (frame 25): where the unfinished tasks go, which tasks those are, then one request.
// The target is the next upcoming cycle, or a new one of the same length when there is none (core
// creates it), or no cycle.

export type EndTarget = 'next' | 'none';

/** moveTo for POST /cycles/{project}/{number}/end: the next cycle's number, none, or omitted (new cycle). */
export function moveToFor(
  target: EndTarget,
  next: Pick<Cycle, 'number'> | undefined,
): number | 'none' | undefined {
  if (target === 'none') return 'none';
  return next?.number;
}

export interface EndCycleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cycle: Pick<Cycle, 'number' | 'startsOn' | 'endsOn' | 'counts'>;
  /** Earliest upcoming cycle, if any. */
  next?: Pick<Cycle, 'number' | 'startsOn' | 'endsOn' | 'counts'>;
  /** Number a new cycle would get when there is no upcoming one. */
  newNumber: number;
  /** Tasks of the cycle that are not Done or Canceled. */
  unfinished: readonly TaskListItem[];
  /** Ends the cycle; resolves to null on success or to the message to show. */
  onSubmit: (moveTo: number | 'none' | undefined) => Promise<string | null>;
}

export function EndCycleDialog({ isOpen, onClose, ...props }: EndCycleDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={560}
      top={70}
    >
      <Dialog>
        <EndCycleForm onCancel={onClose} {...props} />
      </Dialog>
    </Modal>
  );
}

type FormProps = Omit<EndCycleDialogProps, 'isOpen' | 'onClose'> & { onCancel: () => void };

function EndCycleForm({ onCancel, cycle, next, newNumber, unfinished, onSubmit }: FormProps) {
  const [target, setTarget] = useState<EndTarget>('next');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const counted = cycle.counts.total - cycle.counts.canceled;
  const done = cycle.counts.done;
  const left = unfinished.length;
  const name = `Cycle ${cycle.number}`;

  const length = lengthInDays(cycle.startsOn, cycle.endsOn);
  const newStart = addDays(cycle.endsOn, 1);
  const nextLabel = next ? `Cycle ${next.number}` : `New Cycle ${newNumber}`;
  const nextDetail = next
    ? `${formatRange(next.startsOn, next.endsOn)} · ${next.counts.total} ${next.counts.total === 1 ? 'task' : 'tasks'}`
    : `${formatRange(newStart, addDays(newStart, length - 1))} · same length`;

  const sorted = [...unfinished].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || compareTasks(a, b),
  );

  const lead = left
    ? `${done} of ${counted} tasks are done. The other ${left} ${
        target === 'none'
          ? 'go back to the project list'
          : left === 1
            ? 'moves to the next cycle'
            : 'move to the next cycle'
      }.`
    : `${done} of ${counted} tasks are done. Nothing is left to move.`;

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    try {
      const error = await onSubmit(moveToFor(target, next));
      if (error) setFailure(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title={`End ${name} now?`} />
      <DialogBody className="gap-3.5">
        {failure ? <Banner>{failure}</Banner> : null}
        <p className="m-0 leading-[1.55]">
          {lead} {name} keeps a record of what moved. It would end on its own on {formatDay(cycle.endsOn)} at
          midnight.
        </p>
        {left ? (
          <>
            <RadioGroup
              label="Move unfinished tasks to"
              layout="grid"
              value={target}
              onChange={(value) => setTarget(value as EndTarget)}
            >
              <RadioCard
                value="next"
                label={<span className="font-semibold">{nextLabel}</span>}
                description={nextDetail}
              />
              <RadioCard
                value="none"
                label={<span className="font-semibold">No cycle</span>}
                description="Back to the project list"
              />
            </RadioGroup>
            <div className="flex flex-col gap-1.5">
              <Label id="end-cycle-unfinished">Unfinished · {left}</Label>
              <ul
                aria-labelledby="end-cycle-unfinished"
                className="m-0 flex max-h-[250px] list-none flex-col overflow-auto border border-line p-0"
              >
                {sorted.map((task) => (
                  <li
                    key={task.key}
                    className="grid h-8 shrink-0 grid-cols-[14px_64px_minmax(0,1fr)_20px] items-center gap-2.5 border-b border-line-2 px-2.5 text-[12.5px] last:border-b-0"
                  >
                    <StatusSquare status={task.status} />
                    <span className="font-mono text-[10.5px] text-muted">{task.key}</span>
                    <span className="truncate">{task.title}</span>
                    {task.assignee ? (
                      <Avatar name={task.assignee.name} kind={task.assignee.kind} />
                    ) : (
                      <UnassignedAvatar />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </DialogBody>
      <DialogFooter
        start={<span className="text-[11.5px] text-muted">Done and canceled tasks stay in {name}.</span>}
      >
        <Button variant="secondary" onPress={onCancel}>
          Cancel
        </Button>
        <Button isPending={pending} onPress={() => void submit()}>
          {left ? `End and move ${left}` : 'End cycle'}
        </Button>
      </DialogFooter>
    </div>
  );
}
