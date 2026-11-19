import type { ApiKeyScope, CreateAgentInput, CreateApiKeyInput, ProjectRef } from '@zamu/contracts';
import type { z } from 'zod';

export type CreateAgentValues = z.input<typeof CreateAgentInput>;
export type CreateApiKeyValues = z.input<typeof CreateApiKeyInput>;

/** Projects offered in the scope picker. */
export type ScopeProject = ProjectRef;

export type { ApiKeyScope };
