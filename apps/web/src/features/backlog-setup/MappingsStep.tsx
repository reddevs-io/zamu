import type { BacklogMappingsView, Priority, TaskStatus } from '@pm/contracts';
import type { ReactNode } from 'react';
import { Avatar, Button, cn, initialsFor, MappingRow, MappingTable } from '~/ui';
import {
  type AgentSuggestion,
  agentDraftFor,
  agentSuggestions,
  assignAgent,
  type SuggestionMember,
  similarAgents,
} from './agent-suggestions';
import { type InviteDraft, inviteSuggestions, type NameMatch, nameMatches } from './assignee-hints';
import { CREATE_AGENT, NO_ONE, setAssignee, setPriority, setStatus } from './mappings';
import {
  assigneeOptions,
  createAgentOption,
  memberOption,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
} from './options';
import { Question, SectionCaption } from './parts';

// Step 3 (frames 3i to 3k) and Edit mappings: one table per kind, prefilled by name. Long lists make the
// step body scroll. A note under the Assignees table helps with the "No one" rows: a member that
// matches by name, an agent to create or a similar one to map to, a person to invite.

export interface MappingsEditorProps {
  view: BacklogMappingsView;
  onChange: (view: BacklogMappingsView) => void;
  /** Workspace members. Emails feed the name match; joinedAt orders similar agents. */
  members: readonly SuggestionMember[];
  isDisabled?: boolean;
  /** Line on the right of the question. */
  aside?: ReactNode;
  title?: string;
  /**
   * Opens Add agent for an unmatched assignee. When set, agent-looking values get a suggestion under
   * the table (with agents of a similar name to map to) and every unmatched row gets "Create agent…"
   * in its select.
   */
  onCreateAgent?: (draft: AgentSuggestion) => void;
  /** Opens Invite person for an unmatched value that doesn't look like an agent. */
  onInvite?: (draft: InviteDraft) => void;
  /** Invitations created on this screen: assignee value to the invited email. */
  invited?: Readonly<Record<string, string>>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-line bg-surface px-3 py-2.5 text-[12px] text-muted">{children}</div>;
}

const Value = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[11px] text-fg">{children}</span>
);

/** "a", "a or b", "a, b or c". */
function orList(names: readonly string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : (names[0] ?? '');
}

/** A person who isn't a member yet: dashed circle, as the dashed agent square of a suggestion. */
function PendingPerson({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      data-kind="person"
      data-pending
      className="grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-muted text-[8.5px] font-semibold text-muted"
    >
      {initialsFor(name.replace(/^@+/, ''), 'person')}
    </span>
  );
}

/** One line of the note: avatar, text, buttons. Buttons wrap under the text when space runs out. */
function NoteLine({ avatar, text, children }: { avatar: ReactNode; text: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-line-2 px-3 py-1.5 text-[12px] text-muted first:border-t-0">
      {avatar}
      <span className="min-w-0 flex-[1_1_13rem] [overflow-wrap:anywhere]">{text}</span>
      {children ? <span className="ml-auto flex flex-wrap justify-end gap-1.5">{children}</span> : null}
    </li>
  );
}

function NoteHeader({ children }: { children: ReactNode }) {
  return <p className="m-0 px-3 pt-2 pb-1.5 text-[12px] text-muted">{children}</p>;
}

/** The lines of one group; under a header they start with a rule. */
function NoteLines({ ruled, children }: { ruled?: boolean; children: ReactNode }) {
  return <ul className={cn('m-0 list-none p-0', ruled && 'border-t border-line-2')}>{children}</ul>;
}

/** "No one" rows that a member now matches by name (members added after setup). */
function NameMatchLines({
  matches,
  isDisabled,
  onMap,
}: {
  matches: readonly NameMatch[];
  isDisabled?: boolean;
  onMap: (match: NameMatch) => void;
}) {
  return (
    <section aria-label="Name matches" className="flex flex-col">
      <NoteLines>
        {matches.map((match) => (
          <NoteLine
            key={match.from}
            avatar={<Avatar name={match.member.name} kind={match.member.kind} decorative />}
            text={
              <>
                <Value>{match.from}</Value> may be <span className="text-fg">{match.member.name}</span>.
              </>
            }
          >
            <Button variant="secondary" size="sm" isDisabled={isDisabled} onPress={() => onMap(match)}>
              Map to {match.member.name}
            </Button>
          </NoteLine>
        ))}
      </NoteLines>
    </section>
  );
}

/**
 * Frame 1a of the agent suggestion design: one line per agent-looking value with no member, with
 * the agents of a similar name to map to before "Create agent".
 */
