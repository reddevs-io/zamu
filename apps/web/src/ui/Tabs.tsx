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
  return <AriaTabList {...props} className={composeTw(props.className, 'flex items-center gap-0.5')} />;
}

export interface TabProps extends Omit<AriaTabProps, 'children'> {
  children: ReactNode;
  /** Count after the label in --fg-3: "Mine 7". */
  count?: number;
}

/** Margin tab (screens.css .tab): 30px pill, --fg-2; the selected tab sits on --bg-lane in --fg. */
export function Tab({ children, count, ...props }: TabProps) {
  return (
    <AriaTab
      {...props}
      className={composeTw(props.className, ({ isSelected }) =>
        cn(
          'flex h-7.5 cursor-pointer items-center gap-1.5 rounded-md px-2.75 text-sm font-medium outline-none focus-visible:shadow-[var(--focus-ring)]',
          isSelected ? 'bg-bg-lane text-fg' : 'text-fg-2 hover:text-fg',
        ),
      )}
    >
      {children}
      {count != null ? <span className="text-xs font-normal text-fg-3 tabular-nums">{count}</span> : null}
    </AriaTab>
  );
}

export function TabPanel(props: TabPanelProps) {
  return <AriaTabPanel {...props} className={composeTw(props.className, 'min-h-0 flex-1 outline-none')} />;
}
