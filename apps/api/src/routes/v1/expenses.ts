import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  WorkspaceParamsSchema,
  CreateExpenseCategoryBodySchema,
  UpdateExpenseCategoryBodySchema,
  ExpenseCategoryResponseSchema,
  ExpenseCategoryListResponseSchema,
  CreateExpenseBodySchema,
  UpdateExpenseBodySchema,
  ExpenseListQuerySchema,
  ExpenseResponseSchema,
  ExpenseListResponseSchema,
  ExpenseMonthlySummaryResponseSchema,
  CreateExpenseRecurringTemplateBodySchema,
  ExpenseRecurringTemplateResponseSchema,
  ExpenseRecurringTemplateListResponseSchema,
  GenerateOccurrencesBodySchema,
  CreateExpenseBudgetBodySchema,
  UpdateExpenseBudgetBodySchema,
  ExpenseBudgetResponseSchema,
  ExpenseBudgetListResponseSchema,
  ExpenseExportQuerySchema,
  type ExpenseCategory,
  type ExpenseItem,
  type ExpenseRecurringTemplate,
  type ExpenseBudget,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
  deleteExpenseCategory,
  createExpenseRecord,
  getExpenseRecord,
  listExpenseRecords,
  updateExpenseRecord,
  trashExpenseRecord,
  restoreExpenseRecord,
  getExpenseMonthlySummary,
  createExpenseRecurringTemplate,
  listExpenseRecurringTemplates,
  generateRecurringOccurrences,
  createExpenseBudget,
  listExpenseBudgets,
  updateExpenseBudget,
  deleteExpenseBudget,
  exportExpensesCsv,
} from '../../modules/expenses/service.js';
import { computeCanonicalPayloadHash } from '../../modules/sync/types.js';
import {
  getMutationReceipt,
  insertMutationReceipt,
  lockWorkspaceSyncState,
} from '../../modules/sync/repository.js';
import { ConflictError, NotFoundError, validateResponse } from '../../plugins/errorHandler.js';

const CategoryParamsSchema = WorkspaceParamsSchema.extend({
  categoryId: z.string().uuid(),
});

const ExpenseParamsSchema = WorkspaceParamsSchema.extend({
  expenseId: z.string().uuid(),
});

const BudgetParamsSchema = WorkspaceParamsSchema.extend({
  budgetId: z.string().uuid(),
});

const SummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});

const BudgetListQuerySchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  currency: z.string().min(3).max(3).optional(),
});

