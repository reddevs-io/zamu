import { createFileRoute } from '@tanstack/react-router';
import { MembersPage } from '~/features/settings/MembersPage';
import { invitationsQuery, membersQuery } from '~/features/settings/queries';

export const Route = createFileRoute('/_app/settings/members')({
  loader: ({ context: { queryClient } }) =>
    Promise.all([queryClient.prefetchQuery(membersQuery()), queryClient.prefetchQuery(invitationsQuery())]),
  head: () => ({ meta: [{ title: 'Members · Settings' }] }),
  component: MembersPage,
});
