import { createContext, Fragment, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Dialog, DialogHeader, Kbd, Modal } from '~/ui';
import { SHORTCUT_GROUPS, SHORTCUT_NOTES, type ShortcutRow } from './shortcut-list';

// The keyboard shortcut list: ? anywhere, Keyboard shortcuts in the person menu and the palette.

interface ShortcutsState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const ShortcutsContext = createContext<ShortcutsState | null>(null);

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return (
    <ShortcutsContext.Provider value={value}>
      {children}
      <ShortcutsDialog isOpen={isOpen} onClose={close} />
    </ShortcutsContext.Provider>
  );
}

export function useShortcuts(): ShortcutsState {
  const value = useContext(ShortcutsContext);
  if (!value) throw new Error('useShortcuts must be used inside ShortcutsProvider');
  return value;
}

const JOIN_TEXT: Record<NonNullable<ShortcutRow['join']>, string> = { seq: 'then', or: '/', to: '–' };

function Keys({ row }: { row: ShortcutRow }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-fg-3">
      {row.keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 ? <span>{JOIN_TEXT[row.join ?? 'or']}</span> : null}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      width={760}
      top={40}
      className="max-h-[calc(100dvh-80px)]"
    >
      <Dialog aria-label="Keyboard shortcuts">
        <DialogHeader title="Keyboard shortcuts" className="pb-1" />
        <div className="min-h-0 overflow-auto px-4 pt-2 pb-4">
          <p className="m-0 mb-3 text-sm text-fg-3">On Windows and Linux, ⌘ is Ctrl.</p>
          <div className="columns-2 gap-8">
            {SHORTCUT_GROUPS.map((group) => (
              <section
                key={group.id}
                aria-labelledby={`shortcuts-${group.id}`}
                className="mb-4 break-inside-avoid"
              >
                <h3 id={`shortcuts-${group.id}`} className="m-0 mb-1 text-xs font-medium text-fg-3">
                  {group.title}
                </h3>
                <dl className="m-0 flex flex-col">
                  {group.rows.map((row) => (
                    <div
                      key={`${row.keys.join('')}-${row.action}`}
                      className="flex min-h-7.5 items-center gap-3 border-b border-line-soft text-sm last:border-b-0"
                    >
                      <dt className="min-w-0 flex-1 text-fg">{row.action}</dt>
                      <dd className="m-0">
                        <Keys row={row} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          {SHORTCUT_NOTES.map((note) => (
            <p key={note} className="m-0 mt-1 text-xs text-fg-3">
              {note}
            </p>
          ))}
        </div>
      </Dialog>
    </Modal>
  );
}

/** Shortcut list state, or null outside the shell. */
export function useOptionalShortcuts(): ShortcutsState | null {
  return useContext(ShortcutsContext);
}
