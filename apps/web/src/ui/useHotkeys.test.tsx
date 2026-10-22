import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type HotkeyMap, matchesHotkey, parseHotkey, type UseHotkeysOptions, useHotkeys } from './useHotkeys';

function Harness({ map, options }: { map: HotkeyMap; options?: UseHotkeysOptions }) {
  useHotkeys(map, options);
  return (
    <div>
      <button type="button">Plain button</button>
      <input aria-label="Title" />
      <textarea aria-label="Description" />
      <input type="checkbox" aria-label="Create more" />
      <div contentEditable suppressContentEditableWarning data-testid="editor" />
      <div role="dialog" aria-label="Quick create">
        <button type="button">Inside dialog</button>
      </div>
    </div>
  );
}

function Both({ page, dialog }: { page: () => void; dialog: () => void }) {
  useHotkeys({ i: page });
  useHotkeys({ i: dialog }, { allowInOverlays: true });
  return (
    <div role="dialog" aria-label="Quick create">
      <button type="button">Inside dialog</button>
    </div>
  );
}

describe('useHotkeys', () => {
  it('fires plain keys when focus is not in a text field', async () => {
    const user = userEvent.setup();
    const c = vi.fn();
    const slash = vi.fn();
    render(<Harness map={{ c, '/': slash }} />);
    await user.keyboard('c/');
    expect(c).toHaveBeenCalledTimes(1);
    expect(slash).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Plain button' }));
    await user.keyboard('c');
    expect(c).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('checkbox', { name: 'Create more' }));
    await user.keyboard('c');
    expect(c).toHaveBeenCalledTimes(3);
  });

  it('ignores plain keys typed into inputs, textareas and editable elements', async () => {
    const user = userEvent.setup();
    const handlers = {
      c: vi.fn(),
      p: vi.fn(),
      j: vi.fn(),
      k: vi.fn(),
      i: vi.fn(),
      '/': vi.fn(),
      Enter: vi.fn(),
      Esc: vi.fn(),
    };
    render(<Harness map={handlers} />);

    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    await user.keyboard('cpjki/{Enter}{Escape}');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('cpjki/');

    await user.click(screen.getByRole('textbox', { name: 'Description' }));
    await user.keyboard('cp{Enter}');

    await user.click(screen.getByTestId('editor'));
    await user.keyboard('c');

    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });

  it('fires Mod+Enter inside a text field', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Harness map={{ 'Mod+Enter': submit }} />);
    await user.click(screen.getByRole('textbox', { name: 'Description' }));
    // jsdom is not an Apple platform, so Mod is Ctrl.
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(submit).toHaveBeenCalledTimes(1);
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('can opt a plain key into inputs', async () => {
    const user = userEvent.setup();
    const esc = vi.fn();
    render(<Harness map={{ Escape: { handler: esc, allowInInputs: true } }} />);
    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    await user.keyboard('{Escape}');
    expect(esc).toHaveBeenCalledTimes(1);
  });

  it('does not treat Shift+C or Ctrl+C as C', async () => {
    const user = userEvent.setup();
    const c = vi.fn();
    render(<Harness map={{ c }} />);
    await user.keyboard('{Shift>}c{/Shift}{Control>}c{/Control}');
    expect(c).not.toHaveBeenCalled();
  });

  it('skips page bindings inside dialogs unless allowed', async () => {
    const user = userEvent.setup();
    const page = vi.fn();
    const dialog = vi.fn();
    render(<Both page={page} dialog={dialog} />);
    await user.click(screen.getByRole('button', { name: 'Inside dialog' }));
    await user.keyboard('i');
    expect(page).not.toHaveBeenCalled();
    expect(dialog).toHaveBeenCalledTimes(1);
  });

  it('stops listening when disabled or unmounted', async () => {
    const user = userEvent.setup();
    const c = vi.fn();
    const { rerender, unmount } = render(<Harness map={{ c }} options={{ enabled: false }} />);
    await user.keyboard('c');
    expect(c).not.toHaveBeenCalled();
    rerender(<Harness map={{ c }} />);
    await user.keyboard('c');
    expect(c).toHaveBeenCalledTimes(1);
    unmount();
    await user.keyboard('c');
    expect(c).toHaveBeenCalledTimes(1);
  });
});

describe('parseHotkey and matchesHotkey', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

  it('maps Mod to Meta on Apple platforms and Ctrl elsewhere', () => {
    const hotkey = parseHotkey('Mod+Enter');
    expect(matchesHotkey(key({ key: 'Enter', metaKey: true }), hotkey, true)).toBe(true);
    expect(matchesHotkey(key({ key: 'Enter', ctrlKey: true }), hotkey, true)).toBe(false);
    expect(matchesHotkey(key({ key: 'Enter', ctrlKey: true }), hotkey, false)).toBe(true);
  });

  it('accepts Esc as an alias and ignores Shift for symbols', () => {
    expect(matchesHotkey(key({ key: 'Escape' }), parseHotkey('Esc'), false)).toBe(true);
    expect(matchesHotkey(key({ key: '?', shiftKey: true }), parseHotkey('?'), false)).toBe(true);
    expect(matchesHotkey(key({ key: 'C', shiftKey: true }), parseHotkey('Shift+C'), false)).toBe(true);
  });
});
