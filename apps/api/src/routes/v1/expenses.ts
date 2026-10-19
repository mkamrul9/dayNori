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
} from '../../modules/expenses/service.js';
import { validateResponse } from '../../plugins/errorHandler.js';

const CategoryParamsSchema = WorkspaceParamsSchema.extend({
  categoryId: z.string().uuid(),
});

const ExpenseParamsSchema = WorkspaceParamsSchema.extend({
  expenseId: z.string().uuid(),
});

const SummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});

const GenerateOccurrencesBodySchema = z.object({
  untilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

      const category = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
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

      const category = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
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

      const result = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
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
    const operationId = (request.headers['x-operation-id'] as string) || undefined;

    const created = await withTenantContext(
      pool,
      { workspaceId, userId: actor.userId },
      async (client) => {
        return createExpenseRecord(client, workspaceId, actor.userId, body, operationId);
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

    const items = await withTenantContext(
      pool,
      { workspaceId, userId: actor.userId },
      async (client) => {
        return listExpenseRecords(client, workspaceId, query);
      }
    );

    const response = validateResponse(ExpenseListResponseSchema, {
      data: items,
      meta: { requestId: request.id, serverTime: new Date().toISOString() },
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
      const operationId = (request.headers['x-operation-id'] as string) || undefined;

      const updated = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          return updateExpenseRecord(
            client,
            workspaceId,
            expenseId,
            actor.userId,
            body,
            operationId
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
      const operationId = (request.headers['x-operation-id'] as string) || undefined;

      const result = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          return trashExpenseRecord(client, workspaceId, expenseId, actor.userId, operationId);
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
      const operationId = (request.headers['x-operation-id'] as string) || undefined;

      const result = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
          return restoreExpenseRecord(client, workspaceId, expenseId, actor.userId, operationId);
        }
      );

      return reply.status(200).send({
        data: result,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
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

      const template = await withTenantContext(
        pool,
        { workspaceId, userId: actor.userId },
        async (client) => {
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
}
