import { z } from 'zod';
import {
  ApiErrorResponseSchema,
  HealthCheckResponseSchema,
  ReadinessCheckResponseSchema,
  CreateWorkspaceRequestSchema,
  WorkspaceSchema,
  WorkspaceResponseSchema,
  WorkspaceListResponseSchema,
  AddMemberRequestSchema,
  MembershipSchema,
  MemberResponseSchema,
  MemberListResponseSchema,
  CreateItemRequestSchema,
  ItemSchema,
  ItemResponseSchema,
  ItemListResponseSchema,
} from './index.js';

export function zodToOpenApi(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def;

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodString) {
    const res: Record<string, unknown> = { type: 'string' };
    for (const check of def.checks || []) {
      if (check.kind === 'uuid') res['format'] = 'uuid';
      if (check.kind === 'email') res['format'] = 'email';
      if (check.kind === 'datetime') res['format'] = 'date-time';
      if (check.kind === 'min') res['minLength'] = check.value;
      if (check.kind === 'max') res['maxLength'] = check.value;
    }
    return res;
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodNumber) {
    const res: Record<string, unknown> = { type: 'integer' };
    for (const check of def.checks || []) {
      if (check.kind === 'min') res['minimum'] = check.value;
      if (check.kind === 'max') res['maximum'] = check.value;
    }
    return res;
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodEnum) {
    return { type: 'string', enum: def.values };
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodLiteral) {
    return { type: typeof def.value, enum: [def.value] };
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodArray) {
    return {
      type: 'array',
      items: zodToOpenApi(def.type),
    };
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodObject) {
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodTypeAny;
      properties[key] = zodToOpenApi(fieldSchema);
      if (
        fieldSchema._def.typeName !== z.ZodFirstPartyTypeKind.ZodOptional &&
        fieldSchema._def.typeName !== z.ZodFirstPartyTypeKind.ZodDefault
      ) {
        required.push(key);
      }
    }

    const res: Record<string, unknown> = {
      type: 'object',
      properties,
    };
    if (required.length > 0) {
      res['required'] = required;
    }
    return res;
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodOptional) {
    return zodToOpenApi(def.innerType);
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodNullable) {
    return { ...zodToOpenApi(def.innerType), nullable: true };
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
    return zodToOpenApi(def.innerType);
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodUnion) {
    return {
      anyOf: (def.options as z.ZodTypeAny[]).map(zodToOpenApi),
    };
  }

  if (def.typeName === z.ZodFirstPartyTypeKind.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: true,
    };
  }

  return { type: 'object' };
}

export function generateCanonicalOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Daynori API',
      version: '0.1.0',
      description:
        'Canonical versioned HTTP API for Daynori organizer service, generated dynamically from shared Zod contracts.',
    },
    servers: [
      {
        url: '/v1',
        description: 'V1 Service Endpoint',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'RS256, EdDSA, or HS256 signed JWT containing verified user claims. Anonymous, service, and admin tokens rejected.',
        },
      },
      schemas: {
        ApiErrorResponse: zodToOpenApi(ApiErrorResponseSchema),
        HealthCheckResponse: zodToOpenApi(HealthCheckResponseSchema),
        ReadinessCheckResponse: zodToOpenApi(ReadinessCheckResponseSchema),
        CreateWorkspaceRequest: zodToOpenApi(CreateWorkspaceRequestSchema),
        Workspace: zodToOpenApi(WorkspaceSchema),
        WorkspaceResponse: zodToOpenApi(WorkspaceResponseSchema),
        WorkspaceListResponse: zodToOpenApi(WorkspaceListResponseSchema),
        AddMemberRequest: zodToOpenApi(AddMemberRequestSchema),
        Membership: zodToOpenApi(MembershipSchema),
        MemberResponse: zodToOpenApi(MemberResponseSchema),
        MemberListResponse: zodToOpenApi(MemberListResponseSchema),
        CreateItemRequest: zodToOpenApi(CreateItemRequestSchema),
        Item: zodToOpenApi(ItemSchema),
        ItemResponse: zodToOpenApi(ItemResponseSchema),
        ItemListResponse: zodToOpenApi(ItemListResponseSchema),
      },
    },
    paths: {
      '/v1/health': {
        get: {
          summary: 'Service liveness probe',
          responses: {
            '200': {
              description: 'Service is alive',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthCheckResponse' },
                },
              },
            },
          },
        },
      },
      '/v1/ready': {
        get: {
          summary: 'Service readiness probe',
          responses: {
            '200': {
              description: 'Service is ready to handle traffic',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReadinessCheckResponse' },
                },
              },
            },
            '503': {
              description: 'Service unavailable or unready dependencies',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReadinessCheckResponse' },
                },
              },
            },
          },
        },
      },
      '/v1/workspaces': {
        post: {
          summary: 'Create a new workspace with caller as owner',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateWorkspaceRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Workspace created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WorkspaceResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
        get: {
          summary: 'List authorized workspaces for caller',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'List of workspaces',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WorkspaceListResponse' },
                },
              },
            },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/v1/workspaces/{workspaceId}': {
        get: {
          summary: 'Get workspace details by ID',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'workspaceId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WorkspaceResponse' },
                },
              },
            },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/v1/workspaces/{workspaceId}/members': {
        post: {
          summary: 'Add member to workspace',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'workspaceId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AddMemberRequest' },
              },
            },
          },
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MemberResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/v1/workspaces/{workspaceId}/items': {
        post: {
          summary: 'Create item in workspace',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'workspaceId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateItemRequest' },
              },
            },
          },
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ItemResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
        get: {
          summary: 'List items in workspace with keyset pagination',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'workspaceId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'cursor',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'kind',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ItemListResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
    },
  };
}
