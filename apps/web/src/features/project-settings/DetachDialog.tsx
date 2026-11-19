// Detach from Backlog.md (frame 2m): irreversible, so the project key has to be typed.
import type { BacklogSourceStatus } from '@zamu/contracts';
import { type FormEvent, useState } from 'react';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  InlineCode,
  Modal,
  TextField,
} from '~/ui';
import { errorMessage } from '../settings/result';
import { providerName, shortCommit, sourceTaskTotals } from './format';

export interface DetachDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  status: BacklogSourceStatus;
  projectName: string;
  /** Resolves when detached (the dialog closes); rejects with the error to show. */
  onDetach: (confirmKey: string) => Promise<unknown>;
}

export function DetachDialog({ isOpen, onOpenChange, ...props }: DetachDialogProps) {
  return (
    <Modal width={540} top={60} isOpen={isOpen} onOpenChange={onOpenChange}>
      <DetachContent {...props} close={() => onOpenChange(false)} />
    </Modal>
  );
}

function DetachContent({
  status,
  projectName,
  onDetach,
  close,
}: Omit<DetachDialogProps, 'isOpen' | 'onOpenChange'> & { close: () => void }) {
  const key = status.project.key;
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toUpperCase() === key;
  const { milestones, hidden } = status.counts;
  const tasks = sourceTaskTotals(status.counts).total;
  const folder = `${status.folder ?? 'backlog'}/`;
  const commit = status.lastRead?.commit;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!matches || pending) return;
    setPending(true);
    setError(null);
    try {
      await onDetach(typed.trim());
      close();
    } catch (failure) {
      setPending(false);
      setError(errorMessage(failure));
    }
  };

  return (
    <Dialog role="alertdialog">
      <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader title={`Detach ${projectName} from Backlog.md?`} showEsc={false} className="pt-4.5" />
        <DialogBody className="gap-3">
          {error ? <Banner>{error}</Banner> : null}
          <p className="m-0 leading-prose text-fg-2">
            This can't be undone. {projectName} keeps all {tasks} {tasks === 1 ? 'task' : 'tasks'} and{' '}
            {milestones} {milestones === 1 ? 'milestone' : 'milestones'} as they are now
            {commit ? (
              <>
                , at commit <span className="font-mono text-xs text-fg">{shortCommit(commit)}</span>
              </>
            ) : null}
            .
          </p>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-4.5 text-sm leading-prose text-fg-2">
            <li>Every field becomes editable here, by people and agents.</li>
            <li>
              Changes to the files no longer reach this project. Agents should stop editing{' '}
              <InlineCode className="text-xs">{folder}</InlineCode> and use{' '}
              <InlineCode className="text-xs">zamu</InlineCode>.
            </li>
            <li>
              {status.nextTaskKey
                ? `New tasks continue at ${status.nextTaskKey}.`
                : 'New tasks continue the numbering after the highest Backlog.md ID.'}{' '}
              The Backlog.md section stays on each task, read-only.
            </li>
            {hidden ? (
              <li>
                {hidden} hidden {hidden === 1 ? 'task stays' : 'tasks stay'} hidden. You can delete{' '}
                {hidden === 1 ? 'it' : 'them'} afterwards.
              </li>
            ) : null}
            <li>
              Remove the webhook in {providerName(status.connection)}; it will get 410 Gone from now on.
            </li>
          </ul>
          <TextField
            label={`Type ${key} to confirm`}
            name="confirmKey"
            mono
            autoFocus
            autoComplete="off"
            spellCheck="false"
            value={typed}
            onChange={setTyped}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onPress={close}>
            Keep mirroring
          </Button>
          <Button type="submit" variant="danger" isDisabled={!matches} isPending={pending}>
            Detach
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
