import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateReminderRuleRequestSchema,
  UpdateReminderRuleRequestSchema,
  SnoozeReminderRequestSchema,
  RecordDeliveryReceiptRequestSchema,
  RegisterDeviceRequestSchema,
  AcknowledgeDeviceScheduleRequestSchema,
  ReminderRuleResponseSchema,
  ReminderRuleListResponseSchema,
  ReminderInstanceListResponseSchema,
  ReminderInstanceResponseSchema,
  ReminderDeliveryResponseSchema,
  DeviceResponseSchema,
  DeviceScheduleResponseSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withTenantContext, withUserContext } from '../../db/index.js';
import {
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
  getReminderRule,
  listReminderRules,
  listReminderInstances,
  snoozeReminderInstance,
  recordDeliveryReceipt,
  registerDevice,
  deactivateDevice,
  listUserDevices,
  acknowledgeDeviceSchedule,
  listDeviceSchedules,
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

const DeviceInstallationParamsSchema = z.object({
  installationId: z.string().min(1).max(128),
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

        const delivery = await recordDeliveryReceipt(client, workspaceId, deliveryId, body, actor.userId);

        return reply.status(200).send(
          validateResponse(ReminderDeliveryResponseSchema, {
            data: delivery,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 9. Phase 28: Register or update device
  app.post('/v1/devices', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const body = RegisterDeviceRequestSchema.parse(request.body);

    return withUserContext(pool, actor.userId, async (client) => {
      const device = await registerDevice(client, actor.userId, body);

      return reply.status(200).send(
        validateResponse(DeviceResponseSchema, {
          data: device,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    });
  });

  // 10. Phase 28: Deactivate device
  app.delete('/v1/devices/:installationId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { installationId } = DeviceInstallationParamsSchema.parse(request.params);

    return withUserContext(pool, actor.userId, async (client) => {
      const result = await deactivateDevice(client, actor.userId, installationId);

      return reply.status(200).send({
        data: result,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    });
  });

  // 11. Phase 28: List user devices
  app.get('/v1/devices', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    return withUserContext(pool, actor.userId, async (client) => {
      const devices = await listUserDevices(client, actor.userId);

      return reply.status(200).send({
        data: devices,
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    });
  });

  // 12. Phase 28: Acknowledge device local schedule coordination
  app.post(
    '/v1/workspaces/:workspaceId/reminders/schedules/acknowledge',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = AcknowledgeDeviceScheduleRequestSchema.parse(request.body);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const schedule = await acknowledgeDeviceSchedule(
          client,
          workspaceId,
          actor.userId,
          body
        );

        return reply.status(200).send(
          validateResponse(DeviceScheduleResponseSchema, {
            data: schedule,
            meta: { requestId: request.id, serverTime: new Date().toISOString() },
          })
        );
      });
    }
  );

  // 13. Phase 28: List device schedules for instance
  app.get(
    '/v1/workspaces/:workspaceId/reminders/instances/:instanceId/schedules',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const { workspaceId, instanceId } = InstanceParamsSchema.parse(request.params);

      return withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        const accessRes = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
          [workspaceId]
        );
        if (!accessRes.rows[0]?.exists) {
          throw new NotFoundError('Workspace not found or unauthorized');
        }

        const schedules = await listDeviceSchedules(client, workspaceId, instanceId);

        return reply.status(200).send({
          data: schedules,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        });
      });
    }
  );
}
