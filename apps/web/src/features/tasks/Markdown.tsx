import { useMemo, useRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '~/ui';
import { findCheckboxes } from './format';

// Task descriptions. react-markdown never renders raw HTML (it shows as text) and its default URL
// transform drops javascript: and other unsafe links, so descriptions written by agents are safe to show.

export interface MarkdownProps {
  source: string;
  /** Task page uses 14px with roomier lines; the pane 13.5px. */
  size?: 'pane' | 'page';
  /** Called with the checkbox index (document order) when someone ticks a box. Omit for read-only. */
  onToggleCheckbox?: (index: number) => void;
  className?: string;
}

type HastNode = { position?: { start?: { line?: number } } } | undefined;

export function Markdown({ source, size = 'pane', onToggleCheckbox, className }: MarkdownProps) {
  // The renderers below are component types: they must keep their identity across renders, or React
  // remounts every element of the description (and a checkbox being clicked goes away). So they read
  // the current checkboxes and callback from refs.
  const checkboxes = useRef(findCheckboxes(source));
  checkboxes.current = useMemo(() => findCheckboxes(source), [source]);
  const toggleRef = useRef(onToggleCheckbox);
  toggleRef.current = onToggleCheckbox;
  const editable = onToggleCheckbox != null;

  const components = useMemo<Components>(() => {
    const checkboxAt = (node: HastNode) => {
      const line = (node?.position?.start?.line ?? 0) - 1;
      const index = checkboxes.current.findIndex((item) => item.line === line);
      return index < 0 ? null : { index, checked: checkboxes.current[index]?.checked ?? false };
    };
    return {
      p: ({ node: _node, ...props }) => <p {...props} className="m-0 text-pretty" />,
      a: ({ node: _node, ...props }) => (
        <a
          {...props}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline decoration-[color-mix(in_oklch,var(--accent)_40%,transparent)] underline-offset-2 hover:decoration-current"
        />
      ),
      h1: ({ node: _node, ...props }) => <h3 {...props} className="m-0 text-[16px] font-semibold" />,
      h2: ({ node: _node, ...props }) => <h3 {...props} className="m-0 text-[15px] font-semibold" />,
      h3: ({ node: _node, ...props }) => <h4 {...props} className="m-0 text-[14px] font-semibold" />,
      h4: ({ node: _node, ...props }) => <h5 {...props} className="m-0 text-[13px] font-semibold" />,
      ul: ({ node: _node, className: listClass, ...props }) => (
        <ul
          {...props}
          className={cn(
            'm-0 flex flex-col gap-1 p-0',
            listClass?.includes('contains-task-list') ? 'list-none' : 'list-disc pl-5',
          )}
        />
      ),
      ol: ({ node: _node, ...props }) => (
        <ol {...props} className="m-0 flex list-decimal flex-col gap-1 pl-5" />
      ),
      li: ({ node, className: itemClass, children, ...props }) => {
        if (!itemClass?.includes('task-list-item')) return <li {...props}>{children}</li>;
        const box = checkboxAt(node as HastNode);
        const checked = box?.checked ?? false;
        return (
          <li {...props} className="flex items-baseline gap-2.5">
            <CheckboxSquare
              checked={checked}
              onToggle={box && editable ? () => toggleRef.current?.(box.index) : undefined}
            />
            <span
              className={cn('min-w-0', checked && 'text-muted line-through decoration-[color:var(--faint)]')}
            >
              {children}
            </span>
          </li>
        );
      },
      // The task list box is drawn by the li above.
      input: ({ node: _node, ...props }) =>
        props.type === 'checkbox' ? null : <input {...props} readOnly />,
      code: ({ node: _node, className: codeClass, ...props }) => (
        <code {...props} className={cn('bg-band px-1 py-px font-mono text-[11px]', codeClass)} />
      ),
      pre: ({ node: _node, ...props }) => (
        <pre
          {...props}
          className="m-0 overflow-x-auto border border-line-2 bg-band p-3 font-mono text-[11px] leading-normal [&_code]:bg-transparent [&_code]:p-0"
        />
      ),
      blockquote: ({ node: _node, ...props }) => (
        <blockquote {...props} className="m-0 border-l-2 border-line pl-3 text-muted" />
      ),
      hr: () => <hr className="my-1 h-px border-0 bg-line" />,
      table: ({ node: _node, ...props }) => (
        <div className={cn('overflow-x-auto', size === 'page' && 'max-w-[520px]')}>
          <table
            {...props}
            className="w-full border-collapse border border-line font-mono text-[11px] leading-normal"
          />
        </div>
      ),
      th: ({ node: _node, ...props }) => (
        <th
          {...props}
          className="border-r border-b border-line-2 bg-band px-2.5 py-1.5 text-left font-normal text-muted last:border-r-0"
        />
      ),
      td: ({ node: _node, ...props }) => (
        <td {...props} className="border-r border-b border-line-2 px-2.5 py-1.5 last:border-r-0" />
      ),
      img: ({ node: _node, alt, ...props }) => <img {...props} alt={alt ?? ''} className="max-w-full" />,
    };
  }, [editable, size]);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col break-words',
        size === 'page'
          ? 'max-w-[720px] gap-2.5 text-[14px] leading-[1.6]'
          : 'gap-2 text-[13.5px] leading-[1.55]',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}

/** The design's 10px square: hollow when open, filled when done. A real checkbox when it can be toggled. */
function CheckboxSquare({ checked, onToggle }: { checked: boolean; onToggle?: () => void }) {
  const look = cn(
    'block size-2.5 shrink-0 translate-y-px appearance-none',
    checked ? 'bg-fg' : 'border-[1.5px] border-muted',
  );
  if (!onToggle) {
    return <span role="img" aria-label={checked ? 'Done' : 'Not done'} className={look} />;
  }
  return (
    <input
      type="checkbox"
      aria-label="Done"
      checked={checked}
      onChange={onToggle}
      onClick={(event) => event.stopPropagation()}
      className={cn(look, 'm-0 cursor-pointer outline-none focus-visible:focus-ring')}
    />
  );
}
