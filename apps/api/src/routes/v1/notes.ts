import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import {
  CreateNoteRequestSchema,
  UpdateNoteRequestSchema,
  NoteParamsSchema,
  NoteListQuerySchema,
  NoteResponseSchema,
  NoteListResponseSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createNote,
  getNote,
  listNotes,
  updateNote,
  trashNote,
  restoreNote,
} from '../../modules/notes/service.js';
import { getMutationReceipt, insertMutationReceipt } from '../../modules/sync/repository.js';
import { computeCanonicalPayloadHash } from '../../modules/sync/types.js';
import { validateResponse, ConflictError, NotFoundError } from '../../plugins/errorHandler.js';

export function registerNoteRoutes(app: FastifyInstance, pool: Pool): void {
  // 1. Create Note
  app.post('/v1/workspaces/:workspaceId/notes', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const parsedBody = CreateNoteRequestSchema.parse(request.body);
    const actorUserId = actor.userId;
    const operationId = request.headers['x-operation-id'] as string | undefined;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      if (operationId) {
        const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';
        const payloadHash = computeCanonicalPayloadHash({
          workspaceId,
          command: 'createNote',
          commandVersion: 1,
          schemaVersion: 1,
          entityType: 'item',
          entityId: parsedBody.id || operationId,
          baseRevision: 0,
          payload: parsedBody as Record<string, unknown>,
        });

        const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (receipt) {
          if (receipt.canonicalPayloadHash !== payloadHash) {
            throw new ConflictError(
              'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
            );
          }
          if (receipt.status === 'accepted') {
            const note = await getNote(client, workspaceId, receipt.entityId);
            return reply.status(200).send(
              validateResponse(NoteResponseSchema, {
                data: note,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }
        }

        const note = await createNote(client, workspaceId, actorUserId, parsedBody, operationId);

        await insertMutationReceipt(client, {
          workspaceId,
          actorUserId,
          deviceId,
          operationId,
          command: 'createNote',
          entityType: 'item',
          entityId: note.id,
          schemaVersion: 1,
          baseRevision: 0,
          canonicalPayloadHash: payloadHash,
          status: 'accepted',
          acceptedRevision: note.revision,
          appliedChangeSeq: null,
          resultPayload: { noteId: note.id },
        });

        return reply.status(201).send(
          validateResponse(NoteResponseSchema, {
            data: note,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      }

      const note = await createNote(client, workspaceId, actorUserId, parsedBody);
      return reply.status(201).send(
        validateResponse(NoteResponseSchema, {
          data: note,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 2. List Notes
  app.get('/v1/workspaces/:workspaceId/notes', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = NoteListQuerySchema.parse(request.query);
    const actorUserId = actor.userId;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const notes = await listNotes(client, workspaceId, query);
      return reply.status(200).send(
        validateResponse(NoteListResponseSchema, {
          data: notes,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 3. Get Note by ID
  app.get('/v1/workspaces/:workspaceId/notes/:noteId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId, noteId } = NoteParamsSchema.parse(request.params);
    const actorUserId = actor.userId;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const note = await getNote(client, workspaceId, noteId);
      return reply.status(200).send(
        validateResponse(NoteResponseSchema, {
          data: note,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 4. Update Note
  app.patch('/v1/workspaces/:workspaceId/notes/:noteId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId, noteId } = NoteParamsSchema.parse(request.params);
    const parsedBody = UpdateNoteRequestSchema.parse(request.body);
    const actorUserId = actor.userId;
    const operationId = request.headers['x-operation-id'] as string | undefined;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      if (operationId) {
        const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';
        const payloadHash = computeCanonicalPayloadHash({
          workspaceId,
          command: 'updateNote',
          commandVersion: 1,
          schemaVersion: 1,
          entityType: 'item',
          entityId: noteId,
          baseRevision: parsedBody.baseRevision,
          payload: parsedBody as Record<string, unknown>,
        });

        const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (receipt) {
          if (receipt.canonicalPayloadHash !== payloadHash) {
            throw new ConflictError(
              'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
            );
          }
          if (receipt.status === 'accepted') {
            const note = await getNote(client, workspaceId, noteId);
            return reply.status(200).send(
              validateResponse(NoteResponseSchema, {
                data: note,
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }
        }

        const note = await updateNote(
          client,
          workspaceId,
          noteId,
          actorUserId,
          parsedBody,
          operationId
        );

        await insertMutationReceipt(client, {
          workspaceId,
          actorUserId,
          deviceId,
          operationId,
          command: 'updateNote',
          entityType: 'item',
          entityId: note.id,
          schemaVersion: 1,
          baseRevision: parsedBody.baseRevision,
          canonicalPayloadHash: payloadHash,
          status: 'accepted',
          acceptedRevision: note.revision,
          appliedChangeSeq: null,
          resultPayload: { noteId: note.id },
        });

        return reply.status(200).send(
          validateResponse(NoteResponseSchema, {
            data: note,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      }

      const note = await updateNote(client, workspaceId, noteId, actorUserId, parsedBody);
      return reply.status(200).send(
        validateResponse(NoteResponseSchema, {
          data: note,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 5. Trash Note
  app.post(
    '/v1/workspaces/:workspaceId/notes/:noteId/trash',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, noteId } = NoteParamsSchema.parse(request.params);
      const actorUserId = actor.userId;
      const operationId = request.headers['x-operation-id'] as string | undefined;

      return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const result = await trashNote(client, workspaceId, noteId, actorUserId, operationId);
        return reply.status(200).send({
          data: result,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        });
      });
    }
  );

  // 6. Restore Note
  app.post(
    '/v1/workspaces/:workspaceId/notes/:noteId/restore',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, noteId } = NoteParamsSchema.parse(request.params);
      const actorUserId = actor.userId;
      const operationId = request.headers['x-operation-id'] as string | undefined;

      return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const note = await restoreNote(client, workspaceId, noteId, actorUserId, operationId);
        return reply.status(200).send(
          validateResponse(NoteResponseSchema, {
            data: note,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );
}