function AgentSuggestions({
  suggestions,
  members,
  isDisabled,
  onCreate,
  onMap,
}: {
  suggestions: readonly AgentSuggestion[];
  members: readonly SuggestionMember[];
  isDisabled?: boolean;
  onCreate: (draft: AgentSuggestion) => void;
  onMap: (draft: AgentSuggestion, agent: SuggestionMember) => void;
}) {
  const many = suggestions.length > 1;
  return (
    <section aria-label="Agent suggestions" className="flex flex-col">
      <NoteHeader>
        {many
          ? 'These look like coding agents. No member matches them yet.'
          : 'This looks like a coding agent. No member matches it yet.'}
      </NoteHeader>
      <NoteLines ruled>
        {suggestions.map((suggestion) => {
          const similar = similarAgents(suggestion.name, members);
          const values = suggestion.from.join(', ');
          return (
            <NoteLine
              key={suggestion.name}
              avatar={<Avatar name={suggestion.name} kind="agent" pending decorative />}
              text={
                similar.length ? (
                  <>
                    <Value>{values}</Value> may be{' '}
                    <span className="text-fg">{orList(similar.map((agent) => agent.name))}</span>.
                  </>
                ) : (
                  <Value>{values}</Value>
                )
              }
            >
              {similar.map((agent) => (
                <Button
                  key={agent.id}
                  variant="secondary"
                  size="sm"
                  isDisabled={isDisabled}
                  onPress={() => onMap(suggestion, agent)}
                >
                  Map to {agent.name}
                </Button>
              ))}
              <Button
                variant="secondary"
                size="sm"
                isDisabled={isDisabled}
                onPress={() => onCreate(suggestion)}
              >
                Create agent {suggestion.name}
              </Button>
            </NoteLine>
          );
        })}
      </NoteLines>
    </section>
  );
}

/** Values that look like people and match no member: invite them, then map by hand once they join. */
function InviteSuggestions({
  drafts,
  invited,
  isDisabled,
  onInvite,
}: {
  drafts: readonly InviteDraft[];
  invited: Readonly<Record<string, string>>;
  isDisabled?: boolean;
  onInvite: (draft: InviteDraft) => void;
}) {
  return (
    <section aria-label="People to invite" className="flex flex-col">
      <NoteHeader>
        {drafts.length > 1 ? 'No member matches these names yet.' : 'No member matches this name yet.'}
      </NoteHeader>
      <NoteLines ruled>
        {drafts.map((draft) => {
          const email = invited[draft.from];
          return (
            <NoteLine
              key={draft.from}
              avatar={<PendingPerson name={draft.from} />}
              text={
                email ? (
                  <>
                    Invited <span className="text-fg">{email}</span>. Once they join, map{' '}
                    <Value>{draft.from}</Value> in Settings › Backlog.md › Edit mappings.
                  </>
                ) : (
                  <>
                    <Value>{draft.from}</Value> matches no member.
                  </>
                )
              }
            >
              {email ? null : (
                <Button variant="secondary" size="sm" isDisabled={isDisabled} onPress={() => onInvite(draft)}>
                  Invite…
                </Button>
              )}
            </NoteLine>
          );
        })}
      </NoteLines>
    </section>
  );
}

const NO_INVITES: Readonly<Record<string, string>> = {};

export function MappingsEditor({
  view,
  onChange,
  members,
  isDisabled,
  aside = 'Prefilled by name. You can change them later.',
  title = 'Match Backlog.md values to this app',
  onCreateAgent,
  onInvite,
  invited = NO_INVITES,
}: MappingsEditorProps) {
  const people = assigneeOptions(members);
  const matches = nameMatches(view, members);
  const matched = new Set(matches.map((match) => match.from));
  const suggestions = onCreateAgent ? agentSuggestions(view, members, matched) : [];
  const invites = onInvite ? inviteSuggestions(view, matched) : [];
  // A suggested name covers every row that spells it (@claude and @Claude-Code are two rows).
  const draftFor = (from: string) => suggestions.find((s) => s.from.includes(from)) ?? agentDraftFor(from);
  // "Create agent…", then agents of a similar name, then everyone else.
  const rowItems = (draft: AgentSuggestion | null) => {
    if (!draft) return people;
    const similar = similarAgents(draft.name, members);
    const ids = new Set(similar.map((agent) => agent.id));
    return [
      createAgentOption(draft.name),
      ...similar.map(memberOption),
      ...people.filter((option) => !ids.has(String(option.id))),
    ];
  };
  const hasNote = matches.length > 0 || suggestions.length > 0 || invites.length > 0;
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
                    items={rowItems(draft)}
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
          {hasNote ? (
            <div className="flex flex-col border border-line bg-surface [&>section+section]:border-t [&>section+section]:border-line">
              {matches.length ? (
                <NameMatchLines
                  matches={matches}
                  isDisabled={isDisabled}
                  onMap={(match) => onChange(setAssignee(view, match.from, match.member.id))}
                />
              ) : null}
              {suggestions.length && onCreateAgent ? (
                <AgentSuggestions
                  suggestions={suggestions}
                  members={members}
                  isDisabled={isDisabled}
                  onCreate={onCreateAgent}
                  onMap={(draft, agent) => onChange(assignAgent(view, draft.from, agent.id))}
                />
              ) : null}
              {invites.length && onInvite ? (
                <InviteSuggestions
                  drafts={invites}
                  invited={invited}
                  isDisabled={isDisabled}
                  onInvite={onInvite}
                />
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
