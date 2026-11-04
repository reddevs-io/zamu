import { useEffect, useId, useSyncExternalStore } from 'react';
import { Toast, useHotkeys } from '~/ui';

// The toast after a field change: "Moved PAY-142 to In review · Undo ⌘Z". One at a time; a new one
// replaces the last. Screens mount <TaskFieldToast /> (useTaskFieldKeys's `pickers` includes one);
// when several are mounted, only the first draws it, so the toast shows once.

export interface FieldToastState {
  id: number;
  text: string;
  /** Puts the change back. Bound to ⌘Z while the toast shows. */
  undo?: () => void;
  tone?: 'default' | 'error';
}

let current: FieldToastState | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const hosts: string[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows a toast; returns its id. */
export function showFieldToast(toast: Omit<FieldToastState, 'id'>): number {
  current = { ...toast, id: nextId++ };
  emit();
  return current.id;
}

/** Hides the toast (only `id`'s, when given). */
export function dismissFieldToast(id?: number) {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  emit();
}

export function useFieldToast(): FieldToastState | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/** Test helper. */
export function resetFieldToastForTests() {
  current = null;
  hosts.length = 0;
  emit();
}

/** How long a toast stays: longer for errors, so they can be read. */
const TIMEOUT_MS = { default: 6000, error: 9000 };

/** Draws the current field toast at the bottom of the window, and binds ⌘Z to its Undo. */
export function TaskFieldToast() {
  const id = useId();
  const toast = useFieldToast();
  const isHost = useSyncExternalStore(
    subscribe,
    () => hosts[0] === id,
    () => false,
  );
  useEffect(() => {
    hosts.push(id);
    emit();
    return () => {
      hosts.splice(hosts.indexOf(id), 1);
      emit();
    };
  }, [id]);
  const undo = toast?.undo;
  useHotkeys(
    {
      // In a text field ⌘Z undoes typing, as usual.
      'Mod+z': undo ? { handler: () => runUndo(undo), allowInInputs: false } : null,
    },
    { enabled: isHost && undo != null },
  );
  if (!isHost || !toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5.5 z-50 flex justify-center">
      <Toast
        key={toast.id}
        className="pointer-events-auto"
        timeout={TIMEOUT_MS[toast.tone ?? 'default']}
        onDismiss={() => dismissFieldToast(toast.id)}
        {...(undo ? { action: { label: 'Undo', onAction: () => runUndo(undo) }, kbd: '⌘Z' } : {})}
      >
        {toast.text}
      </Toast>
    </div>
  );
}

function runUndo(undo: () => void) {
  dismissFieldToast();
  undo();
}
