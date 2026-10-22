import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTrigger, Modal } from './Dialog';
import { TextField } from './TextField';
import { useHotkeys } from './useHotkeys';

function Example({ onPageHotkey }: { onPageHotkey?: () => void }) {
  useHotkeys({ c: () => onPageHotkey?.() });
  return (
    <>
      <Button variant="secondary">Before</Button>
      <DialogTrigger>
        <Button>Add agent</Button>
        <Modal>
          <Dialog>
            {({ close }) => (
              <>
                <DialogHeader title="Add agent" />
                <DialogBody>
                  <TextField label="Name" autoFocus />
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button onPress={close}>Create agent</Button>
                </DialogFooter>
              </>
            )}
          </Dialog>
        </Modal>
      </DialogTrigger>
    </>
  );
}

describe('Dialog', () => {
  it('is labelled by its header and focuses the first field', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Add agent' }));
    const dialog = screen.getByRole('dialog', { name: 'Add agent' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('traps focus: Tab and Shift+Tab cycle inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Add agent' }));
    const dialog = screen.getByRole('dialog');

    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('closes on Esc and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Add agent' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps page shortcuts quiet while it is open', async () => {
    const user = userEvent.setup();
    const onPageHotkey = vi.fn();
    render(<Example onPageHotkey={onPageHotkey} />);
    await user.click(screen.getByRole('button', { name: 'Add agent' }));
    await user.tab(); // leave the text field: focus is on a dialog button
    await user.keyboard('c');
    expect(onPageHotkey).not.toHaveBeenCalled();
  });
});
