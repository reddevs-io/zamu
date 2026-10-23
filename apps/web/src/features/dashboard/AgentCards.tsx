import type { DashboardAgent, StalledItem } from '@pm/contracts';
import { Avatar, cn, StatusSquare, WarnPill } from '~/ui';
import { agentStalledText, sinceText } from './model';
import { SectionHeader } from './ProjectTable';

// The agents in scope (Mine: mine; Everyone: all), stalled first. Each card names the agent and who it
// works for, its current task (+N other tasks in progress) or Idle, and when it last did something.

export interface AgentCardsProps {
  agents: readonly DashboardAgent[];
  /** The stalled group's items, for the silence on "Stalled 26h". */
  stalled: readonly StalledItem[];
  /** "Yours · Everyone shows all 4" or "Everyone". */
  note: string;
  /** Two columns while the panel is open. */
  narrow: boolean;
  now: number | null;
  onOpenTask: (key: string) => void;
}

export function AgentCards({ agents, stalled, note, narrow, now, onOpenTask }: AgentCardsProps) {
  return (
    <section aria-labelledby="dashboard-agents" data-section="agents">
      <SectionHeader id="dashboard-agents" title="Agents" count={agents.length}>
        {note}
      </SectionHeader>
      <ul
        className={cn(
          'm-0 grid list-none border-t border-l border-line p-0',
          narrow ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]',
        )}
      >
        {agents.map((entry) => {
          const { agent, currentTask } = entry;
          const pill = agentStalledText(entry, stalled, now);
          const others = entry.inProgressCount - 1;
          return (
            <li
              key={agent.id}
              data-agent={agent.name}
              className="flex min-w-0 flex-col gap-[7px] border-r border-b border-line px-3 pt-2.5 pb-[11px]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={agent.name} kind="agent" decorative />
                <b className="truncate font-semibold">{agent.name}</b>
                {agent.responsible ? (
                  <span className="truncate text-[11.5px] text-muted">for {agent.responsible.name}</span>
                ) : null}
              </div>
              {currentTask ? (
                <button
                  type="button"
                  onClick={() => onOpenTask(currentTask.key)}
                  className="flex min-w-0 cursor-pointer items-baseline gap-1.5 text-left text-[12.5px] outline-none hover:text-accent focus-visible:focus-ring"
                >
                  <StatusSquare status={currentTask.status} className="self-center" />
                  <span className="shrink-0 font-mono text-[10.5px] whitespace-nowrap text-muted">
                    {currentTask.key}
                  </span>
                  <span className="min-w-0 truncate">{currentTask.title}</span>
                  {others > 0 ? (
                    <span
                      className="shrink-0 font-mono text-[10.5px] text-muted"
                      title={`${others} more in progress`}
                    >
                      +{others}
                    </span>
                  ) : null}
                </button>
              ) : (
                <div className="text-[12px] text-faint">Idle · nothing in progress</div>
              )}
              <div className="flex items-center gap-2 text-[11px] text-faint">
                {pill ? <WarnPill>{pill}</WarnPill> : null}
                <span>
                  {entry.lastActivityAt
                    ? now != null
                      ? `Last activity ${sinceText(entry.lastActivityAt, now)}`
                      : ''
                    : 'No activity yet'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
