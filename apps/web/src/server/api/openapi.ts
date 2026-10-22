// The OpenAPI 3.1 document of /api/v1, generated from the contract and served at /api/v1/openapi.json.
import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { contract, problemJsonSchema } from '@pm/contracts';

export const OPENAPI_PATH = '/api/v1/openapi.json';

type OpenAPIDocument = Awaited<ReturnType<OpenAPIGenerator['generate']>>;
type GenerateOptions = NonNullable<Parameters<OpenAPIGenerator['generate']>[1]>;

const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });

export function generateOpenApiDocument(): Promise<OpenAPIDocument> {
  return generator.generate(contract, {
    info: {
      title: 'project-management API',
      version: '1',
      description:
        'REST API of project-management. Authenticate with an API key (`Authorization: Bearer pm_live_...`) ' +
        'or, from the web app, the session cookie. Errors use application/problem+json style bodies ' +
        '(RFC 9457) with `code`, `requestId` and `issues`.',
      license: { name: 'MIT', identifier: 'MIT' },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          description: 'An API key created in Settings → API keys, starting with pm_live_.',
        },
        session: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token' },
      },
    },
    security: [{ apiKey: [] }, { session: [] }],
    // Every error status shares the Problem body instead of oRPC's default error shape.
    customErrorResponseBodySchema: problemJsonSchema as GenerateOptions['customErrorResponseBodySchema'],
  });
}

let cached: Promise<OpenAPIDocument> | undefined;

/** The document, generated once per process. */
export function getOpenApiDocument(): Promise<OpenAPIDocument> {
  cached ??= generateOpenApiDocument().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
