import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateSavedViewRequestSchema,
  UpdateSavedViewRequestSchema,
  SavedViewResponseSchema,
  SavedViewListResponseSchema,
  ResolvedItemLinkListResponseSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createSavedView,
  getSavedView,
  listSavedViews,
  updateSavedView,
  deleteSavedView,
  resolveItemLinksAndBacklinks,
} from '../../modules/knowledge/service.js';
import { validateResponse, NotFoundError } from '../../plugins/errorHandler.js';

const SavedViewParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  viewId: z.string().uuid(),
});

const ItemResolvedLinksParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export function registerKnowledgeRoutes(app: FastifyInstance, runtimePool: Pool) {
  // --- SAVED VIEWS ---

  app.get('/v1/workspaces/:workspaceId/saved-views', async (request, reply) => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);

    const views = await withTenantContext(
      runtimePool,
      { userId: actor.userId, workspaceId: params.workspaceId },
      async (client) => {
        const auth = await client.query<{ has_access: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as has_access;`,
          [params.workspaceId]
        );
        if (!auth.rows[0]?.has_access) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }
        return listSavedViews(client, params.workspaceId, actor.userId);
      }
    );

    const payload = {
      data: views,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(SavedViewListResponseSchema, payload));
  });

  app.post('/v1/workspaces/:workspaceId/saved-views', async (request, reply) => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);
    const body = CreateSavedViewRequestSchema.parse(request.body);

    const view = await withTenantContext(
      runtimePool,
      { userId: actor.userId, workspaceId: params.workspaceId },
      async (client) => {
        const auth = await client.query<{ has_access: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as has_access;`,
          [params.workspaceId]
        );
        if (!auth.rows[0]?.has_access) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }
        return createSavedView(client, params.workspaceId, actor.userId, body);
      }
    );

    const payload = {
      data: view,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(201).send(validateResponse(SavedViewResponseSchema, payload));
  });

  app.get('/v1/workspaces/:workspaceId/saved-views/:viewId', async (request, reply) => {
    const actor = request.actor!;
    const params = SavedViewParamsSchema.parse(request.params);

    const view = await withTenantContext(
      runtimePool,
      { userId: actor.userId, workspaceId: params.workspaceId },
      async (client) => {
        const auth = await client.query<{ has_access: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as has_access;`,
          [params.workspaceId]
        );
        if (!auth.rows[0]?.has_access) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }
        return getSavedView(client, params.workspaceId, actor.userId, params.viewId);
      }
    );

    const payload = {
      data: view,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(SavedViewResponseSchema, payload));
  });

  app.patch('/v1/workspaces/:workspaceId/saved-views/:viewId', async (request, reply) => {
    const actor = request.actor!;
    const params = SavedViewParamsSchema.parse(request.params);
    const body = UpdateSavedViewRequestSchema.parse(request.body);

    const view = await withTenantContext(
      runtimePool,
      { userId: actor.userId, workspaceId: params.workspaceId },
      async (client) => {
        const auth = await client.query<{ has_access: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as has_access;`,
          [params.workspaceId]
        );
        if (!auth.rows[0]?.has_access) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }
        return updateSavedView(client, params.workspaceId, actor.userId, params.viewId, body);
      }
    );

    const payload = {
      data: view,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(SavedViewResponseSchema, payload));
  });

  app.delete('/v1/workspaces/:workspaceId/saved-views/:viewId', async (request, reply) => {
    const actor = request.actor!;
    const params = SavedViewParamsSchema.parse(request.params);

    await withTenantContext(
      runtimePool,
      { userId: actor.userId, workspaceId: params.workspaceId },
      async (client) => {
        const auth = await client.query<{ has_access: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as has_access;`,
          [params.workspaceId]
        );
        if (!auth.rows[0]?.has_access) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }
        return deleteSavedView(client, params.workspaceId, actor.userId, params.viewId);
      }
    );

    return reply.status(204).send();
  });

  // --- RESOLVED ITEM LINKS & BACKLINKS ---

  app.get('/v1/workspaces/:workspaceId/items/:itemId/links/resolved', async (request, reply) => {
    const actor = request.actor!;
    const params = ItemResolvedLinksParamsSchema.parse(request.params);

    const resolvedLinks = await withTenantContext(
      runtimePool,
      { userId: actor.userId, workspaceId: params.workspaceId },
      async (client) => {
        const auth = await client.query<{ has_access: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as has_access;`,
          [params.workspaceId]
        );
        if (!auth.rows[0]?.has_access) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }
        return resolveItemLinksAndBacklinks(client, params.workspaceId, params.itemId);
      }
    );

    const payload = {
      data: resolvedLinks,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(ResolvedItemLinkListResponseSchema, payload));
  });
}
