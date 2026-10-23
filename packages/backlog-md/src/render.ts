import type { BacklogComment, BacklogTask } from './types';

function renderComment(comment: BacklogComment): string {
  const meta = [comment.author ? `**${comment.author}**` : null, comment.createdRaw]
    .filter(Boolean)
    .join(' · ');
  return meta ? `${meta}\n\n${comment.body}` : comment.body;
}

/**
 * The app's Markdown description for a Backlog.md task: the Description section, then the other
 * sections under ## headings in a fixed order (Acceptance criteria, Definition of done, Implementation
 * plan, Implementation notes, Comments from Backlog.md, Final summary). Markers are stripped,
 * checklists keep their "- [ ] #1" lines as written, empty sections are left out. Content outside
 * every known section (headings Backlog.md does not know) comes last, as written.
 */
export function renderDescription(task: Pick<BacklogTask, 'sections'>): string {
  const { sections } = task;
  const parts: string[] = [];
  const add = (heading: string | null, body: string | null | undefined) => {
    const text = body?.trim();
    if (!text) return;
    parts.push(heading ? `## ${heading}\n\n${text}` : text);
  };

  add(null, sections.description);
  add('Acceptance criteria', sections.acceptanceCriteria?.text);
  add('Definition of done', sections.definitionOfDone?.text);
  add('Implementation plan', sections.implementationPlan);
  add('Implementation notes', sections.implementationNotes);
  add('Comments from Backlog.md', sections.comments.map(renderComment).join('\n\n---\n\n'));
  add('Final summary', sections.finalSummary);
  add(null, sections.extra);
  return parts.join('\n\n');
}
