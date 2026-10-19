import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateCustomSectionRecordRequestSchema,
  CreateCustomSectionRequestSchema,
  CreateCustomSectionSchemaRequestSchema,
  QueryExistingRecordViewRequestSchema,
  UpdateCustomSectionRecordRequestSchema,
  UpdateCustomSectionRequestSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createCustomSection,
  createCustomSectionRecord,
  createCustomSectionSchema,
  CustomSectionNotFoundError,
  CustomSectionRecordNotFoundError,
  CustomSectionRevisionConflictError,
  CustomSectionSchemaVersionNotFoundError,
  CustomSectionValidationError,
  deleteCustomSection,
  deleteCustomSectionRecord,
  getCustomSection,
  getCustomSectionRecord,
  getCustomSectionSchemaVersion,
  listCustomSectionRecords,
  listCustomSections,
  queryExistingRecordView,
  updateCustomSection,
  updateCustomSectionRecord,
} from '../../modules/custom-sections/service.js';

export function registerCustomSectionRoutes(app: FastifyInstance, pool: Pool): void {

  function handleError(err: unknown, reply: FastifyReply) {
    if (err instanceof CustomSectionNotFoundError || err instanceof CustomSectionRecordNotFoundError || err instanceof CustomSectionSchemaVersionNotFoundError) {
      return reply.status(404).send({ error: { message: err.message, code: 'NOT_FOUND' } });
    }
    if (err instanceof CustomSectionRevisionConflictError) {
      return reply.status(409).send({ error: { message: err.message, code: 'REVISION_CONFLICT' } });
    }
    if (err instanceof CustomSectionValidationError) {
      return reply.status(400).send({ error: { message: err.message, code: 'VALIDATION_ERROR' } });
    }
    throw err;
  }

  // 1. Create Custom Section
  app.post(
    '/v1/workspaces/:workspaceId/custom-sections',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = CreateCustomSectionRequestSchema.parse(request.body);
      const operationId =
        (request.headers['x-operation-id'] as string) ||
        (request.query as { operationId?: string })?.operationId;

      try {
        const section = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return createCustomSection(client, workspaceId, actor.userId, body, operationId);
          }
        );

        return reply.status(201).send({
          data: section,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 2. List Custom Sections
  app.get(
    '/v1/workspaces/:workspaceId/custom-sections',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const query = z.object({
        status: z.enum(['active', 'archived']).default('active').optional(),
      }).parse(request.query);

      try {
        const sections = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return listCustomSections(client, workspaceId, query.status || 'active');
          }
        );

        return reply.status(200).send({
          data: sections,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 3. Get Custom Section
  app.get(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
      }).parse(request.params);

      try {
        const section = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return getCustomSection(client, workspaceId, sectionId);
          }
        );

        return reply.status(200).send({
          data: section,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 4. Update Custom Section
  app.patch(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
      }).parse(request.params);
      const body = UpdateCustomSectionRequestSchema.parse(request.body);
      const operationId =
        (request.headers['x-operation-id'] as string) ||
        (request.query as { operationId?: string })?.operationId;

      try {
        const updated = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return updateCustomSection(client, workspaceId, actor.userId, sectionId, body, operationId);
          }
        );

        return reply.status(200).send({
          data: updated,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 5. Delete Custom Section
  app.delete(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
      }).parse(request.params);
      const operationId =
        (request.headers['x-operation-id'] as string) ||
        (request.query as { operationId?: string })?.operationId;

      try {
        await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return deleteCustomSection(client, workspaceId, actor.userId, sectionId, operationId);
          }
        );

        return reply.status(200).send({
          data: { success: true },
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 6. Create Schema Version (Migration)
  app.post(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId/schemas',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
      }).parse(request.params);
      const body = CreateCustomSectionSchemaRequestSchema.parse(request.body);
      const operationId =
        (request.headers['x-operation-id'] as string) ||
        (request.query as { operationId?: string })?.operationId;

      try {
        const schema = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return createCustomSectionSchema(client, workspaceId, actor.userId, sectionId, body, operationId);
          }
        );

        return reply.status(201).send({
          data: schema,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 7. Get Schema Version
  app.get(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId/schemas/:version',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId, version } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
        version: z.coerce.number().int().positive(),
      }).parse(request.params);

      try {
        const schema = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return getCustomSectionSchemaVersion(client, workspaceId, sectionId, version);
          }
        );

        return reply.status(200).send({
          data: schema,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 8. Create Record
  app.post(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId/records',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
      }).parse(request.params);
      const body = CreateCustomSectionRecordRequestSchema.parse(request.body);
      const operationId =
        (request.headers['x-operation-id'] as string) ||
        (request.query as { operationId?: string })?.operationId;

      try {
        const record = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return createCustomSectionRecord(client, workspaceId, actor.userId, sectionId, body, operationId);
          }
        );

        return reply.status(201).send({
          data: record,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 9. List Records
  app.get(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId/records',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
      }).parse(request.params);
      const query = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
        cursor: z.string().optional(),
      }).parse(request.query);

      try {
        const records = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return listCustomSectionRecords(client, workspaceId, sectionId, query);
          }
        );

        return reply.status(200).send({
          data: records,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 10. Get Record
  app.get(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId/records/:recordId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId, recordId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
        recordId: z.string().uuid(),
      }).parse(request.params);

      try {
        const record = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return getCustomSectionRecord(client, workspaceId, sectionId, recordId);
          }
        );

        return reply.status(200).send({
          data: record,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 11. Update Record
  app.patch(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId/records/:recordId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId, recordId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
        recordId: z.string().uuid(),
      }).parse(request.params);
      const body = UpdateCustomSectionRecordRequestSchema.parse(request.body);
      const operationId =
        (request.headers['x-operation-id'] as string) ||
        (request.query as { operationId?: string })?.operationId;

      try {
        const record = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return updateCustomSectionRecord(
              client,
              workspaceId,
              actor.userId,
              sectionId,
              recordId,
              body,
              operationId
            );
          }
        );

        return reply.status(200).send({
          data: record,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 12. Delete Record
  app.delete(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId/records/:recordId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId, recordId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
        recordId: z.string().uuid(),
      }).parse(request.params);
      const operationId =
        (request.headers['x-operation-id'] as string) ||
        (request.query as { operationId?: string })?.operationId;

      try {
        await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return deleteCustomSectionRecord(client, workspaceId, actor.userId, sectionId, recordId, operationId);
          }
        );

        return reply.status(200).send({
          data: { success: true },
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // 13. Query Existing Record View Block
  app.post(
    '/v1/workspaces/:workspaceId/custom-sections/:sectionId/views/:blockId/query',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, sectionId, blockId } = WorkspaceParamsSchema.extend({
        sectionId: z.string().uuid(),
        blockId: z.string().min(1),
      }).parse(request.params);
      const queryBody = QueryExistingRecordViewRequestSchema.parse(request.body || {});

      try {
        const items = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return queryExistingRecordView(client, workspaceId, actor.userId, sectionId, blockId, queryBody);
          }
        );

        return reply.status(200).send({
          data: items,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );
}