export function registerExpenseRoutes(app: FastifyInstance, pool: Pool): void {
  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  app.post(
    '/v1/workspaces/:workspaceId/expenses/categories',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = CreateExpenseCategoryBodySchema.parse(request.body);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const category = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'createExpenseCategory',
              schemaVersion: 1,
              entityType: 'expense_category',
              entityId: operationId,
              baseRevision: 0,
              payload: body as unknown as Record<string, unknown>,
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return (receipt.resultPayload as { category: ExpenseCategory }).category;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const created = await createExpenseCategory(client, workspaceId, body, operationId);

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'createExpenseCategory',
              entityType: 'expense_category',
              entityId: created.id,
              schemaVersion: 1,
              baseRevision: 0,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: 1,
              appliedChangeSeq: created.seq ?? null,
              resultPayload: { category: created },
            });

            return created;
          }

          return createExpenseCategory(client, workspaceId, body);
        }
      );

      const response = validateResponse(ExpenseCategoryResponseSchema, {
        data: category,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(201).send(response);
    }
  );

  app.get(
    '/v1/workspaces/:workspaceId/expenses/categories',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);

      const categories = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          return listExpenseCategories(client, workspaceId);
        }
      );

      const response = validateResponse(ExpenseCategoryListResponseSchema, {
        data: categories,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(200).send(response);
    }
  );

  app.patch(
    '/v1/workspaces/:workspaceId/expenses/categories/:categoryId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId, categoryId } = CategoryParamsSchema.parse(request.params);
      const body = UpdateExpenseCategoryBodySchema.parse(request.body);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const category = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'updateExpenseCategory',
              schemaVersion: 1,
              entityType: 'expense_category',
              entityId: categoryId,
              baseRevision: 1,
              payload: body as unknown as Record<string, unknown>,
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return (receipt.resultPayload as { category: ExpenseCategory }).category;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const updated = await updateExpenseCategory(
              client,
              workspaceId,
              categoryId,
              body,
              operationId
            );

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'updateExpenseCategory',
              entityType: 'expense_category',
              entityId: categoryId,
              schemaVersion: 1,
              baseRevision: 1,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: 2,
              appliedChangeSeq: updated.seq ?? null,
              resultPayload: { category: updated },
            });

            return updated;
          }

          return updateExpenseCategory(client, workspaceId, categoryId, body);
        }
      );

      const response = validateResponse(ExpenseCategoryResponseSchema, {
        data: category,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(200).send(response);
    }
  );

  app.delete(
    '/v1/workspaces/:workspaceId/expenses/categories/:categoryId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId, categoryId } = CategoryParamsSchema.parse(request.params);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const result = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'trashExpenseCategory',
              schemaVersion: 1,
              entityType: 'expense_category',
              entityId: categoryId,
              baseRevision: 1,
              payload: {},
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return receipt.resultPayload;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const deleted = await deleteExpenseCategory(client, workspaceId, categoryId, operationId);

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'trashExpenseCategory',
              entityType: 'expense_category',
              entityId: categoryId,
              schemaVersion: 1,
              baseRevision: 1,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: 2,
              appliedChangeSeq: deleted.seq ?? null,
              resultPayload: deleted,
            });

            return deleted;
          }

          return deleteExpenseCategory(client, workspaceId, categoryId);
        }
      );

      return reply.status(200).send({
        data: result,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Expense Records
  // ---------------------------------------------------------------------------

  app.post('/v1/workspaces/:workspaceId/expenses', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const body = CreateExpenseBodySchema.parse(request.body);
    const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
    const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
    const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

    const created = await withTenantContext(
      pool,
      { workspaceId, userId: actor.userId },
      async (client) => {
        if (operationId) {
          const payloadHash = computeCanonicalPayloadHash({
            workspaceId,
            command: 'createExpense',
            schemaVersion: 1,
            entityType: 'expense',
            entityId: operationId,
            baseRevision: 0,
            payload: body as unknown as Record<string, unknown>,
          });

          const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
          if (receipt) {
            if (receipt.canonicalPayloadHash !== payloadHash) {
              throw new ConflictError(
                'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
              );
            }
            if (receipt.status === 'accepted') {
              const durableExpense = (receipt.resultPayload as { expense: ExpenseItem }).expense;
              return (
                durableExpense || (await getExpenseRecord(client, workspaceId, receipt.entityId))
              );
            }
          }

          await lockWorkspaceSyncState(client, workspaceId);
          const res = await createExpenseRecord(
            client,
            workspaceId,
            actor.userId,
            body,
            operationId
          );

          await insertMutationReceipt(client, {
            workspaceId,
            actorUserId: actor.userId,
            deviceId,
            operationId,
            command: 'createExpense',
            entityType: 'expense',
            entityId: res.id,
            schemaVersion: 1,
            baseRevision: 0,
            canonicalPayloadHash: payloadHash,
            status: 'accepted',
            acceptedRevision: 1,
            appliedChangeSeq: res.seq,
            resultPayload: { expense: res },
          });

          return res;
        }

        return createExpenseRecord(client, workspaceId, actor.userId, body);
      }
    );

    const response = validateResponse(ExpenseResponseSchema, {
      data: created,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
    });

    return reply.status(201).send(response);
  });

  app.get('/v1/workspaces/:workspaceId/expenses', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = ExpenseListQuerySchema.parse(request.query);

    const { items, nextCursor, hasMore } = await withTenantContext(
      pool,
      { workspaceId, userId: actor.userId },
      async (client) => {
        return listExpenseRecords(client, workspaceId, query);
      }
    );

    const response = validateResponse(ExpenseListResponseSchema, {
      data: items,
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
        pagination: { nextCursor, hasMore },
      },
    });

    return reply.status(200).send(response);
  });

  app.get(
    '/v1/workspaces/:workspaceId/expenses/summary',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const { year, month } = SummaryQuerySchema.parse(request.query);

      const summary = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          const accessRes = await client.query<{ exists: boolean }>(
            `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
            [workspaceId]
          );
          if (!accessRes.rows[0]?.exists) {
            throw new NotFoundError('Workspace not found or unauthorized');
          }
          return getExpenseMonthlySummary(client, workspaceId, year, month);
        }
      );

      const response = validateResponse(ExpenseMonthlySummaryResponseSchema, {
        data: summary,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(200).send(response);
    }
  );

  app.get(
    '/v1/workspaces/:workspaceId/expenses/:expenseId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId, expenseId } = ExpenseParamsSchema.parse(request.params);

      const item = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          return getExpenseRecord(client, workspaceId, expenseId);
        }
      );

      const response = validateResponse(ExpenseResponseSchema, {
        data: item,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(200).send(response);
    }
  );

  app.patch(
    '/v1/workspaces/:workspaceId/expenses/:expenseId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId, expenseId } = ExpenseParamsSchema.parse(request.params);
      const body = UpdateExpenseBodySchema.parse(request.body);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const updated = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          const currentRecord = await getExpenseRecord(client, workspaceId, expenseId);
          const baseRev = body.baseRevision ?? body.expectedRevision ?? currentRecord.revision;

          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'updateExpense',
              schemaVersion: 1,
              entityType: 'expense',
              entityId: expenseId,
              baseRevision: baseRev,
              payload: body as unknown as Record<string, unknown>,
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                const durableExpense = (receipt.resultPayload as { expense: ExpenseItem }).expense;
                return (
                  durableExpense || (await getExpenseRecord(client, workspaceId, expenseId))
                );
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const res = await updateExpenseRecord(
              client,
              workspaceId,
              expenseId,
              actor.userId,
              body,
              operationId
            );

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'updateExpense',
              entityType: 'expense',
              entityId: expenseId,
              schemaVersion: 1,
              baseRevision: baseRev,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: res.revision,
              appliedChangeSeq: res.seq,
              resultPayload: { expense: res },
            });

            return res;
          }

          return updateExpenseRecord(
            client,
            workspaceId,
            expenseId,
            actor.userId,
            body
          );
        }
      );

      const response = validateResponse(ExpenseResponseSchema, {
        data: updated,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(200).send(response);
    }
  );

  app.post(
    '/v1/workspaces/:workspaceId/expenses/:expenseId/trash',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId, expenseId } = ExpenseParamsSchema.parse(request.params);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const result = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          const currentRecord = await getExpenseRecord(client, workspaceId, expenseId);
          const baseRev = currentRecord.revision;

          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'trashExpense',
              schemaVersion: 1,
              entityType: 'expense',
              entityId: expenseId,
              baseRevision: baseRev,
              payload: {},
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return receipt.resultPayload;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const res = await trashExpenseRecord(
              client,
              workspaceId,
              expenseId,
              actor.userId,
              operationId
            );

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'trashExpense',
              entityType: 'expense',
              entityId: expenseId,
              schemaVersion: 1,
              baseRevision: baseRev,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: res.revision,
              appliedChangeSeq: res.seq,
              resultPayload: res,
            });

            return res;
          }

          return trashExpenseRecord(client, workspaceId, expenseId, actor.userId);
        }
      );

      return reply.status(200).send({
        data: result,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    }
  );

  app.post(
    '/v1/workspaces/:workspaceId/expenses/:expenseId/restore',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId, expenseId } = ExpenseParamsSchema.parse(request.params);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const result = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          const currentRecord = await getExpenseRecord(client, workspaceId, expenseId);
          const baseRev = currentRecord.revision;

          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'restoreExpense',
              schemaVersion: 1,
              entityType: 'expense',
              entityId: expenseId,
              baseRevision: baseRev,
              payload: {},
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return receipt.resultPayload;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const res = await restoreExpenseRecord(
              client,
              workspaceId,
              expenseId,
              actor.userId,
              operationId
            );

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'restoreExpense',
              entityType: 'expense',
              entityId: expenseId,
              schemaVersion: 1,
              baseRevision: baseRev,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: res.revision,
              appliedChangeSeq: res.seq,
              resultPayload: res,
            });

            return res;
          }

          return restoreExpenseRecord(client, workspaceId, expenseId, actor.userId);
        }
      );

      return reply.status(200).send({
        data: result,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // CSV Export (Phase 40)
  // ---------------------------------------------------------------------------

  app.get(
    '/v1/workspaces/:workspaceId/expenses/export',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const query = ExpenseExportQuerySchema.parse(request.query);

      const csvData = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          const accessRes = await client.query<{ exists: boolean }>(
            `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
            [workspaceId]
          );
          if (!accessRes.rows[0]?.exists) {
            throw new NotFoundError('Workspace not found or unauthorized');
          }
          return exportExpensesCsv(client, workspaceId, query);
        }
      );

      const filename = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .status(200)
        .send(csvData);
    }
  );

  // ---------------------------------------------------------------------------
  // Recurring Templates
  // ---------------------------------------------------------------------------

  app.post(
    '/v1/workspaces/:workspaceId/expenses/recurring',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = CreateExpenseRecurringTemplateBodySchema.parse(request.body);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const template = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'createExpenseRecurringTemplate',
              schemaVersion: 1,
              entityType: 'expense_recurring_template',
              entityId: operationId,
              baseRevision: 0,
              payload: body as unknown as Record<string, unknown>,
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return (receipt.resultPayload as { template: ExpenseRecurringTemplate }).template;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const res = await createExpenseRecurringTemplate(
              client,
              workspaceId,
              body,
              operationId
            );

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'createExpenseRecurringTemplate',
              entityType: 'expense_recurring_template',
              entityId: res.id,
              schemaVersion: 1,
              baseRevision: 0,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: 1,
              appliedChangeSeq: res.seq ?? null,
              resultPayload: { template: res },
            });

            return res;
          }

          return createExpenseRecurringTemplate(client, workspaceId, body);
        }
      );

      const response = validateResponse(ExpenseRecurringTemplateResponseSchema, {
        data: template,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(201).send(response);
    }
  );

  app.get(
    '/v1/workspaces/:workspaceId/expenses/recurring',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);

      const templates = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          return listExpenseRecurringTemplates(client, workspaceId);
        }
      );

      const response = validateResponse(ExpenseRecurringTemplateListResponseSchema, {
        data: templates,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(200).send(response);
    }
  );

  app.post(
    '/v1/workspaces/:workspaceId/expenses/recurring/generate',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const { untilDate } = GenerateOccurrencesBodySchema.parse(request.body);

      const result = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          return generateRecurringOccurrences(client, workspaceId, actor.userId, untilDate);
        }
      );

      return reply.status(200).send({
        data: result,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Budgets (Phase 40)
  // ---------------------------------------------------------------------------

  app.post(
    '/v1/workspaces/:workspaceId/expenses/budgets',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = CreateExpenseBudgetBodySchema.parse(request.body);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const budget = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'createExpenseBudget',
              schemaVersion: 1,
              entityType: 'expense_budget',
              entityId: operationId,
              baseRevision: 0,
              payload: body as unknown as Record<string, unknown>,
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return (receipt.resultPayload as { budget: ExpenseBudget }).budget;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const created = await createExpenseBudget(client, workspaceId, body, operationId);

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'createExpenseBudget',
              entityType: 'expense_budget',
              entityId: created.id,
              schemaVersion: 1,
              baseRevision: 0,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: 1,
              appliedChangeSeq: created.seq ?? null,
              resultPayload: { budget: created },
            });

            return created;
          }

          return createExpenseBudget(client, workspaceId, body);
        }
      );

      const response = validateResponse(ExpenseBudgetResponseSchema, {
        data: budget,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(201).send(response);
    }
  );

  app.get(
    '/v1/workspaces/:workspaceId/expenses/budgets',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const query = BudgetListQuerySchema.parse(request.query);

      const budgets = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          const accessRes = await client.query<{ exists: boolean }>(
            `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
            [workspaceId]
          );
          if (!accessRes.rows[0]?.exists) {
            throw new NotFoundError('Workspace not found or unauthorized');
          }
          return listExpenseBudgets(client, workspaceId, query);
        }
      );

      const response = validateResponse(ExpenseBudgetListResponseSchema, {
        data: budgets,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(200).send(response);
    }
  );

  app.patch(
    '/v1/workspaces/:workspaceId/expenses/budgets/:budgetId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId, budgetId } = BudgetParamsSchema.parse(request.params);
      const body = UpdateExpenseBudgetBodySchema.parse(request.body);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const updated = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'updateExpenseBudget',
              schemaVersion: 1,
              entityType: 'expense_budget',
              entityId: budgetId,
              baseRevision: 1,
              payload: body as unknown as Record<string, unknown>,
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return (receipt.resultPayload as { budget: ExpenseBudget }).budget;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const res = await updateExpenseBudget(
              client,
              workspaceId,
              budgetId,
              body,
              operationId
            );

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'updateExpenseBudget',
              entityType: 'expense_budget',
              entityId: budgetId,
              schemaVersion: 1,
              baseRevision: 1,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: res.revision,
              appliedChangeSeq: res.seq ?? null,
              resultPayload: { budget: res },
            });

            return res;
          }

          return updateExpenseBudget(client, workspaceId, budgetId, body);
        }
      );

      const response = validateResponse(ExpenseBudgetResponseSchema, {
        data: updated,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });

      return reply.status(200).send(response);
    }
  );

  app.delete(
    '/v1/workspaces/:workspaceId/expenses/budgets/:budgetId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Unauthorized' } });

      const { workspaceId, budgetId } = BudgetParamsSchema.parse(request.params);
      const rawOpId = request.headers['x-operation-id'] || request.headers['idempotency-key'];
      const operationId = typeof rawOpId === 'string' && rawOpId.length > 0 ? rawOpId : undefined;
      const deviceId = (request.headers['x-device-id'] as string) || 'rest-api';

      const result = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          if (operationId) {
            const payloadHash = computeCanonicalPayloadHash({
              workspaceId,
              command: 'deleteExpenseBudget',
              schemaVersion: 1,
              entityType: 'expense_budget',
              entityId: budgetId,
              baseRevision: 1,
              payload: {},
            });

            const receipt = await getMutationReceipt(client, actor.userId, deviceId, operationId);
            if (receipt) {
              if (receipt.canonicalPayloadHash !== payloadHash) {
                throw new ConflictError(
                  'IDEMPOTENCY_KEY_REUSED: Operation ID was already used with a different payload.'
                );
              }
              if (receipt.status === 'accepted') {
                return receipt.resultPayload;
              }
            }

            await lockWorkspaceSyncState(client, workspaceId);
            const res = await deleteExpenseBudget(client, workspaceId, budgetId, operationId);

            await insertMutationReceipt(client, {
              workspaceId,
              actorUserId: actor.userId,
              deviceId,
              operationId,
              command: 'deleteExpenseBudget',
              entityType: 'expense_budget',
              entityId: budgetId,
              schemaVersion: 1,
              baseRevision: 1,
              canonicalPayloadHash: payloadHash,
              status: 'accepted',
              acceptedRevision: 2,
              appliedChangeSeq: res.seq ?? null,
              resultPayload: res,
            });

            return res;
          }

          return deleteExpenseBudget(client, workspaceId, budgetId);
        }
      );

      return reply.status(200).send({
        data: result,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    }
  );
}
