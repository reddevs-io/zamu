import type { ReactNode } from 'react';
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  type TabProps as AriaTabProps,
  Tabs as AriaTabs,
  type TabListProps,
  type TabPanelProps,
  type TabsProps,
} from 'react-aria-components';
import { cn, composeTw } from './cn';

export function Tabs(props: TabsProps) {
  return <AriaTabs {...props} className={composeTw(props.className, 'flex min-h-0 flex-col')} />;
}

export function TabList<T extends object>(props: TabListProps<T>) {
  return <AriaTabList {...props} className={composeTw(props.className, 'flex items-center gap-[18px]')} />;
}

export interface TabProps extends Omit<AriaTabProps, 'children'> {
  children: ReactNode;
  /** Count drawn in mono after the label: "All 7". */
  count?: number;
}

/** Text tab, 36px tall; the selected tab is bold with a 2px --fg underline. */
export function Tab({ children, count, ...props }: TabProps) {
  return (
    <AriaTab
      {...props}
      className={composeTw(props.className, ({ isSelected }) =>
        cn(
          'flex h-9 cursor-pointer items-center gap-1.5 outline-none focus-visible:focus-ring-inset',
          isSelected ? 'font-semibold text-fg shadow-[inset_0_-2px_0_var(--fg)]' : 'text-muted hover:text-fg',
        ),
      )}
    >
      {children}
      {count != null ? <span className="font-mono text-[10px] font-normal text-faint">{count}</span> : null}
    </AriaTab>
  );
}

export function TabPanel(props: TabPanelProps) {
  return <AriaTabPanel {...props} className={composeTw(props.className, 'min-h-0 flex-1 outline-none')} />;
}
