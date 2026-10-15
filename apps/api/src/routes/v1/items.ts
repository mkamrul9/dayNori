import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import crypto from 'node:crypto';
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
import {
  withTenantContext,
  listItems,
  getItem,
  createItem,
  updateItem,
} from '../../db/index.js';
import {
  lockWorkspaceSyncState,
  insertChange,
  insertOutboxIntent,
  updateWorkspaceSyncSeq,
} from '../../modules/sync/repository.js';
import { decodeCursor, encodeCursor } from '../../utils/pagination.js';
import { NotFoundError, validateResponse } from '../../plugins/errorHandler.js';

export function registerItemRoutes(app: FastifyInstance, runtimePool: Pool): void {
  // GET /v1/workspaces/:workspaceId/items — List items with keyset pagination
  app.get(
    '/v1/workspaces/:workspaceId/items',
    async (request, reply): Promise<ItemListResponse> => {
      const actor = request.actor!;
      const params = WorkspaceParamsSchema.parse(request.params);
      const query = ItemListQuerySchema.parse(request.query);

      const decodedCursor = decodeCursor(query.cursor, {
        workspaceId: params.workspaceId,
        kind: query.kind,
      });

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
          hasMore && lastItem
            ? encodeCursor({
                workspaceId: params.workspaceId,
                kind: query.kind,
                createdAt: lastItem.created_at,
                id: lastItem.id,
              })
            : undefined;

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
            revision: item.revision,
            rank: item.rank,
            isArchived: item.is_archived,
            isPinned: item.is_pinned,
            securityScope: item.security_scope,
          })),
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
            cursor: nextCursor,
          },
        };

        return reply.status(200).send(validateResponse(ItemListResponseSchema, payload));
      } catch {
        // Consistently return 404 if workspace doesn't exist or caller has no access
        throw new NotFoundError('Workspace not found');
      }
    }
  );

  // POST /v1/workspaces/:workspaceId/items — Create item with strict actor-field derivation and sync integration
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

          // Participate in linear sequence and change feed
          const syncState = await lockWorkspaceSyncState(client, params.workspaceId);

          const created = await createItem(client, {
            workspaceId: params.workspaceId,
            kind: body.kind,
            folderId: body.folderId,
            displayOrder: body.displayOrder,
            createdBy: actor.userId, // Actor identity derived exclusively from verified JWT
            revision: 1,
            rank: '0',
            securityScope: 'standard',
          });

          await insertChange(client, {
            workspaceId: params.workspaceId,
            seq: syncState.nextChangeSeq,
            entityType: 'item',
            entityId: created.id,
            revision: 1,
            isTombstone: false,
            operationId: crypto.randomUUID(),
            changeData: {
              kind: created.kind,
              folderId: created.folder_id,
              rank: created.rank,
            },
          });

          await insertOutboxIntent(client, {
            workspaceId: params.workspaceId,
            eventType: 'item.created',
            payload: { itemId: created.id, revision: 1, seq: syncState.nextChangeSeq },
          });

          await updateWorkspaceSyncSeq(client, params.workspaceId, syncState.nextChangeSeq + 1);

          return created;
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
          revision: item.revision,
          rank: item.rank,
          isArchived: item.is_archived,
          isPinned: item.is_pinned,
          securityScope: item.security_scope,
        },
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      };

      return reply.status(201).send(validateResponse(ItemResponseSchema, payload));
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
            revision: item.revision,
            rank: item.rank,
            isArchived: item.is_archived,
            isPinned: item.is_pinned,
            securityScope: item.security_scope,
          },
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        };

        return reply.status(200).send(validateResponse(ItemResponseSchema, payload));
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          throw err;
        }
        throw new NotFoundError('Item not found');
      }
    }
  );

  // DELETE /v1/workspaces/:workspaceId/items/:itemId — Delete item with sync tombstone integration
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
            const accessRes = await client.query<{ exists: boolean }>(
              `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
              [params.workspaceId]
            );
            if (!accessRes.rows[0]?.exists) {
              throw new NotFoundError('Workspace not found or unauthorized');
            }

            const syncState = await lockWorkspaceSyncState(client, params.workspaceId);
            const existing = await getItem(client, params.workspaceId, params.itemId);
            if (!existing || existing.deleted_at !== null) {
              return false;
            }

            const newRevision = existing.revision + 1;
            await updateItem(client, params.workspaceId, params.itemId, {
              deletedAt: new Date(),
              updatedBy: actor.userId,
              revision: newRevision,
            });

            await insertChange(client, {
              workspaceId: params.workspaceId,
              seq: syncState.nextChangeSeq,
              entityType: 'item',
              entityId: params.itemId,
              revision: newRevision,
              isTombstone: true,
              operationId: crypto.randomUUID(),
              changeData: { deleted: true },
            });

            await insertOutboxIntent(client, {
              workspaceId: params.workspaceId,
              eventType: 'item.deleted',
              payload: {
                itemId: params.itemId,
                revision: newRevision,
                seq: syncState.nextChangeSeq,
              },
            });

            await updateWorkspaceSyncSeq(client, params.workspaceId, syncState.nextChangeSeq + 1);
            return true;
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
