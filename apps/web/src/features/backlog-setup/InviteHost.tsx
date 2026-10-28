import { useCreateInvitation } from '~/features/settings/queries';
import { InviteFromMappings, type InviteFromMappingsProps } from './InviteFromMappings';

// InviteFromMappings wired to the server. Kept apart so the dialog can be tested without the server
// functions.

export type InviteHostProps = Omit<InviteFromMappingsProps, 'onSubmit'>;

/** InviteFromMappings wired to the server (needs member.manage, as Settings › Members does). */
export function InviteHost(props: InviteHostProps) {
  const createInvitation = useCreateInvitation();
  return <InviteFromMappings {...props} onSubmit={(input) => createInvitation.mutateAsync(input)} />;
}
