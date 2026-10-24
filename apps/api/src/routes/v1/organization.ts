import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  CreateFolderRequestSchema,
  UpdateFolderRequestSchema,
  MoveFolderRequestSchema,
  ReorderFolderRequestSchema,
  ArchiveFolderRequestSchema,
  PinFolderRequestSchema,
  DeleteFolderRequestSchema,
  RestoreFolderRequestSchema,
  RebalanceSiblingsRequestSchema,
  CreateTagRequestSchema,
  UpdateTagRequestSchema,
  AddItemTagRequestSchema,
  CreateItemLinkRequestSchema,
  FolderResponseSchema,
  FolderListResponseSchema,
  FolderDeleteResultSchema,
  TagResponseSchema,
  TagListResponseSchema,
  ItemTagListResponseSchema,
  ItemLinkResponseSchema,
  ItemLinkListResponseSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createFolder,
  getFolder,
  listFolders,
  updateFolder,
  moveFolder,
  reorderFolder,
  archiveFolder,
  pinFolder,
  trashFolder,
  restoreFolder,
  rebalanceSiblings,
  createTag,
  listTags,
  updateTag,
  deleteTag,
  addItemTag,
  removeItemTag,
  listItemTags,
  createItemLink,
  deleteItemLink,
  listItemLinks,
} from '../../modules/organization/service.js';
import { getMutationReceipt, insertMutationReceipt } from '../../modules/sync/repository.js';
import { computeCanonicalPayloadHash } from '../../modules/sync/types.js';
import {
  validateResponse,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../plugins/errorHandler.js';

const FolderParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid(),
});

const TagParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  tagId: z.string().uuid(),
});

const ItemTagParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid(),
  tagId: z.string().uuid().optional(),
});

const ItemLinkParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid(),
});

async function executeDurableRestMutation<T>(
  client: PoolClient,
  request: FastifyRequest,
  workspaceId: string,
  actorUserId: string,
  command: string,
  entityId: string,
  baseRevision: number,
  payload: Record<string, unknown>,
  executor: (operationId: string) => Promise<T>
): Promise<T> {
  const headers = request.headers as Record<string, unknown>;
  const rawOpId = headers['x-operation-id'] || headers['idempotency-key'];
  const hasClientOpId = typeof rawOpId === 'string' && rawOpId.length > 0;
  const operationId = hasClientOpId ? (rawOpId as string) : crypto.randomUUID();
  const rawDevId = headers['x-device-id'];
  const deviceId =
    typeof rawDevId === 'string' && rawDevId.length > 0 ? (rawDevId as string) : 'rest-client';

  const canonicalPayloadHash = computeCanonicalPayloadHash({
    workspaceId,
    command,
    commandVersion: 1,
    schemaVersion: 1,
    entityType: 'folder',
    entityId,
    baseRevision,
    dependencyOperationIds: [],
    payload,
  });

  // Check existing durable receipt
  const existingReceipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
  if (existingReceipt) {
    if (
      existingReceipt.workspaceId !== workspaceId ||
      existingReceipt.canonicalPayloadHash !== canonicalPayloadHash
    ) {
      throw new ConflictError(
        'Operation ID was already used with a different workspace, command, or payload.'
      );
    }
    if (existingReceipt.status === 'accepted') {
      const payload = existingReceipt.resultPayload as unknown as T | { items: T };
      if (
        payload &&
        typeof payload === 'object' &&
        'items' in payload &&
        Array.isArray((payload as { items: unknown }).items)
      ) {
        return (payload as { items: T }).items;
      }
      return payload as T;
    }
    if (existingReceipt.status === 'conflict') {
      const err = existingReceipt.resultPayload?.error as { message?: string } | undefined;
      throw new ConflictError(err?.message || 'Revision conflict');
    }
    const err = existingReceipt.resultPayload?.error as { message?: string } | undefined;
    throw new ValidationError(err?.message || 'Operation rejected');
  }

  try {
    const result = await executor(operationId);
    const finalEntityId =
      entityId ||
      (Array.isArray(result) ? (result[0]?.id ?? '') : ((result as { id?: string }).id ?? ''));
    const finalRevision = Array.isArray(result)
      ? (result[0]?.revision ?? 1)
      : ((result as { revision?: number }).revision ?? 1);

    await insertMutationReceipt(client, {
      workspaceId,
      actorUserId,
      deviceId,
      operationId,
      command,
      entityType: 'folder',
      entityId: finalEntityId,
      schemaVersion: 1,
      baseRevision,
      canonicalPayloadHash,
      status: 'accepted',
      acceptedRevision: finalRevision,
      appliedChangeSeq: null,
      resultPayload: Array.isArray(result)
        ? { items: result }
        : (result as unknown as Record<string, unknown>),
    });
    return result;
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      await insertMutationReceipt(client, {
        workspaceId,
        actorUserId,
        deviceId,
        operationId,
        command,
        entityType: 'folder',
        entityId,
        schemaVersion: 1,
        baseRevision,
        canonicalPayloadHash,
        status: 'conflict',
        acceptedRevision: null,
        appliedChangeSeq: null,
        resultPayload: { error: { code: 'REVISION_CONFLICT', message: err.message } },
      });
    } else if (err instanceof ValidationError) {
      await insertMutationReceipt(client, {
        workspaceId,
        actorUserId,
        deviceId,
        operationId,
        command,
        entityType: 'folder',
        entityId,
        schemaVersion: 1,
        baseRevision,
        canonicalPayloadHash,
        status: 'rejected',
        acceptedRevision: null,
        appliedChangeSeq: null,
        resultPayload: { error: { code: 'VALIDATION_FAILED', message: err.message } },
      });
    }
    throw err;
  }
}

