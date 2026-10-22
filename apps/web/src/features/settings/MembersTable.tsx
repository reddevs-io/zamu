// Members table: people, pending invitations and agents, with a row menu per row.
import type { Invitation, Member } from '@pm/contracts';
import { useMemo } from 'react';
import {
  Avatar,
  Button,
  type DataColumn,
  DataTable,
  MemberLabel,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Tag,
} from '~/ui';
import { emailInitials, formatAgo, formatExpiry, formatShortDate, plural, ROLE_LABELS } from './format';
import { TimeText } from './TimeText';

export type MemberRow =
  | { type: 'member'; id: string; member: Member; isYou: boolean }
  | { type: 'invitation'; id: string; invitation: Invitation };

/** People first, then pending invitations, then agents; core already sorts members by name. */
export function memberRows(
  members: readonly Member[],
  invitations: readonly Invitation[],
  meId: string | undefined,
): MemberRow[] {
  const toRow = (member: Member): MemberRow => ({
    type: 'member',
    id: member.id,
    member,
    isYou: member.id === meId,
  });
  return [
    ...members.filter((m) => m.kind === 'person').map(toRow),
    ...invitations.map(
      (invitation): MemberRow => ({ type: 'invitation', id: `invitation:${invitation.id}`, invitation }),
    ),
    ...members.filter((m) => m.kind === 'agent').map(toRow),
  ];
}

export type MemberAction =
  | { type: 'manage-keys'; member: Member }
  | { type: 'remove'; member: Member }
  | { type: 'copy-link'; invitation: Invitation }
  | { type: 'cancel-invitation'; invitation: Invitation };

export interface MembersTableProps {
  rows: readonly MemberRow[];
  /** Admins see Remove and invitation actions. */
  isAdmin: boolean;
  meId: string | undefined;
  isLoading?: boolean;
  onAction: (action: MemberAction) => void;
}

function actionsFor(row: MemberRow, isAdmin: boolean, meId: string | undefined): MemberAction[] {
  if (row.type === 'invitation') {
    if (!isAdmin) return [];
    const { invitation } = row;
    return [
      ...(invitation.link ? [{ type: 'copy-link', invitation } as const] : []),
      { type: 'cancel-invitation', invitation },
    ];
  }
  const { member } = row;
  const actions: MemberAction[] = [];
  if (member.kind === 'agent' && (isAdmin || member.responsible?.id === meId)) {
    actions.push({ type: 'manage-keys', member });
  }
  if (isAdmin && member.id !== meId && member.role !== 'owner') actions.push({ type: 'remove', member });
  return actions;
}

const ACTION_LABELS: Record<MemberAction['type'], string> = {
  'manage-keys': 'Manage keys',
  remove: 'Remove',
  'copy-link': 'Copy invitation link',
  'cancel-invitation': 'Cancel invitation',
};

const isDanger = (action: MemberAction) => action.type === 'remove' || action.type === 'cancel-invitation';

function RowMenu({
  label,
  actions,
  onAction,
}: {
  label: string;
  actions: MemberAction[];
  onAction: (action: MemberAction) => void;
}) {
  if (actions.length === 0) return null;
  const safe = actions.filter((action) => !isDanger(action));
  const danger = actions.filter(isDanger);
  const item = (action: MemberAction) => (
    <MenuItem key={action.type} id={action.type} tone={isDanger(action) ? 'danger' : 'default'}>
      {ACTION_LABELS[action.type]}
    </MenuItem>
  );
  return (
    <MenuTrigger>
      <Button
        variant="ghost"
        iconOnly
        size="sm"
        aria-label={`Actions for ${label}`}
        className="text-[16px] text-faint"
      >
        ⋯
      </Button>
      <Menu
        onAction={(key) => {
          const action = actions.find((candidate) => candidate.type === key);
          if (action) onAction(action);
        }}
      >
        {safe.map(item)}
        {safe.length > 0 && danger.length > 0 ? <MenuSeparator /> : null}
        {danger.map(item)}
      </Menu>
    </MenuTrigger>
  );
}

function agentSubline(member: Member): string {
  return member.apiKeyCount === 0 ? 'No keys yet' : plural(member.apiKeyCount, 'API key');
}

function WhoCell({ row }: { row: MemberRow }) {
  if (row.type === 'invitation') {
    const { invitation } = row;
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={invitation.email} initials={emailInitials(invitation.email)} size="md" decorative />
        <div className="min-w-0">
          <div className="truncate font-semibold">{invitation.email}</div>
          <div className="truncate text-[12px] text-muted">
            <TimeText>
              {`Invited ${formatShortDate(invitation.createdAt)} · link ${formatExpiry(invitation.expiresAt)}`}
            </TimeText>
          </div>
        </div>
      </div>
    );
  }
  const { member, isYou } = row;
  const sub =
    member.kind === 'agent' ? agentSubline(member) : `${member.email ?? ''}${isYou ? ' · you' : ''}`;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={member.name} kind={member.kind} size="md" decorative />
      <div className="min-w-0">
        <div className="truncate font-semibold">{member.name}</div>
        <div className="truncate text-[12px] text-muted">{sub}</div>
      </div>
    </div>
  );
}

function lastActive(row: MemberRow): string {
  if (row.type === 'invitation') return '—';
  if (row.isYou) return 'Now';
  return row.member.lastActiveAt ? formatAgo(row.member.lastActiveAt) : 'Never';
}

export function MembersTable({ rows, isAdmin, meId, isLoading, onAction }: MembersTableProps) {
  const columns = useMemo<DataColumn<MemberRow>[]>(
    () => [
      {
        id: 'member',
        header: 'Member',
        width: '1fr',
        isRowHeader: true,
        cell: (row) => <WhoCell row={row} />,
      },
      {
        id: 'kind',
        header: 'Kind',
        width: 72,
        cell: (row) =>
          row.type === 'member' && row.member.kind === 'agent' ? (
            <Tag tone="accent">Agent</Tag>
          ) : (
            <Tag>Person</Tag>
          ),
      },
      {
        id: 'role',
        header: 'Role',
        width: 80,
        cell: (row) => (
          <span className="text-muted">
            {ROLE_LABELS[row.type === 'member' ? row.member.role : row.invitation.role]}
          </span>
        ),
      },
      {
        id: 'responsible',
        header: 'Responsible human',
        width: 170,
        cell: (row) =>
          row.type === 'member' && row.member.responsible ? (
            <MemberLabel name={row.member.responsible.name} className="text-[12px] text-muted" />
          ) : null,
      },
      {
        id: 'last-active',
        header: 'Last active',
        width: 84,
        cell: (row) => (
          <span className="font-mono text-[10px] text-faint">
            <TimeText>{lastActive(row)}</TimeText>
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        width: 28,
        cell: (row) => (
          <RowMenu
            label={row.type === 'member' ? row.member.name : row.invitation.email}
            actions={actionsFor(row, isAdmin, meId)}
            onAction={onAction}
          />
        ),
      },
    ],
    [isAdmin, meId, onAction],
  );

  return (
    <DataTable
      aria-label="Members"
      columns={columns}
      items={rows}
      getKey={(row) => row.id}
      rowHeight={53}
      isLoading={isLoading}
      skeletonRows={6}
      renderEmptyState={() => <p className="m-0 px-6 py-5 text-muted">Nobody here yet.</p>}
    />
  );
}
