// API keys table: name and prefix, owner, scope, dates, and Revoke (or the Revoked tag).
import type { ApiKeySummary } from '@pm/contracts';
import { type ReactNode, useMemo } from 'react';
import { Button, cn, type DataColumn, DataTable, MemberLabel, Tag } from '~/ui';
import { formatAgo, formatShortDate, scopeText } from './format';
import { TimeText } from './TimeText';

export interface KeysTableProps {
  keys: readonly ApiKeySummary[];
  /** Hide the owner column (your own keys). */
  showOwner?: boolean;
  isLoading?: boolean;
  onRevoke: (key: ApiKeySummary) => void;
  renderEmptyState?: () => ReactNode;
}

export function KeysTable({ keys, showOwner = true, isLoading, onRevoke, renderEmptyState }: KeysTableProps) {
  const columns = useMemo(() => {
    const list: DataColumn<ApiKeySummary>[] = [
      {
        id: 'key',
        header: 'Key',
        width: '1fr',
        isRowHeader: true,
        cell: (key) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={cn('truncate font-semibold', key.revoked && 'text-fg-3')}>{key.name}</span>
            {key.start ? <span className="font-mono text-xs text-fg-3">{key.start}…</span> : null}
          </div>
        ),
      },
    ];
    if (showOwner) {
      list.push({
        id: 'owner',
        header: 'Owner',
        width: 170,
        cell: (key) => (
          <MemberLabel
            name={key.owner.name}
            kind={key.owner.kind}
            className={cn('text-sm', key.revoked ? 'text-fg-3' : 'text-fg-2')}
          />
        ),
      });
    }
    list.push(
      {
        id: 'scope',
        header: 'Scope',
        width: 160,
        cell: (key) => (
          <span className={cn('truncate text-sm', key.revoked ? 'text-fg-3' : 'text-fg-2')}>
            {scopeText(key.scope)}
          </span>
        ),
      },
      {
        id: 'created',
        header: 'Created',
        width: 70,
        cell: (key) => (
          <span className="tabular-nums text-xs text-fg-3">
            <TimeText>{formatShortDate(key.createdAt)}</TimeText>
          </span>
        ),
      },
      {
        id: 'last-used',
        header: 'Last used',
        width: 76,
        cell: (key) => (
          <span className="tabular-nums text-xs text-fg-3">
            <TimeText>{key.lastUsedAt ? formatAgo(key.lastUsedAt) : 'Never'}</TimeText>
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        width: 78,
        cell: (key) =>
          key.revoked ? (
            <Tag>Revoked</Tag>
          ) : (
            <Button variant="destructive" aria-label={`Revoke ${key.name}`} onPress={() => onRevoke(key)}>
              Revoke
            </Button>
          ),
      },
    );
    return list;
  }, [showOwner, onRevoke]);

  return (
    <DataTable
      aria-label="API keys"
      columns={columns}
      items={keys}
      getKey={(key) => key.id}
      rowHeight={49}
      isLoading={isLoading}
      skeletonRows={5}
      renderEmptyState={renderEmptyState}
      className="pt-2"
    />
  );
}
