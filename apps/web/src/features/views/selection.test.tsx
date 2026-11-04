import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCurrentTaskSelection, useTaskSelection } from './selection';

const KEYS = ['HBR-1', 'HBR-2', 'HBR-3', 'HBR-4', 'HBR-5', 'HBR-6'];

/** A list that draws focus and selection, plus the action bar reading the published selection. */
function List({ keys = KEYS, onEscapeEmpty }: { keys?: string[]; onEscapeEmpty?: () => void }) {
  const selection = useTaskSelection(keys, { view: 'List', ...(onEscapeEmpty ? { onEscapeEmpty } : {}) });
  return (
    <div>
      <input aria-label="Search" />
      <ul>
        {keys.map((key) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keys come from useTaskSelection
          <li
            key={key}
            data-testid={key}
            data-focused={selection.focusedKey === key || undefined}
            data-selected={selection.isSelected(key) || undefined}
            onClick={(event) => selection.handleClick(key, event)}
          >
            {key}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionBar() {
  const current = useCurrentTaskSelection();
  return (
    <output data-testid="bar">
      {current.view}:{current.selectedKeys.join(',')}|{current.focusedKey ?? '-'}|
      {current.targetKeys.join(',')}
    </output>
  );
}

let setKeys: (keys: string[]) => void = () => {};

/** A list whose tasks the test changes. */
function Changing() {
  const [keys, set] = useState(KEYS);
  setKeys = set;
  return (
    <>
      <List keys={keys} />
      <ActionBar />
    </>
  );
}

const focused = () => KEYS.filter((key) => screen.getByTestId(key).hasAttribute('data-focused'));
const selected = () => KEYS.filter((key) => screen.getByTestId(key).hasAttribute('data-selected'));

describe('useTaskSelection', () => {
  it('moves the focus with J / K and the arrows, without selecting', async () => {
    const user = userEvent.setup();
    render(<List />);
    await user.keyboard('j');
    expect(focused()).toEqual(['HBR-1']);
    await user.keyboard('jj{ArrowDown}');
    expect(focused()).toEqual(['HBR-4']);
    await user.keyboard('k{ArrowUp}');
    expect(focused()).toEqual(['HBR-2']);
    await user.keyboard('kkk');
    expect(focused()).toEqual(['HBR-1']);
    expect(selected()).toEqual([]);
  });

  it('toggles with X and publishes the selection', async () => {
    const user = userEvent.setup();
    render(
      <>
        <List />
        <ActionBar />
      </>,
    );
    await user.keyboard('j');
    expect(screen.getByTestId('bar')).toHaveTextContent('List:|HBR-1|HBR-1');
    await user.keyboard('xjjx');
    expect(selected()).toEqual(['HBR-1', 'HBR-3']);
    expect(screen.getByTestId('bar')).toHaveTextContent('List:HBR-1,HBR-3|HBR-3|HBR-1,HBR-3');
    await user.keyboard('x');
    expect(selected()).toEqual(['HBR-1']);
  });

  it('selects a range with Shift+click and toggles with ⌘/Ctrl+click', async () => {
    const user = userEvent.setup();
    render(<List />);
    await user.click(screen.getByTestId('HBR-2'));
    expect(focused()).toEqual(['HBR-2']);
    expect(selected()).toEqual([]);
    await user.keyboard('{Shift>}');
    await user.click(screen.getByTestId('HBR-5'));
    await user.keyboard('{/Shift}');
    expect(selected()).toEqual(['HBR-2', 'HBR-3', 'HBR-4', 'HBR-5']);
    // A second Shift+click moves the end of the same range.
    await user.keyboard('{Shift>}');
    await user.click(screen.getByTestId('HBR-3'));
    await user.keyboard('{/Shift}');
    expect(selected()).toEqual(['HBR-2', 'HBR-3']);
    await user.keyboard('{Control>}');
    await user.click(screen.getByTestId('HBR-6'));
    await user.keyboard('{/Control}');
    expect(selected()).toEqual(['HBR-2', 'HBR-3', 'HBR-6']);
  });

  it('extends with Shift+↓ / Shift+↑ from the focused task', async () => {
    const user = userEvent.setup();
    render(<List />);
    await user.keyboard('jj{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    expect(selected()).toEqual(['HBR-2', 'HBR-3', 'HBR-4']);
    expect(focused()).toEqual(['HBR-4']);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(selected()).toEqual(['HBR-2', 'HBR-3']);
    // A new run after moving adds to what is selected.
    await user.keyboard('jjj{Shift>}{ArrowDown}{/Shift}');
    expect(selected()).toEqual(['HBR-2', 'HBR-3', 'HBR-6']);
  });

  it('selects everything with ⌘A, but not while typing', async () => {
    const user = userEvent.setup();
    render(<List />);
    await user.click(screen.getByRole('textbox', { name: 'Search' }));
    await user.keyboard('{Control>}a{/Control}x');
    expect(selected()).toEqual([]);
    await user.click(screen.getByTestId('HBR-1'));
    await user.keyboard('{Control>}a{/Control}');
    expect(selected()).toEqual(KEYS);
  });

  it('clears on Esc, then drops the focus, then leaves', async () => {
    const user = userEvent.setup();
    const onEscapeEmpty = vi.fn();
    render(<List onEscapeEmpty={onEscapeEmpty} />);
    await user.keyboard('jxjx');
    expect(selected()).toEqual(['HBR-1', 'HBR-2']);
    await user.keyboard('{Escape}');
    expect(selected()).toEqual([]);
    expect(focused()).toEqual(['HBR-2']);
    await user.keyboard('{Escape}');
    expect(focused()).toEqual([]);
    expect(onEscapeEmpty).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onEscapeEmpty).toHaveBeenCalledTimes(1);
  });

  it('ignores single keys in text fields', async () => {
    const user = userEvent.setup();
    render(<List />);
    await user.click(screen.getByRole('textbox', { name: 'Search' }));
    await user.keyboard('jx');
    expect(focused()).toEqual([]);
    expect(selected()).toEqual([]);
  });

  it('drops tasks that leave the view', async () => {
    const user = userEvent.setup();
    render(<Changing />);
    await user.keyboard('{Control>}a{/Control}');
    act(() => setKeys(['HBR-1', 'HBR-2']));
    expect(screen.getByTestId('bar')).toHaveTextContent('List:HBR-1,HBR-2|');
  });
});
