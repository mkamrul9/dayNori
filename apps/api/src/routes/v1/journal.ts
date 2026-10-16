import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateJournalEntryRequestSchema,
  UpdateJournalEntryRequestSchema,
  JournalEntryListQuerySchema,
  JournalEntryResponseSchema,
  JournalEntryListResponseSchema,
  WorkspaceParamsSchema,
  type JournalEntry,
} from '@daynori/contracts';
import { getReflectionTemplates } from '@daynori/domain';
import { withTenantContext } from '../../db/index.js';
import {
  createJournalEntry,
  getJournalEntry,
  listJournalEntries,
  updateJournalEntry,
  trashJournalEntry,
  restoreJournalEntry,
} from '../../modules/journal/service.js';
import {
  getMutationReceipt,
  insertMutationReceipt,
  lockWorkspaceSyncState,
} from '../../modules/sync/repository.js';
import { computeCanonicalPayloadHash } from '../../modules/sync/types.js';
import { validateResponse, ConflictError, NotFoundError } from '../../plugins/errorHandler.js';

const JournalParamsSchema = WorkspaceParamsSchema.extend({
  journalId: z.string().uuid(),
});

const TrashRestoreRequestSchema = z
  .object({
    baseRevision: z.number().int().nonnegative().optional(),
  })
  .strict()
  .optional();

