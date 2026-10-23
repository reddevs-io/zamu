// pm comments list | add | edit | delete.
import {
  type Comment,
  CreateCommentInput,
  DeleteCommentInput,
  ListCommentsInput,
  UpdateCommentInput,
} from '@pm/contracts';
import { type CommandContext, emit } from '../context';
import { commentAuthor, commentBlock } from '../format';
import { parseInput, readText } from './shared';

/** "Added comment <id> on PAY-142" plus the body as it was stored (mentions resolved). */
function commentSummary(context: CommandContext, verb: string, comment: Comment): string {
  const { style } = context;
  const head = `${verb} comment ${style.bold(comment.id)} on ${style.bold(comment.taskKey)}`;
  if (comment.body === null) return `${head}\n`;
  return `${head}\n\n${commentBlock(comment, style)}\n`;
}

export async function listComments(context: CommandContext, key: string): Promise<void> {
  const input = parseInput(ListCommentsInput, { key });
  const client = await context.client();
  const comments = await client.comments.list(input);
  emit(context, 'comments.list', comments, (data) => {
    if (data.items.length === 0) return `No comments on ${input.key}.\n`;
    return `${data.items.map((comment) => commentBlock(comment, context.style)).join('\n\n')}\n`;
  });
}

export async function addComment(context: CommandContext, key: string, body: string): Promise<void> {
  const input = parseInput(CreateCommentInput, { key, body: await readText(context, body) });
  const client = await context.client();
  const comment = await client.comments.create(input);
  emit(context, 'comments.add', comment, (data) => commentSummary(context, 'Added', data));
}

export async function editComment(context: CommandContext, id: string, body: string): Promise<void> {
  const input = parseInput(UpdateCommentInput, { id, body: await readText(context, body) });
  const client = await context.client();
  const comment = await client.comments.update(input);
  emit(context, 'comments.edit', comment, (data) => commentSummary(context, 'Edited', data));
}

export async function deleteComment(context: CommandContext, id: string): Promise<void> {
  const input = parseInput(DeleteCommentInput, { id });
  const client = await context.client();
  const comment = await client.comments.delete(input);
  emit(
    context,
    'comments.delete',
    comment,
    (data) =>
      `Deleted comment ${context.style.bold(data.id)} by ${commentAuthor(data)} on ${context.style.bold(data.taskKey)}\n`,
  );
}