export function registerOrganizationRoutes(app: FastifyInstance, runtimePool: Pool): void {
  // 1. Folders: Create
  app.post('/v1/workspaces/:workspaceId/folders', async (request, reply) => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);
    const body = CreateFolderRequestSchema.parse(request.body);

    const folder = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'createFolder',
          body.id || '',
          0,
          body as unknown as Record<string, unknown>,
          (opId) => createFolder(client, params.workspaceId, actor.userId, body, opId)
        );
      }
    );

    const payload = {
      data: folder,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(201).send(validateResponse(FolderResponseSchema, payload));
  });

  // 2. Folders: List
  app.get('/v1/workspaces/:workspaceId/folders', async (request, reply) => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);

    const folders = await withTenantContext(
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
        return listFolders(client, params.workspaceId);
      }
    );

    const payload = {
      data: folders,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderListResponseSchema, payload));
  });

  // 3. Folders: Get Single
  app.get('/v1/workspaces/:workspaceId/folders/:folderId', async (request, reply) => {
    const actor = request.actor!;
    const params = FolderParamsSchema.parse(request.params);

    const folder = await withTenantContext(
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
        return getFolder(client, params.workspaceId, params.folderId);
      }
    );

    const payload = {
      data: folder,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderResponseSchema, payload));
  });

  // 4. Folders: Update (Rename, Color, Icon)
  app.patch('/v1/workspaces/:workspaceId/folders/:folderId', async (request, reply) => {
    const actor = request.actor!;
    const params = FolderParamsSchema.parse(request.params);
    const body = UpdateFolderRequestSchema.parse(request.body);

    const folder = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'updateFolder',
          params.folderId,
          body.baseRevision,
          body as unknown as Record<string, unknown>,
          (opId) =>
            updateFolder(client, params.workspaceId, actor.userId, params.folderId, body, opId)
        );
      }
    );

    const payload = {
      data: folder,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderResponseSchema, payload));
  });

  // 5. Folders: Move (Reparent)
  app.post('/v1/workspaces/:workspaceId/folders/:folderId/move', async (request, reply) => {
    const actor = request.actor!;
    const params = FolderParamsSchema.parse(request.params);
    const body = MoveFolderRequestSchema.parse(request.body);

    const folder = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'moveFolder',
          params.folderId,
          body.baseRevision,
          body as unknown as Record<string, unknown>,
          (opId) =>
            moveFolder(client, params.workspaceId, actor.userId, params.folderId, body, opId)
        );
      }
    );

    const payload = {
      data: folder,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderResponseSchema, payload));
  });

  // 6. Folders: Reorder
  app.post('/v1/workspaces/:workspaceId/folders/:folderId/reorder', async (request, reply) => {
    const actor = request.actor!;
    const params = FolderParamsSchema.parse(request.params);
    const body = ReorderFolderRequestSchema.parse(request.body);

    const folder = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'reorderFolder',
          params.folderId,
          body.baseRevision,
          body as unknown as Record<string, unknown>,
          (opId) =>
            reorderFolder(client, params.workspaceId, actor.userId, params.folderId, body, opId)
        );
      }
    );

    const payload = {
      data: folder,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderResponseSchema, payload));
  });

  // 7. Folders: Archive
  app.post('/v1/workspaces/:workspaceId/folders/:folderId/archive', async (request, reply) => {
    const actor = request.actor!;
    const params = FolderParamsSchema.parse(request.params);
    const body = ArchiveFolderRequestSchema.parse(request.body);

    const folder = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'archiveFolder',
          params.folderId,
          body.baseRevision,
          body as unknown as Record<string, unknown>,
          (opId) =>
            archiveFolder(client, params.workspaceId, actor.userId, params.folderId, body, opId)
        );
      }
    );

    const payload = {
      data: folder,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderResponseSchema, payload));
  });

  // 8. Folders: Pin
  app.post('/v1/workspaces/:workspaceId/folders/:folderId/pin', async (request, reply) => {
    const actor = request.actor!;
    const params = FolderParamsSchema.parse(request.params);
    const body = PinFolderRequestSchema.parse(request.body);

    const folder = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'pinFolder',
          params.folderId,
          body.baseRevision,
          body as unknown as Record<string, unknown>,
          (opId) => pinFolder(client, params.workspaceId, actor.userId, params.folderId, body, opId)
        );
      }
    );

    const payload = {
      data: folder,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderResponseSchema, payload));
  });

  // 9. Folders: Trash (Delete with policy: 'preserve_to_parent' | 'trash_subtree')
  app.post('/v1/workspaces/:workspaceId/folders/:folderId/trash', async (request, reply) => {
    const actor = request.actor!;
    const params = FolderParamsSchema.parse(request.params);
    const body = DeleteFolderRequestSchema.parse(request.body);

    const result = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'trashFolder',
          params.folderId,
          body.baseRevision,
          body as unknown as Record<string, unknown>,
          (opId) =>
            trashFolder(
              client,
              params.workspaceId,
              actor.userId,
              params.folderId,
              body.policy,
              body.baseRevision,
              opId
            )
        );
      }
    );

    const payload = {
      data: result,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderDeleteResultSchema, payload));
  });

  // 10. Folders: Restore
  app.post('/v1/workspaces/:workspaceId/folders/:folderId/restore', async (request, reply) => {
    const actor = request.actor!;
    const params = FolderParamsSchema.parse(request.params);
    const body = RestoreFolderRequestSchema.parse(request.body);

    const folder = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'restoreFolder',
          params.folderId,
          body.baseRevision,
          body as unknown as Record<string, unknown>,
          (opId) =>
            restoreFolder(
              client,
              params.workspaceId,
              actor.userId,
              params.folderId,
              body.baseRevision,
              body,
              opId
            )
        );
      }
    );

    const payload = {
      data: folder,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(FolderResponseSchema, payload));
  });

  // 11. Folders: Rebalance Siblings
  app.post('/v1/workspaces/:workspaceId/folders/rebalance', async (request, reply) => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);
    const body = RebalanceSiblingsRequestSchema.parse(request.body);

    const result = await withTenantContext(
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
        return executeDurableRestMutation(
          client,
          request,
          params.workspaceId,
          actor.userId,
          'rebalanceSiblings',
          body.parentId || params.workspaceId,
          body.expectedCollectionRevision ?? 0,
          body as unknown as Record<string, unknown>,
          (opId) =>
            rebalanceSiblings(
              client,
              params.workspaceId,
              actor.userId,
              body.parentId || null,
              body.siblingIds,
              body.expectedCollectionRevision,
              opId
            )
        );
      }
    );

    return reply.status(200).send({
      data: result,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    });
  });

  // ----------------- TAG ROUTES -----------------
  app.post('/v1/workspaces/:workspaceId/tags', async (request, reply) => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);
    const body = CreateTagRequestSchema.parse(request.body);

    const tag = await withTenantContext(
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
        return createTag(client, params.workspaceId, actor.userId, body);
      }
    );

    const payload = {
      data: tag,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(201).send(validateResponse(TagResponseSchema, payload));
  });

  app.get('/v1/workspaces/:workspaceId/tags', async (request, reply) => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);

    const tags = await withTenantContext(
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
        return listTags(client, params.workspaceId);
      }
    );

    const payload = {
      data: tags,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(TagListResponseSchema, payload));
  });

  app.patch('/v1/workspaces/:workspaceId/tags/:tagId', async (request, reply) => {
    const actor = request.actor!;
    const params = TagParamsSchema.parse(request.params);
    const body = UpdateTagRequestSchema.parse(request.body);

    const tag = await withTenantContext(
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
        return updateTag(client, params.workspaceId, actor.userId, params.tagId, body);
      }
    );

    const payload = {
      data: tag,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(TagResponseSchema, payload));
  });

  app.delete('/v1/workspaces/:workspaceId/tags/:tagId', async (request, reply) => {
    const actor = request.actor!;
    const params = TagParamsSchema.parse(request.params);

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
        return deleteTag(client, params.workspaceId, params.tagId);
      }
    );

    return reply.status(204).send();
  });

  // ----------------- ITEM TAGS -----------------
  app.post('/v1/workspaces/:workspaceId/items/:itemId/tags', async (request, reply) => {
    const actor = request.actor!;
    const params = ItemTagParamsSchema.parse(request.params);
    const body = AddItemTagRequestSchema.parse(request.body);

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
        return addItemTag(client, params.workspaceId, actor.userId, params.itemId, body.tagId);
      }
    );

    return reply.status(204).send();
  });

  app.delete('/v1/workspaces/:workspaceId/items/:itemId/tags/:tagId', async (request, reply) => {
    const actor = request.actor!;
    const params = ItemTagParamsSchema.parse(request.params);

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
        return removeItemTag(client, params.workspaceId, params.itemId, params.tagId!);
      }
    );

    return reply.status(204).send();
  });

  app.get('/v1/workspaces/:workspaceId/items/:itemId/tags', async (request, reply) => {
    const actor = request.actor!;
    const params = ItemTagParamsSchema.parse(request.params);

    const tags = await withTenantContext(
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
        return listItemTags(client, params.workspaceId, params.itemId);
      }
    );

    const payload = {
      data: tags,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(ItemTagListResponseSchema, payload));
  });

  // ----------------- ITEM LINKS -----------------
  app.post('/v1/workspaces/:workspaceId/items/:itemId/links', async (request, reply) => {
    const actor = request.actor!;
    const params = ItemLinkParamsSchema.parse(request.params);
    const body = CreateItemLinkRequestSchema.parse(request.body);

    const link = await withTenantContext(
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
        return createItemLink(client, params.workspaceId, actor.userId, params.itemId, body);
      }
    );

    const payload = {
      data: link,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(201).send(validateResponse(ItemLinkResponseSchema, payload));
  });

  app.delete('/v1/workspaces/:workspaceId/items/:itemId/links', async (request, reply) => {
    const actor = request.actor!;
    const params = ItemLinkParamsSchema.parse(request.params);
    const query = z
      .object({
        targetItemId: z.string().uuid(),
        linkType: z.string().optional(),
      })
      .parse(request.query);

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
        return deleteItemLink(
          client,
          params.workspaceId,
          params.itemId,
          query.targetItemId,
          query.linkType
        );
      }
    );

    return reply.status(204).send();
  });

  app.get('/v1/workspaces/:workspaceId/items/:itemId/links', async (request, reply) => {
    const actor = request.actor!;
    const params = ItemLinkParamsSchema.parse(request.params);

    const links = await withTenantContext(
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
        return listItemLinks(client, params.workspaceId, params.itemId);
      }
    );

    const payload = {
      data: links,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    };
    return reply.status(200).send(validateResponse(ItemLinkListResponseSchema, payload));
  });
}