export function registerJournalRoutes(app: FastifyInstance, pool: Pool): void {
  // 1. Get Reflection Templates (non-clinical prompt starters)
  app.get(
    '/v1/workspaces/:workspaceId/journal/templates',
    async (_request: FastifyRequest, reply) => {
      const templates = getReflectionTemplates();
      return reply.status(200).send({
        data: templates,
        meta: { requestId: _request.id, serverTime: new Date().toISOString() },
      });
    }
  );

  // 2. Create Journal Entry
  app.post('/v1/workspaces/:workspaceId/journal', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const parsedBody = CreateJournalEntryRequestSchema.parse(request.body);
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
          command: 'createJournalEntry',
          commandVersion: 1,
          schemaVersion: 1,
          entityType: 'journal_entry',
          entityId: parsedBody.id || operationId,
          baseRevision: 0,
          payload: parsedBody as Record<string, unknown>,
        });

        // Optimistic check before lock
        const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (receipt) {
          if (receipt.canonicalPayloadHash !== payloadHash) {
            throw new ConflictError(
              'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
            );
          }
          if (receipt.status === 'accepted') {
            const durableEntry = receipt.resultPayload?.entry as JournalEntry | undefined;
            return reply.status(200).send(
              validateResponse(JournalEntryResponseSchema, {
                data:
                  durableEntry || (await getJournalEntry(client, workspaceId, receipt.entityId)),
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }
        }

        // Lock workspace row to prevent concurrent race conditions
        await lockWorkspaceSyncState(client, workspaceId);

        // Recheck under row lock
        const lockedReceipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
        if (lockedReceipt) {
          if (lockedReceipt.canonicalPayloadHash !== payloadHash) {
            throw new ConflictError(
              'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
            );
          }
          if (lockedReceipt.status === 'accepted') {
            const durableEntry = lockedReceipt.resultPayload?.entry as JournalEntry | undefined;
            return reply.status(200).send(
              validateResponse(JournalEntryResponseSchema, {
                data:
                  durableEntry ||
                  (await getJournalEntry(client, workspaceId, lockedReceipt.entityId)),
                meta: { requestId: request.id, serverTime: new Date().toISOString() },
              })
            );
          }
        }

        const result = await createJournalEntry(
          client,
          workspaceId,
          actorUserId,
          parsedBody,
          operationId
        );

        await insertMutationReceipt(client, {
          workspaceId,
          actorUserId,
          deviceId,
          operationId,
          command: 'createJournalEntry',
          entityType: 'journal_entry',
          entityId: result.id,
          schemaVersion: 1,
          baseRevision: 0,
          canonicalPayloadHash: payloadHash,
          status: 'accepted',
          acceptedRevision: result.serverRevision,
          appliedChangeSeq: result.seq,
          resultPayload: { entry: result },
        });

        return reply.status(201).send(
          validateResponse(JournalEntryResponseSchema, {
            data: result,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      }

      const result = await createJournalEntry(client, workspaceId, actorUserId, parsedBody);
      return reply.status(201).send(
        validateResponse(JournalEntryResponseSchema, {
          data: result,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 3. List Journal Entries
  app.get('/v1/workspaces/:workspaceId/journal', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    }
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = JournalEntryListQuerySchema.parse(request.query);
    const actorUserId = actor.userId;

    return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const result = await listJournalEntries(client, workspaceId, query);
      return reply.status(200).send(
        validateResponse(JournalEntryListResponseSchema, {
          data: result.entries,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
            cursor: result.nextCursor,
            hasMore: Boolean(result.nextCursor),
          },
        })
      );
    });
  });

  // 4. Get Journal Entry
  app.get(
    '/v1/workspaces/:workspaceId/journal/:journalId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, journalId } = JournalParamsSchema.parse(request.params);
      const actorUserId = actor.userId;

      return withTenantContext(pool, { userId: actorUserId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const entry = await getJournalEntry(client, workspaceId, journalId);
        return reply.status(200).send(
          validateResponse(JournalEntryResponseSchema, {
            data: entry,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 5. Update Journal Entry
  app.patch(
    '/v1/workspaces/:workspaceId/journal/:journalId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, journalId } = JournalParamsSchema.parse(request.params);
      const parsedBody = UpdateJournalEntryRequestSchema.parse(request.body);
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
            command: 'updateJournalEntry',
            commandVersion: 1,
            schemaVersion: 1,
            entityType: 'journal_entry',
            entityId: journalId,
            baseRevision: parsedBody.baseRevision ?? 0,
            payload: parsedBody as Record<string, unknown>,
          });

          // Optimistic receipt check
          const receipt = await getMutationReceipt(client, actorUserId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            if (receipt.status === 'accepted') {
              const durableEntry = receipt.resultPayload?.entry as JournalEntry | undefined;
              return reply.status(200).send(
                validateResponse(JournalEntryResponseSchema, {
                  data: durableEntry || (await getJournalEntry(client, workspaceId, journalId)),
                  meta: { requestId: request.id, serverTime: new Date().toISOString() },
                })
              );
            }
          }

          // Row lock
          await lockWorkspaceSyncState(client, workspaceId);

          const lockedReceipt = await getMutationReceipt(
            client,
            actorUserId,
            deviceId,
            operationId
          );
          if (lockedReceipt) {
            if (lockedReceipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            if (lockedReceipt.status === 'accepted') {
              const durableEntry = lockedReceipt.resultPayload?.entry as JournalEntry | undefined;
              return reply.status(200).send(
                validateResponse(JournalEntryResponseSchema, {
                  data: durableEntry || (await getJournalEntry(client, workspaceId, journalId)),
                  meta: { requestId: request.id, serverTime: new Date().toISOString() },
                })
              );
            }
          }

          const result = await updateJournalEntry(
            client,
            workspaceId,
            journalId,
            actorUserId,
            parsedBody,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId,
            deviceId,
            operationId,
            command: 'updateJournalEntry',
            entityType: 'journal_entry',
            entityId: journalId,
            schemaVersion: 1,
            baseRevision: parsedBody.baseRevision ?? 0,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: result.serverRevision,
            appliedChangeSeq: result.seq,
            resultPayload: { entry: result },
          });

          return reply.status(200).send(
            validateResponse(JournalEntryResponseSchema, {
              data: result,
              meta: { requestId: request.id, serverTime: new Date().toISOString() },
            })
          );
        }

        const result = await updateJournalEntry(
          client,
          workspaceId,
          journalId,
          actorUserId,
          parsedBody
        );

        return reply.status(200).send(
          validateResponse(JournalEntryResponseSchema, {
            data: result,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 6. Trash Journal Entry
  app.post(
    '/v1/workspaces/:workspaceId/journal/:journalId/trash',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, journalId } = JournalParamsSchema.parse(request.params);
      const parsedBody = TrashRestoreRequestSchema.parse(request.body);
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

        const result = await trashJournalEntry(
          client,
          workspaceId,
          journalId,
          actorUserId,
          parsedBody?.baseRevision,
          operationId
        );

        return reply.status(200).send({
          data: { success: true, revision: result.revision },
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        });
      });
    }
  );

  // 7. Restore Journal Entry
  app.post(
    '/v1/workspaces/:workspaceId/journal/:journalId/restore',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
      }
      const { workspaceId, journalId } = JournalParamsSchema.parse(request.params);
      const parsedBody = TrashRestoreRequestSchema.parse(request.body);
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

        const result = await restoreJournalEntry(
          client,
          workspaceId,
          journalId,
          actorUserId,
          parsedBody?.baseRevision,
          operationId
        );

        return reply.status(200).send({
          data: { success: true, revision: result.revision },
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        });
      });
    }
  );
}
