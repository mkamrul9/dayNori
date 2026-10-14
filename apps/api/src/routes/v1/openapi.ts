import type { FastifyInstance } from 'fastify';

export function getOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Daynori API',
      version: '0.1.0',
      description:
        'Canonical versioned HTTP API for Daynori organizer service, providing authenticated tenant-isolated operations.',
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
            'RS256 or EdDSA signed JWT containing user claims (sub, iss, aud, exp, nbf). Anonymous, service, and admin tokens rejected.',
        },
      },
      schemas: {
        ResponseMeta: {
          type: 'object',
          required: ['requestId', 'serverTime'],
          properties: {
            requestId: { type: 'string' },
            serverTime: { type: 'string', format: 'date-time' },
            cursor: { type: 'string' },
          },
        },
        ApiError: {
          type: 'object',
          required: ['code', 'message', 'requestId'],
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            requestId: { type: 'string' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  code: { type: 'string' },
                },
              },
            },
            retryAfter: { type: 'integer' },
          },
        },
        ApiErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { $ref: '#/components/schemas/ApiError' },
          },
        },
        Workspace: {
          type: 'object',
          required: ['id', 'name', 'kind', 'ownerId', 'createdAt', 'updatedAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            kind: { type: 'string', enum: ['personal', 'room'] },
            ownerId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateWorkspaceRequest: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            kind: { type: 'string', enum: ['personal', 'room'], default: 'personal' },
          },
        },
        Membership: {
          type: 'object',
          required: ['workspaceId', 'userId', 'role', 'createdAt', 'updatedAt'],
          properties: {
            workspaceId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['owner', 'editor', 'viewer'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AddMemberRequest: {
          type: 'object',
          required: ['userId', 'role'],
          additionalProperties: false,
          properties: {
            userId: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['owner', 'editor', 'viewer'] },
          },
        },
        Item: {
          type: 'object',
          required: [
            'id',
            'workspaceId',
            'folderId',
            'kind',
            'createdBy',
            'updatedBy',
            'createdAt',
            'updatedAt',
            'deletedAt',
            'displayOrder',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            workspaceId: { type: 'string', format: 'uuid' },
            folderId: { type: 'string', format: 'uuid', nullable: true },
            kind: { type: 'string', enum: ['folder', 'note', 'task', 'file'] },
            createdBy: { type: 'string', format: 'uuid' },
            updatedBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true },
            displayOrder: { type: 'integer' },
          },
        },
        CreateItemRequest: {
          type: 'object',
          required: ['kind'],
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['folder', 'note', 'task', 'file'] },
            folderId: { type: 'string', format: 'uuid', nullable: true },
            displayOrder: { type: 'integer' },
          },
        },
      },
    },
    paths: {
      '/v1/health': {
        get: {
          summary: 'Health Check',
          responses: {
            '200': { description: 'Service operational' },
          },
        },
      },
      '/v1/ready': {
        get: {
          summary: 'Readiness Probe',
          responses: {
            '200': { description: 'Service ready' },
            '503': { description: 'Service unavailable' },
          },
        },
      },
      '/v1/workspaces': {
        get: {
          summary: 'List Workspaces',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': { description: 'Accessible workspaces' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
        post: {
          summary: 'Create Workspace',
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
            '201': { description: 'Workspace created' },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/v1/workspaces/{workspaceId}': {
        get: {
          summary: 'Get Workspace',
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
            '200': { description: 'Workspace details' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/v1/workspaces/{workspaceId}/members': {
        get: {
          summary: 'List Workspace Members',
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
            '200': { description: 'Member list' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
        post: {
          summary: 'Add Workspace Member',
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
            '201': { description: 'Member added' },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/v1/workspaces/{workspaceId}/items': {
        get: {
          summary: 'List Items with Keyset Pagination',
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
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
            {
              name: 'cursor',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'Paginated item list' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
        post: {
          summary: 'Create Item',
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
            '201': { description: 'Item created' },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
    },
  };
}

export function registerOpenApiRoutes(app: FastifyInstance): void {
  app.get('/v1/openapi.json', async (_request, reply) => {
    return reply.status(200).send(getOpenApiSpec());
  });
}
