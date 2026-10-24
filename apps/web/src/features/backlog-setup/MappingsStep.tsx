import type { BacklogMappingsView, Member, Priority, TaskStatus } from '@pm/contracts';
import type { ReactNode } from 'react';
import { Avatar, Button, MappingRow, MappingTable } from '~/ui';
import { type AgentSuggestion, agentDraftFor, agentSuggestions } from './agent-suggestions';
import { CREATE_AGENT, NO_ONE, setAssignee, setPriority, setStatus } from './mappings';
import { assigneeOptions, createAgentOption, PRIORITY_OPTIONS, STATUS_OPTIONS } from './options';
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
  /**
   * Opens Add agent for an unmatched assignee. When set, agent-looking values get a suggestion under
   * the table and every unmatched row gets "Create agent…" in its select.
   */
  onCreateAgent?: (draft: AgentSuggestion) => void;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-line bg-surface px-3 py-2.5 text-[12px] text-muted">{children}</div>;
}

/** Frame 1a of the agent suggestion design: one line per agent-looking value with no member. */
function AgentSuggestions({
  suggestions,
  isDisabled,
  onCreate,
}: {
  suggestions: readonly AgentSuggestion[];
  isDisabled?: boolean;
  onCreate: (draft: AgentSuggestion) => void;
}) {
  const many = suggestions.length > 1;
  return (
    <section aria-label="Agent suggestions" className="flex flex-col border border-line bg-surface">
      <p className="m-0 px-3 pt-2 pb-1.5 text-[12px] text-muted">
        {many
          ? 'These look like coding agents. No member matches them yet.'
          : 'This looks like a coding agent. No member matches it yet.'}
      </p>
      {suggestions.map((suggestion) => (
        <div
          key={suggestion.name}
          className="flex min-h-10 items-center gap-2.5 border-t border-line-2 px-3 text-[12px] text-muted"
        >
          <Avatar name={suggestion.name} kind="agent" pending decorative />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg">
            {suggestion.from.join(', ')}
          </span>
          <Button variant="secondary" size="sm" isDisabled={isDisabled} onPress={() => onCreate(suggestion)}>
            Create agent {suggestion.name}
          </Button>
        </div>
      ))}
    </section>
  );
}

export function MappingsEditor({
  view,
  onChange,
  members,
  isDisabled,
  aside = 'Prefilled by name. You can change them later.',
  title = 'Match Backlog.md values to this app',
  onCreateAgent,
}: MappingsEditorProps) {
  const people = assigneeOptions(members);
  const suggestions = onCreateAgent ? agentSuggestions(view, members) : [];
  // A suggested name covers every row that spells it (@claude and @Claude-Code are two rows).
  const draftFor = (from: string) => suggestions.find((s) => s.from.includes(from)) ?? agentDraftFor(from);
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
              {view.assignee.map((row) => {
                const draft = onCreateAgent && !row.userId ? draftFor(row.from) : null;
                return (
                  <MappingRow
                    key={row.from}
                    from={row.from}
                    items={draft ? [createAgentOption(draft.name), ...people] : people}
                    value={row.userId ?? NO_ONE}
                    how={row.how}
                    showHow={false}
                    count={row.count}
                    isDisabled={isDisabled}
                    onChange={(value) => {
                      if (value === CREATE_AGENT) {
                        if (draft) onCreateAgent?.(draft);
                        return;
                      }
                      onChange(setAssignee(view, row.from, value === NO_ONE ? null : String(value)));
                    }}
                  />
                );
              })}
            </MappingTable>
          ) : (
            <Empty>No assignees in the files. Tasks come in unassigned.</Empty>
          )}
          {suggestions.length && onCreateAgent ? (
            <AgentSuggestions suggestions={suggestions} isDisabled={isDisabled} onCreate={onCreateAgent} />
          ) : null}
        </section>
      </div>
    </>
  );
}
