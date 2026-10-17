import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateReminderRuleRequestSchema,
  UpdateReminderRuleRequestSchema,
  SnoozeReminderRequestSchema,
  RecordDeliveryReceiptRequestSchema,
  ReminderRuleResponseSchema,
  ReminderRuleListResponseSchema,
  ReminderInstanceListResponseSchema,
  ReminderInstanceResponseSchema,
  ReminderDeliveryResponseSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
  getReminderRule,
  listReminderRules,
  listReminderInstances,
  snoozeReminderInstance,
  recordDeliveryReceipt,
} from '../../modules/reminders/service.js';
import { validateResponse, NotFoundError } from '../../plugins/errorHandler.js';

const RuleParamsSchema = WorkspaceParamsSchema.extend({
  ruleId: z.string().uuid(),
});

const InstanceParamsSchema = WorkspaceParamsSchema.extend({
  instanceId: z.string().uuid(),
});

const DeliveryParamsSchema = WorkspaceParamsSchema.extend({
  deliveryId: z.string().uuid(),
});

const ListRulesQuerySchema = z.object({
  targetId: z.string().uuid().optional(),
});

const ListInstancesQuerySchema = z.object({
  status: z.string().optional(),
  targetId: z.string().uuid().optional(),
});

export function registerReminderRoutes(app: FastifyInstance, pool: Pool): void {
  // 1. Create reminder rule
  app.post('/v1/workspaces/:workspaceId/reminders/rules', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const body = CreateReminderRuleRequestSchema.parse(request.body);

    return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const rule = await createReminderRule(client, workspaceId, actor.userId, body);

      return reply.status(201).send(
        validateResponse(ReminderRuleResponseSchema, {
          data: rule,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 2. List reminder rules
  app.get('/v1/workspaces/:workspaceId/reminders/rules', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = ListRulesQuerySchema.parse(request.query);

    return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const rules = await listReminderRules(client, workspaceId, query.targetId);

      return reply.status(200).send(
        validateResponse(ReminderRuleListResponseSchema, {
          data: rules,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 3. Get single reminder rule
  app.get('/v1/workspaces/:workspaceId/reminders/rules/:ruleId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { workspaceId, ruleId } = RuleParamsSchema.parse(request.params);

    return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const rule = await getReminderRule(client, workspaceId, ruleId);

      return reply.status(200).send(
        validateResponse(ReminderRuleResponseSchema, {
          data: rule,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 4. Update reminder rule
  app.patch('/v1/workspaces/:workspaceId/reminders/rules/:ruleId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { workspaceId, ruleId } = RuleParamsSchema.parse(request.params);
    const body = UpdateReminderRuleRequestSchema.parse(request.body);

    return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const updated = await updateReminderRule(client, workspaceId, actor.userId, ruleId, body);

      return reply.status(200).send(
        validateResponse(ReminderRuleResponseSchema, {
          data: updated,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 5. Delete reminder rule
  app.delete('/v1/workspaces/:workspaceId/reminders/rules/:ruleId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { workspaceId, ruleId } = RuleParamsSchema.parse(request.params);

    return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const result = await deleteReminderRule(client, workspaceId, ruleId);

      return reply.status(200).send({
        data: result,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    });
  });

  // 6. List reminder instances
  app.get('/v1/workspaces/:workspaceId/reminders/instances', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = ListInstancesQuerySchema.parse(request.query);

    return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
      const accessRes = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
        [workspaceId]
      );
      if (!accessRes.rows[0]?.exists) {
        throw new NotFoundError('Workspace not found or unauthorized');
      }

      const instances = await listReminderInstances(client, workspaceId, query);

      return reply.status(200).send(
        validateResponse(ReminderInstanceListResponseSchema, {
          data: instances,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 7. Snooze reminder instance
  app.post(
    '/v1/workspaces/:workspaceId/reminders/instances/:instanceId/snooze',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { workspaceId, instanceId } = InstanceParamsSchema.parse(request.params);
      const body = SnoozeReminderRequestSchema.parse(request.body);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const snoozed = await snoozeReminderInstance(
          client,
          workspaceId,
          actor.userId,
          instanceId,
          body
        );

        return reply.status(200).send(
          validateResponse(ReminderInstanceResponseSchema, {
            data: snoozed,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 8. Record delivery receipt
  app.post(
    '/v1/workspaces/:workspaceId/reminders/deliveries/:deliveryId/receipt',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { workspaceId, deliveryId } = DeliveryParamsSchema.parse(request.params);
      const body = RecordDeliveryReceiptRequestSchema.parse(request.body);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const delivery = await recordDeliveryReceipt(client, workspaceId, deliveryId, body);

        return reply.status(200).send(
          validateResponse(ReminderDeliveryResponseSchema, {
            data: delivery,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );
}
