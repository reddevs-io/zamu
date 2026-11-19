import type { Me } from '@zamu/contracts';
import { ROLE_LABELS } from '~/features/settings/format';

/** "Admin · Reddevs": role and workspace. */
export function userMenuSubtitle(me: Pick<Me, 'role' | 'workspace'>): string {
  return `${ROLE_LABELS[me.role]} · ${me.workspace.name}`;
}

/** Line under the name in the person menu (frame 005): the email, or the role and workspace without one. */
export function personMenuSubtitle(
  me: Pick<Me, 'role' | 'workspace'> & { user: Pick<Me['user'], 'email'> },
): string {
  return me.user.email ?? userMenuSubtitle(me);
}
