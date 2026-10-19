import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  WorkspaceParamsSchema,
  StartDriveConnectRequestSchema,
  StartDriveConnectResponseSchema,
  CompleteDriveConnectRequestSchema,
  CompleteDriveConnectResponseSchema,
  DisconnectDriveRequestSchema,
  DisconnectDriveResponseSchema,
  DriveConnectionStatusResponseSchema,
  ListDriveLinkedFilesResponseSchema,
  DriveSelectFileRequestSchema,
  DriveSelectFileResponseSchema,
  DrivePickerTokenResponseSchema,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import { validateResponse } from '../../plugins/errorHandler.js';
import {
  DriveServiceError,
  completeDriveConnect,
  disconnectDrive,
  getDriveConnectionStatus,
  issuePickerAccessToken,
  listDriveLinkedFiles,
  selectOrActOnDriveFile,
  startDriveConnect,
  unlinkDriveReference,
} from '../../modules/drive/service.js';

const LinkedFileParamsSchema = WorkspaceParamsSchema.extend({
  linkedFileId: z.string().uuid(),
});

function handleDriveError(err: unknown, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (err instanceof DriveServiceError) {
    return reply.status(err.statusCode).send({
      error: { message: err.message, code: err.code },
    });
  }
  throw err;
}

export function registerDriveRoutes(app: FastifyInstance, pool: Pool): void {
  app.get('/v1/workspaces/:workspaceId/drive/connection', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) => getDriveConnectionStatus(client, workspaceId, actor.userId)
      );
      return reply.status(200).send(
        validateResponse(DriveConnectionStatusResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return handleDriveError(err, reply);
    }
  });

  app.post('/v1/workspaces/:workspaceId/drive/connect/start', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const body = StartDriveConnectRequestSchema.parse(request.body);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) =>
          startDriveConnect(client, {
            workspaceId,
            accountId: actor.userId,
            request: body,
          })
      );
      return reply.status(200).send(
        validateResponse(StartDriveConnectResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return handleDriveError(err, reply);
    }
  });

  app.post('/v1/workspaces/:workspaceId/drive/connect/complete', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const body = CompleteDriveConnectRequestSchema.parse(request.body);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) =>
          completeDriveConnect(client, {
            workspaceId,
            accountId: actor.userId,
            request: body,
          })
      );
      reply.header('Cache-Control', 'no-store');
      return reply.status(200).send(
        validateResponse(CompleteDriveConnectResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return handleDriveError(err, reply);
    }
  });

  app.post('/v1/workspaces/:workspaceId/drive/disconnect', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    DisconnectDriveRequestSchema.parse(request.body ?? {});
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) => disconnectDrive(client, { workspaceId, accountId: actor.userId })
      );
      return reply.status(200).send(
        validateResponse(DisconnectDriveResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return handleDriveError(err, reply);
    }
  });

  app.get('/v1/workspaces/:workspaceId/drive/picker-token', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) => issuePickerAccessToken(client, { workspaceId, accountId: actor.userId })
      );
      reply.header('Cache-Control', 'no-store');
      return reply.status(200).send(
        validateResponse(DrivePickerTokenResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return handleDriveError(err, reply);
    }
  });

  app.get('/v1/workspaces/:workspaceId/drive/files', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) => listDriveLinkedFiles(client, { workspaceId, accountId: actor.userId })
      );
      return reply.status(200).send(
        validateResponse(ListDriveLinkedFilesResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return handleDriveError(err, reply);
    }
  });

  app.post('/v1/workspaces/:workspaceId/drive/files/select', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const body = DriveSelectFileRequestSchema.parse(request.body);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        (client) =>
          selectOrActOnDriveFile(client, {
            workspaceId,
            accountId: actor.userId,
            request: body,
          })
      );
      return reply.status(200).send(
        validateResponse(DriveSelectFileResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return handleDriveError(err, reply);
    }
  });

  app.delete(
    '/v1/workspaces/:workspaceId/drive/files/:linkedFileId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
      const { workspaceId, linkedFileId } = LinkedFileParamsSchema.parse(request.params);
      try {
        await withTenantContext(pool, { userId: actor.userId, workspaceId }, (client) =>
          unlinkDriveReference(client, {
            workspaceId,
            accountId: actor.userId,
            linkedFileId,
          })
        );
        return reply.status(200).send({
          data: { success: true, remoteOriginalDeleted: false },
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        });
      } catch (err) {
        return handleDriveError(err, reply);
      }
    }
  );
}
