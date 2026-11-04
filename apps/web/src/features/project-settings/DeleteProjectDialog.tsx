// Delete a project (PM-12): the danger zone at the bottom of General settings (frame 127, screens.css
// .set-sec and .dz), the type-the-key dialog, and the "Deleted {KEY}" toast the next page shows.
import { ORPCError } from '@orpc/client';
import { type FormEvent, useState, useSyncExternalStore } from 'react';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Modal,
  TextField,
  Toast,
} from '~/ui';
import { errorMessage } from '../settings/result';

export const DELETE_PROJECT_TEXT =
  "Deletes its tasks, comments, history, milestones, cycles and Backlog.md mirror. This can't be undone.";

/** Danger zone at the bottom of General settings (owners and admins only). */
export function DeleteProjectRow({ onDelete }: { onDelete: () => void }) {
  return (
    <section aria-labelledby="danger-zone" className="flex flex-col gap-3.5 border-t border-line-soft pt-4.5">
      <h3 id="danger-zone" className="m-0 text-md font-semibold text-fg">
        Danger zone
      </h3>
      <div className="flex items-center gap-3.5 rounded-md border border-[color-mix(in_oklch,var(--danger)_35%,transparent)] p-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="font-semibold text-fg">Delete this project</b>
          <span className="text-sm leading-normal text-fg-3">{DELETE_PROJECT_TEXT}</span>
        </div>
        <Button
          variant="destructive"
          size="md"
          className="border-[color-mix(in_oklch,var(--danger)_40%,transparent)]"
          onPress={onDelete}
        >
          Delete project
        </Button>
      </div>
    </section>
  );
}

export interface DeleteProjectDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectKey: string;
  /** The project mirrors Backlog.md: its webhook on the git host has to go too. */
  mirrored: boolean;
  /** Resolves when deleted (the caller navigates away); rejects with the error to show. */
  onDelete: (confirmKey: string) => Promise<unknown>;
}

export function DeleteProjectDialog({ isOpen, onOpenChange, ...props }: DeleteProjectDialogProps) {
  return (
    <Modal width={440} top={160} isOpen={isOpen} onOpenChange={onOpenChange}>
      <DeleteContent {...props} close={() => onOpenChange(false)} />
    </Modal>
  );
}

/** What a failed delete says. Core's messages (403, 404) are written for people. */
export function deleteFailure(error: unknown): string {
  if (error instanceof ORPCError) {
    if (error.code === 'UNAUTHORIZED') return 'Your session ended. Sign in again to delete the project.';
    if (error.code === 'NOT_FOUND') return 'This project no longer exists.';
    if (error.status < 500 && error.message) return error.message;
  }
  return errorMessage(error);
}

function DeleteContent({
  projectKey,
  mirrored,
  onDelete,
  close,
}: Omit<DeleteProjectDialogProps, 'isOpen' | 'onOpenChange'> & { close: () => void }) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toUpperCase() === projectKey;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!matches || pending) return;
    setPending(true);
    setError(null);
    try {
      await onDelete(typed.trim());
    } catch (failure) {
      setPending(false);
      setError(deleteFailure(failure));
    }
  };

  return (
    <Dialog role="alertdialog">
      <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader title={`Delete ${projectKey}?`} showEsc={false} className="pt-4.5" />
        <DialogBody className="gap-3">
          {error ? <Banner>{error}</Banner> : null}
          <p className="m-0 leading-prose text-fg-2">
            {DELETE_PROJECT_TEXT}
            {mirrored ? ' Remove the webhook on the git host too.' : null}
          </p>
          <TextField
            label={`Type ${projectKey} to confirm`}
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
            Cancel
          </Button>
          <Button type="submit" variant="danger" isDisabled={!matches} isPending={pending}>
            Delete project
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// "Deleted {KEY}": the settings page navigates away right after the delete, so the toast lives in
// a module store that the shell reads (AppShell renders DeletedProjectToast; the delete goes to Home).
// ---------------------------------------------------------------------------

export const DELETED_TOAST_MS = 6_000;

interface DeletedNotice {
  id: number;
  key: string;
  at: number;
}

let notice: DeletedNotice | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function setNotice(next: DeletedNotice | null) {
  notice = next;
  for (const listener of listeners) listener();
}

/** Queues the toast for the next page that renders DeletedProjectToast. */
export function announceProjectDeleted(key: string, now: number = Date.now()): void {
  nextId += 1;
  setNotice({ id: nextId, key, at: now });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "Deleted PAY", once, for a deletion of the last few seconds. The shell renders it on every page. */
export function DeletedProjectToast() {
  const current = useSyncExternalStore(
    subscribe,
    () => notice,
    () => null,
  );
  // A notice nobody showed in time (the page was never opened) is stale.
  if (!current || Date.now() - current.at > DELETED_TOAST_MS) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-6">
      <Toast
        key={current.id}
        timeout={DELETED_TOAST_MS}
        onDismiss={() => {
          if (notice?.id === current.id) setNotice(null);
        }}
        className="pointer-events-auto"
      >
        Deleted {current.key}
      </Toast>
    </div>
  );
}
