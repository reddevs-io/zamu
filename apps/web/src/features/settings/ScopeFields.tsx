// Access (whole workspace or selected projects) and permission (read and write, read only) for a new
// API key, shared by the add agent and new key dialogs.
import type { ApiKeyScope } from '@pm/contracts';
import { Checkbox, CheckboxGroup, RadioCard, RadioGroup } from '~/ui';
import type { ScopeProject } from './types';

export interface ScopeValue {
  access: 'workspace' | 'selected';
  projectIds: string[];
  permission: 'write' | 'read';
}

export const DEFAULT_SCOPE: ScopeValue = { access: 'workspace', projectIds: [], permission: 'write' };

export const PICK_A_PROJECT = 'Pick at least one project.';

/** The contract scope, or null when "Selected projects" has none picked. */
export function toApiKeyScope(value: ScopeValue): ApiKeyScope | null {
  if (value.access === 'workspace') return { projects: 'all', access: value.permission };
  if (value.projectIds.length === 0) return null;
  return { projects: value.projectIds, access: value.permission };
}

export interface ScopeFieldsProps {
  value: ScopeValue;
  onChange: (value: ScopeValue) => void;
  projects: readonly ScopeProject[];
  /** Shown under the project picker. */
  projectsError?: string;
}

export function ScopeFields({ value, onChange, projects, projectsError }: ScopeFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <RadioGroup
          label="Access"
          value={value.access}
          onChange={(access) => onChange({ ...value, access: access as ScopeValue['access'] })}
        >
          <RadioCard value="workspace" label="Whole workspace" />
          <RadioCard value="selected" label="Selected projects" isDisabled={projects.length === 0} />
        </RadioGroup>
        {value.access === 'selected' ? (
          <CheckboxGroup
            aria-label="Projects"
            columns={2}
            value={value.projectIds}
            onChange={(projectIds) => onChange({ ...value, projectIds })}
            isInvalid={Boolean(projectsError)}
            errorMessage={projectsError}
            className="pt-1 pl-6"
          >
            {projects.map((project) => (
              <Checkbox key={project.id} value={project.id} className="min-w-0">
                <span className="font-mono text-[10.5px]">{project.key}</span>
                <span className="truncate">{project.name}</span>
              </Checkbox>
            ))}
          </CheckboxGroup>
        ) : null}
      </div>
      <RadioGroup
        label="Permission"
        layout="grid"
        value={value.permission}
        onChange={(permission) => onChange({ ...value, permission: permission as ScopeValue['permission'] })}
      >
        <RadioCard value="write" label="Read and write" description="Create and update tasks" />
        <RadioCard value="read" label="Read only" description="List and view tasks" />
      </RadioGroup>
    </>
  );
}
