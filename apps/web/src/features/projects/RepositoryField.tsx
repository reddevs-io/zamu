import { parseRepositoryUrl } from '@pm/contracts';
import type { ReactNode, Ref } from 'react';
import { InlineCode, TextField } from '~/ui';

// The optional Repository field of the New and Edit project dialogs (M2.1 frames 2a to 3c). The hint
// reads the URL back as the short form it matches; format errors show when the field loses focus.

const codeClass = 'text-[10.5px] whitespace-nowrap text-fg';

function Short({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10.5px] text-fg">{children}</span>;
}

/** Hint for an empty field: what the link is for. */
export function emptyRepositoryHint(): ReactNode {
  return (
    <>
      The URL you clone from, HTTPS or SSH. Inside a clone of it, pm picks this project without{' '}
      <InlineCode className={codeClass}>--project</InlineCode>.
    </>
  );
}

/** "Matches clones of …" for a clone URL, or null when the value is not one. */
function matchHint(value: string, extra?: ReactNode): ReactNode | null {
  const repository = parseRepositoryUrl(value);
  if (!repository) return null;
  return (
    <>
      Matches clones of <Short>{repository.short}</Short>, over HTTPS or SSH.{extra}
    </>
  );
}

/** New project: the empty hint, or the short form the URL matches. */
export function newRepositoryHint(value: string): ReactNode {
  return matchHint(value) ?? emptyRepositoryHint();
}

/** Edit project: also mentions `pm link`, and says what saving an emptied field does. */
export function editRepositoryHint(
  value: string,
  project: { key: string; repository: string | null },
): ReactNode {
  if (!value.trim() && project.repository) {
    const old = parseRepositoryUrl(project.repository)?.short ?? project.repository;
    return (
      <>
        Saving unlinks <Short>{old}</Short>. In that clone, pm commands need{' '}
        <InlineCode className={codeClass}>--project {project.key}</InlineCode> again.
      </>
    );
  }
  const linkHint = (
    <>
      {' '}
      From a clone, <InlineCode className={codeClass}>pm link --project {project.key}</InlineCode> sets it
      too.
    </>
  );
  return matchHint(value, linkHint) ?? emptyRepositoryHint();
}

export interface RepositoryFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Checks the format when the field loses focus. */
  onBlur: () => void;
  description: ReactNode;
  error: string | undefined;
  inputRef: Ref<HTMLInputElement>;
}

export function RepositoryField({
  value,
  onChange,
  onBlur,
  description,
  error,
  inputRef,
}: RepositoryFieldProps) {
  return (
    <TextField
      label={
        <>
          Repository <span className="font-normal text-faint">optional</span>
        </>
      }
      name="repository"
      inputRef={inputRef}
      mono
      autoComplete="off"
      spellCheck="false"
      placeholder="https://gitlab.com/team/repo.git"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      description={description}
      isInvalid={Boolean(error)}
      errorMessage={error}
      validationBehavior="aria"
    />
  );
}
