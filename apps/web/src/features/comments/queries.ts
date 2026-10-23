import type { Comment, Timeline, TimelineItem } from '@pm/contracts';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { client, orpc } from '~/lib/orpc';

// Comment writes for the task timeline. Each answer from the server goes straight into the cached
// timeline, then the timeline refetches in the background. Deleting is optimistic and rolls back when the
// server refuses; sending and editing wait for the server so a failure keeps the text in the box.

const timelineKey = (taskKey: string) => orpc.tasks.timeline.queryKey({ input: { key: taskKey } });

function toItem(comment: Comment): TimelineItem {
  return { ...comment, kind: 'comment' };
}

/** Puts a comment into the cached timeline: replaces it when present, appends it otherwise. */
export function upsertComment(data: Timeline | undefined, comment: Comment): Timeline | undefined {
  if (!data) return data;
  const index = data.items.findIndex((item) => item.kind === 'comment' && item.id === comment.id);
  if (index === -1) return { ...data, items: [...data.items, toItem(comment)] };
  const items = [...data.items];
  items[index] = toItem(comment);
  return { ...data, items };
}

function refresh(queryClient: QueryClient, taskKey: string) {
  void queryClient.invalidateQueries({ queryKey: orpc.tasks.timeline.key({ input: { key: taskKey } }) });
  void queryClient.invalidateQueries({ queryKey: orpc.comments.list.key({ input: { key: taskKey } }) });
}

export function useCreateComment(taskKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: orpc.comments.create.mutationKey(),
    mutationFn: (body: string) => client.comments.create({ key: taskKey, body }),
    onSuccess: (comment) => {
      queryClient.setQueryData(timelineKey(taskKey), (data) => upsertComment(data, comment));
      refresh(queryClient, taskKey);
    },
  });
}

export interface UpdateCommentVariables {
  id: string;
  body: string;
}

export function useUpdateComment(taskKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: orpc.comments.update.mutationKey(),
    mutationFn: ({ id, body }: UpdateCommentVariables) => client.comments.update({ id, body }),
    onSuccess: (comment) => {
      queryClient.setQueryData(timelineKey(taskKey), (data) => upsertComment(data, comment));
      refresh(queryClient, taskKey);
    },
  });
}

export function useDeleteComment(taskKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: orpc.comments.delete.mutationKey(),
    mutationFn: (id: string) => client.comments.delete({ id }),
    onMutate: async (id) => {
      const key = timelineKey(taskKey);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      const comment = previous?.items.find((item) => item.kind === 'comment' && item.id === id);
      if (comment?.kind === 'comment') {
        queryClient.setQueryData(key, (data) =>
          upsertComment(data, {
            ...comment,
            body: null,
            mentions: [],
            deletedAt: new Date().toISOString(),
          }),
        );
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(timelineKey(taskKey), context.previous);
    },
    onSuccess: (comment) => {
      queryClient.setQueryData(timelineKey(taskKey), (data) => upsertComment(data, comment));
    },
    onSettled: () => refresh(queryClient, taskKey),
  });
}
