// Delete a git connection (frame 1f): names the projects whose mirrors pause.
import type { GitConnection } from '@zamu/contracts';
import { useState } from 'react';
import { Banner, Button, Dialog, DialogBody, DialogFooter, DialogHeader, Modal } from '~/ui';
import { errorMessage } from '../settings/result';
import { deleteSentence } from './format';

/** Filled danger look for the confirming button of an irreversible action. */
export const filledDanger =
  'h-8 border-danger bg-danger px-3 text-accent-ink hover:border-danger hover:bg-danger hover:text-accent-ink';

export interface DeleteConnectionDialogProps {
  /** null: closed. */
  connection: GitConnection | null;
  onClose: () => void;
  onDelete: (connection: GitConnection) => Promise<unknown>;
}

export function DeleteConnectionDialog({ connection, onClose, onDelete }: DeleteConnectionDialogProps) {
  return (
    <Modal
      width={480}
      top={170}
      isOpen={connection !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {connection ? <DeleteContent connection={connection} onClose={onClose} onDelete={onDelete} /> : null}
    </Modal>
  );
}

function DeleteContent({
  connection,
  onClose,
  onDelete,
}: {
  connection: GitConnection;
  onClose: () => void;
  onDelete: DeleteConnectionDialogProps['onDelete'];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projects = connection.usedBy;

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onDelete(connection);
      onClose();
    } catch (failure) {
      setPending(false);
      setError(errorMessage(failure));
    }
  };

  return (
    <Dialog role="alertdialog">
      <DialogHeader title={`Delete ${connection.name}?`} showEsc={false} />
      <DialogBody className="gap-3">
        {error ? <Banner>{error}</Banner> : null}
        <p className="m-0 leading-normal">{deleteSentence(projects.length)}</p>
        {projects.length ? (
          <ul
            aria-label="Projects that pause"
            className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0"
          >
            {projects.map((project) => (
              <li key={project.key} className="flex items-center gap-1 text-sm text-fg-2">
                <ProjectKeyChip projectKey={project.key} />
                {project.name}
              </li>
            ))}
          </ul>
        ) : null}
        <span className="text-xs text-fg-2">
          Revoke the token at {connection.host} too if nothing else uses it.
        </span>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={onClose}>
          Keep
        </Button>
        <Button
          variant="destructive"
          className={filledDanger}
          isPending={pending}
          onPress={() => void confirm()}
        >
          Delete connection
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** Project key in a hairline box (.cn-key). */
export function ProjectKeyChip({ projectKey }: { projectKey: string }) {
  return (
    <span className="box-border inline-flex h-4.5 items-center rounded-sm border border-line px-1.25 font-medium tabular-nums text-xs text-fg">
      {projectKey}
    </span>
  );
}
