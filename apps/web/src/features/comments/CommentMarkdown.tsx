import type { UserRef } from '@pm/contracts';
import { createContext, useContext, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CommentBody, MentionChip } from '~/ui';
import { commentUrlTransform, mentionId } from './mentions';

// Comment bodies and the composer preview. react-markdown never renders raw HTML; links keep only
// http(s) and mention: targets. A mention link turns into a chip when its id is a known member (from the
// comment's own mention list or the workspace members); otherwise it reads as plain text.

type KnownMember = Pick<UserRef, 'id' | 'name' | 'kind'>;

const MembersContext = createContext<ReadonlyMap<string, KnownMember>>(new Map());

/** The renderers read members from context, so the components object keeps its identity. */
const components: Components = {
  a: function CommentLink({ node: _node, href, children }) {
    const members = useContext(MembersContext);
    const id = mentionId(href);
    if (id) {
      const member = members.get(id);
      if (!member) return <>{children}</>;
      return <MentionChip name={member.name} kind={member.kind} />;
    }
    if (!href) return <>{children}</>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  img: ({ node: _node, alt, src }) =>
    src ? <img src={src} alt={alt ?? ''} className="max-w-full" /> : (alt ?? null),
  input: ({ node: _node, ...props }) =>
    props.type === 'checkbox' ? <input type="checkbox" checked={props.checked} disabled readOnly /> : null,
};

export interface CommentMarkdownProps {
  source: string;
  /** Members the comment mentions, from the server. */
  mentions?: readonly KnownMember[];
  /** Workspace members, for previews and comments whose mention list is not loaded. */
  members?: readonly KnownMember[];
  className?: string;
}

export function CommentMarkdown({ source, mentions, members, className }: CommentMarkdownProps) {
  const known = useMemo(() => {
    const map = new Map<string, KnownMember>();
    for (const member of members ?? []) map.set(member.id, member);
    for (const member of mentions ?? []) map.set(member.id, member);
    return map;
  }, [members, mentions]);
  return (
    <MembersContext.Provider value={known}>
      <CommentBody className={className}>
        <MarkdownOnly source={source} />
      </CommentBody>
    </MembersContext.Provider>
  );
}

/** The Markdown alone, for the composer preview (which wraps it in CommentBody itself). */
export function CommentMarkdownContent({
  source,
  members,
}: {
  source: string;
  members?: readonly KnownMember[];
}) {
  const known = useMemo(() => new Map((members ?? []).map((member) => [member.id, member])), [members]);
  return (
    <MembersContext.Provider value={known}>
      <MarkdownOnly source={source} />
    </MembersContext.Provider>
  );
}

function MarkdownOnly({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={commentUrlTransform} components={components}>
      {source}
    </ReactMarkdown>
  );
}
