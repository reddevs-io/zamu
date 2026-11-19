import type { Cycle } from '@zamu/contracts';
import { CycleDialog, type CycleField, type CycleValues, cycleDefaults } from './CycleDialog';
import { writeFailure } from './errors';
import { useCreateCycle, useUpdateCycle } from './queries';

// The cycle dialogs wired to the API.

const FIELDS: readonly CycleField[] = ['name', 'startsOn', 'endsOn'];

/** Number the next cycle gets: one more than the highest so far. */
export function nextCycleNumber(cycles: readonly Pick<Cycle, 'number'>[]): number {
  return cycles.reduce((max, cycle) => Math.max(max, cycle.number), 0) + 1;
}

export interface NewCycleDialogProps {
  projectKey: string;
  cycles: readonly Cycle[];
  isOpen: boolean;
  onClose: () => void;
  today: string;
}

export function NewCycleDialog({ projectKey, cycles, isOpen, onClose, today }: NewCycleDialogProps) {
  const create = useCreateCycle();
  const onSubmit = async (values: CycleValues) => {
    try {
      await create.mutateAsync({
        project: projectKey,
        name: values.name,
        startsOn: values.startsOn,
        endsOn: values.endsOn,
      });
    } catch (error) {
      return writeFailure(error, FIELDS, 'cycle', {
        field: 'startsOn',
        message: 'These dates overlap another cycle. Pick days no other cycle uses.',
      });
    }
    onClose();
    return null;
  };
  return (
    <CycleDialog
      isOpen={isOpen}
      onClose={onClose}
      projectKey={projectKey}
      number={nextCycleNumber(cycles)}
      defaults={cycleDefaults(cycles, today)}
      today={today}
      onSubmit={onSubmit}
    />
  );
}

export interface EditCycleDialogProps {
  projectKey: string;
  cycle: Cycle;
  isOpen: boolean;
  onClose: () => void;
  today: string;
}

export function EditCycleDialog({ projectKey, cycle, isOpen, onClose, today }: EditCycleDialogProps) {
  const update = useUpdateCycle();
  const onSubmit = async (values: CycleValues) => {
    const changes = {
      ...(values.name !== cycle.name ? { name: values.name } : {}),
      ...(cycle.state === 'upcoming' && values.startsOn !== cycle.startsOn
        ? { startsOn: values.startsOn }
        : {}),
      ...(cycle.state === 'upcoming' && values.endsOn !== cycle.endsOn ? { endsOn: values.endsOn } : {}),
    };
    if (Object.keys(changes).length) {
      try {
        await update.mutateAsync({ project: projectKey, number: cycle.number, ...changes });
      } catch (error) {
        return writeFailure(error, FIELDS, 'cycle', {
          message: (error as Error).message || 'These dates overlap another cycle.',
        });
      }
    }
    onClose();
    return null;
  };
  return (
    <CycleDialog
      isOpen={isOpen}
      onClose={onClose}
      projectKey={projectKey}
      number={cycle.number}
      defaults={{ startsOn: cycle.startsOn, endsOn: cycle.endsOn, hint: '' }}
      cycle={cycle}
      today={today}
      onSubmit={onSubmit}
    />
  );
}
