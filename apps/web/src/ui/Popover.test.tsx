import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { PickerMenu, Popover, Tab, TabList, TabPanel, Tabs } from '~/ui';

function Harness({ inPanel }: { inPanel: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const picker = (
    <Popover triggerRef={ref} isOpen>
      <PickerMenu
        aria-label="Status"
        items={[
          { id: 'a', label: 'Todo' },
          { id: 'b', label: 'Done' },
        ]}
      />
    </Popover>
  );
  return (
    <Tabs>
      <TabList aria-label="t">
        <Tab id="x">X</Tab>
        <Tab id="y">Y</Tab>
      </TabList>
      <TabPanel id="x">
        <button ref={ref} type="button">
          anchor
        </button>
        {inPanel ? picker : null}
      </TabPanel>
      {inPanel ? null : picker}
    </Tabs>
  );
}

// React Aria renders a <Tabs> subtree once more in a detached template to build its collection; a
// picker there must not throw (Home's header holds the Filter menu between the tab list and the panel).
describe('Popover inside Tabs', () => {
  it('renders a picker inside a tab panel', () => {
    render(<Harness inPanel />);
    expect(screen.getByText('Todo')).toBeTruthy();
  });
  it('renders a picker next to the tab list, outside any panel', () => {
    render(<Harness inPanel={false} />);
    expect(screen.getByText('Todo')).toBeTruthy();
  });
});
