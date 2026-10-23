import type { Me } from '@pm/contracts';
import { ROLE_LABELS } from '~/features/settings/format';

/** Line under the name in the account menu: "Admin · Reddevs". */
export function userMenuSubtitle(me: Pick<Me, 'role' | 'workspace'>): string {
  return `${ROLE_LABELS[me.role]} · ${me.workspace.name}`;
}
