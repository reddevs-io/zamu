import type {
  ApiKeyCreated,
  ApiKeyScope,
  CreateAgentInput,
  CreateApiKeyInput,
  Member,
  ProjectRef,
} from '@pm/contracts';
import type { z } from 'zod';

export type CreateAgentValues = z.input<typeof CreateAgentInput>;
export type CreateApiKeyValues = z.input<typeof CreateApiKeyInput>;

/** What creating an agent returns: the member and its first key, with the secret (shown once). */
export interface AgentCreatedResult {
  agent: Member;
  key: ApiKeyCreated;
}

/** Projects offered in the scope picker. */
export type ScopeProject = ProjectRef;

export type { ApiKeyScope };
