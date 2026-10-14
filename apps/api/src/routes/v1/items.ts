import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  CreateItemRequestSchema,
  ItemListQuerySchema,
  ItemParamsSchema,
  WorkspaceParamsSchema,
  ItemListResponseSchema,
  ItemResponseSchema,
  type ItemListResponse,
  type ItemResponse,
} from '@daynori/contracts';
import { withTenantContext, listItems, getItem, createItem, deleteItem } from '../../db/index.js';
import { decodeCursor, encodeCursor } from '../../utils/pagination.js';
import { NotFoundError } from '../../plugins/errorHandler.js';

export function registerItemRoutes(app: FastifyInstance, runtimePool: Pool): void {
  // GET /v1/workspaces/:workspaceId/items — List items with keyset pagination
  app.get(
    '/v1/workspaces/:workspaceId/items',
    async (request, reply): Promise<ItemListResponse> => {
      const actor = request.actor!;
      const params = WorkspaceParamsSchema.parse(request.params);
      const query = ItemListQuerySchema.parse(request.query);

      const decodedCursor = decodeCursor(query.cursor);

      try {
        const records = await withTenantContext(
          runtimePool,
          { userId: actor.userId, workspaceId: params.workspaceId },
          async (client) => {
            const accessRes = await client.query<{ exists: boolean }>(
              `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
              [params.workspaceId]
            );
            if (!accessRes.rows[0]?.exists) {
              throw new NotFoundError('Workspace not found');
            }

            // Fetch limit + 1 to determine if next page exists
            return listItems(client, params.workspaceId, {
              kind: query.kind,
              folderId: query.folderId,
              limit: query.limit + 1,
              cursor: decodedCursor,
            });
          }
        );

        const hasMore = records.length > query.limit;
        const itemsToReturn = hasMore ? records.slice(0, query.limit) : records;
        const lastItem = itemsToReturn[itemsToReturn.length - 1];

        const nextCursor =
          hasMore && lastItem ? encodeCursor(lastItem.created_at, lastItem.id) : undefined;

        const payload: ItemListResponse = {
          data: itemsToReturn.map((item) => ({
            id: item.id,
            workspaceId: item.workspace_id,
            folderId: item.folder_id,
            kind: item.kind as 'folder' | 'note' | 'task' | 'file',
            createdBy: item.created_by,
            updatedBy: item.updated_by,
            createdAt: item.created_at.toISOString(),
            updatedAt: item.updated_at.toISOString(),
            deletedAt: item.deleted_at ? item.deleted_at.toISOString() : null,
            displayOrder: item.display_order,
          })),
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
            cursor: nextCursor,
          },
        };

        return reply.status(200).send(ItemListResponseSchema.parse(payload));
      } catch {
        // Consistently return 404 if workspace doesn't exist or caller has no access
        throw new NotFoundError('Workspace not found');
      }
    }
  );

  // POST /v1/workspaces/:workspaceId/items — Create item with strict actor-field derivation
  app.post('/v1/workspaces/:workspaceId/items', async (request, reply): Promise<ItemResponse> => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);
    // Strict schema parse rejects unknown mutation fields
    const body = CreateItemRequestSchema.parse(request.body);

    try {
      const item = await withTenantContext(
        runtimePool,
        { userId: actor.userId, workspaceId: params.workspaceId },
        async (client) => {
          const accessRes = await client.query<{ exists: boolean }>(
            `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
            [params.workspaceId]
          );
          if (!accessRes.rows[0]?.exists) {
            throw new NotFoundError('Workspace not found or unauthorized');
          }

          return createItem(client, {
            workspaceId: params.workspaceId,
            kind: body.kind,
            folderId: body.folderId,
            displayOrder: body.displayOrder,
            createdBy: actor.userId, // Actor identity derived exclusively from verified JWT
          });
        }
      );

      const payload: ItemResponse = {
        data: {
          id: item.id,
          workspaceId: item.workspace_id,
          folderId: item.folder_id,
          kind: item.kind as 'folder' | 'note' | 'task' | 'file',
          createdBy: item.created_by,
          updatedBy: item.updated_by,
          createdAt: item.created_at.toISOString(),
          updatedAt: item.updated_at.toISOString(),
          deletedAt: item.deleted_at ? item.deleted_at.toISOString() : null,
          displayOrder: item.display_order,
        },
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      };

      return reply.status(201).send(ItemResponseSchema.parse(payload));
    } catch (err: unknown) {
      if (err instanceof NotFoundError) {
        throw err;
      }
      throw new NotFoundError('Workspace not found or unauthorized');
    }
  });

  // GET /v1/workspaces/:workspaceId/items/:itemId — Retrieve single item
  app.get(
    '/v1/workspaces/:workspaceId/items/:itemId',
    async (request, reply): Promise<ItemResponse> => {
      const actor = request.actor!;
      const params = ItemParamsSchema.parse(request.params);

      try {
        const item = await withTenantContext(
          runtimePool,
          { userId: actor.userId, workspaceId: params.workspaceId },
          async (client) => {
            return getItem(client, params.workspaceId, params.itemId);
          }
        );

        if (!item) {
          throw new NotFoundError('Item not found');
        }

        const payload: ItemResponse = {
          data: {
            id: item.id,
            workspaceId: item.workspace_id,
            folderId: item.folder_id,
            kind: item.kind as 'folder' | 'note' | 'task' | 'file',
            createdBy: item.created_by,
            updatedBy: item.updated_by,
            createdAt: item.created_at.toISOString(),
            updatedAt: item.updated_at.toISOString(),
            deletedAt: item.deleted_at ? item.deleted_at.toISOString() : null,
            displayOrder: item.display_order,
          },
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        };

        return reply.status(200).send(ItemResponseSchema.parse(payload));
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          throw err;
        }
        throw new NotFoundError('Item not found');
      }
    }
  );

  // DELETE /v1/workspaces/:workspaceId/items/:itemId — Delete item
  app.delete(
    '/v1/workspaces/:workspaceId/items/:itemId',
    async (request, reply): Promise<{ meta: { requestId: string; serverTime: string } }> => {
      const actor = request.actor!;
      const params = ItemParamsSchema.parse(request.params);

      try {
        const deleted = await withTenantContext(
          runtimePool,
          { userId: actor.userId, workspaceId: params.workspaceId },
          async (client) => {
            return deleteItem(client, params.workspaceId, params.itemId);
          }
        );

        if (!deleted) {
          throw new NotFoundError('Item not found');
        }

        return reply.status(200).send({
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          throw err;
        }
        throw new NotFoundError('Item not found');
      }
    }
  );
}
