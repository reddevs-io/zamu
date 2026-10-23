import type { BacklogMappingsView, Member, Priority, TaskStatus } from '@pm/contracts';
import type { ReactNode } from 'react';
import { MappingRow, MappingTable } from '~/ui';
import { NO_ONE, setAssignee, setPriority, setStatus } from './mappings';
import { assigneeOptions, PRIORITY_OPTIONS, STATUS_OPTIONS } from './options';
import { Question, SectionCaption } from './parts';

// Step 3 (frames 3i to 3k) and Edit mappings: one table per kind, prefilled by name. Long lists make the
// step body scroll.

export interface MappingsEditorProps {
  view: BacklogMappingsView;
  onChange: (view: BacklogMappingsView) => void;
  members: readonly Pick<Member, 'id' | 'name' | 'kind'>[];
  isDisabled?: boolean;
  /** Line on the right of the question. */
  aside?: ReactNode;
  title?: string;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-line bg-surface px-3 py-2.5 text-[12px] text-muted">{children}</div>;
}

export function MappingsEditor({
  view,
  onChange,
  members,
  isDisabled,
  aside = 'Prefilled by name. You can change them later.',
  title = 'Match Backlog.md values to this app',
}: MappingsEditorProps) {
  const people = assigneeOptions(members);
  return (
    <>
      <Question aside={aside}>{title}</Question>
      <section className="flex flex-col gap-2" aria-label="Status">
        <SectionCaption label="Status" count={view.status.length} hint="Drafts always come in as Backlog." />
        {view.status.length ? (
          <MappingTable aria-label="Status mapping">
            {view.status.map((row) => (
              <MappingRow
                key={row.from}
                from={row.from}
                items={STATUS_OPTIONS}
                value={row.to}
                how={row.how}
                count={row.count}
                isDisabled={isDisabled}
                onChange={(value) => onChange(setStatus(view, row.from, value as TaskStatus))}
              />
            ))}
          </MappingTable>
        ) : (
          <Empty>No statuses in the files.</Empty>
        )}
      </section>
      <div className="grid grid-cols-2 items-start gap-2.5">
        <section className="flex min-w-0 flex-col gap-2" aria-label="Priority">
          <SectionCaption label="Priority" count={view.priority.length} />
          {view.priority.length ? (
            <MappingTable aria-label="Priority mapping" columns={null} selectWidth={150} countWidth={40}>
              {view.priority.map((row) => (
                <MappingRow
                  key={row.from}
                  from={row.from}
                  items={PRIORITY_OPTIONS}
                  value={row.to}
                  how={row.how}
                  showHow={false}
                  count={row.count}
                  isDisabled={isDisabled}
                  onChange={(value) => onChange(setPriority(view, row.from, value as Priority))}
                />
              ))}
            </MappingTable>
          ) : (
            <Empty>No priorities in the files. Tasks come in with no priority.</Empty>
          )}
        </section>
        <section className="flex min-w-0 flex-col gap-2" aria-label="Assignees">
          <SectionCaption
            label="Assignees"
            count={view.assignee.length}
            hint="The first match on a task becomes its assignee."
          />
          {view.assignee.length ? (
            <MappingTable aria-label="Assignee mapping" columns={null} selectWidth={170} countWidth={36}>
              {view.assignee.map((row) => (
                <MappingRow
                  key={row.from}
                  from={row.from}
                  items={people}
                  value={row.userId ?? NO_ONE}
                  how={row.how}
                  showHow={false}
                  count={row.count}
                  isDisabled={isDisabled}
                  onChange={(value) =>
                    onChange(setAssignee(view, row.from, value === NO_ONE ? null : String(value)))
                  }
                />
              ))}
            </MappingTable>
          ) : (
            <Empty>No assignees in the files. Tasks come in unassigned.</Empty>
          )}
        </section>
      </div>
    </>
  );
}
