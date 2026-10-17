import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  ReserveUploadRequestSchema,
  ReserveUploadResponseSchema,
  FinalizeUploadRequestSchema,
  FinalizeUploadResponseSchema,
  UploadStatusResponseSchema,
  CancelReservationResponseSchema,
  DownloadCapabilityResponseSchema,
  FileItemResponseSchema,
  StorageQuotaResponseSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import {
  reserveFileUpload,
  finalizeFileUpload,
  getUploadReservationStatus,
  cancelUploadReservation,
  getFileDownloadCapability,
  getFileItem,
  deleteFileItem,
  type ReservationRecord,
} from '../../modules/files/service.js';
import { getStorageUsage, releaseReservedExposure } from '../../modules/files/quotaService.js';
import { validateResponse, FileValidationError } from '../../plugins/errorHandler.js';

const ReservationParamsSchema = WorkspaceParamsSchema.extend({
  reservationId: z.string().uuid(),
});

const FileParamsSchema = WorkspaceParamsSchema.extend({
  fileId: z.string().uuid(),
});

export function registerFileRoutes(app: FastifyInstance, pool: Pool): void {
  // 1. Storage Quota
  app.get('/v1/workspaces/:workspaceId/files/quota', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({ error: { message: 'Authentication required' } });
    }

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);

    const quota = await withTenantContext(
      pool,
      { userId: actor.userId, workspaceId },
      async (client) => {
        return getStorageUsage(client, workspaceId);
      }
    );

    const payload = validateResponse(StorageQuotaResponseSchema, {
      data: quota,
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    });

    return reply.status(200).send(payload);
  });

  // 2. Reserve Upload
  app.post(
    '/v1/workspaces/:workspaceId/files/reservations',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const parsedBody = ReserveUploadRequestSchema.parse(request.body);

      const reservation = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        async (client) => {
          return reserveFileUpload(client, {
            workspaceId,
            actorId: actor.userId,
            request: parsedBody,
          });
        }
      );

      const payload = validateResponse(ReserveUploadResponseSchema, {
        data: reservation,
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      });

      return reply.status(201).send(payload);
    }
  );

  // 3. Finalize Upload
  app.post(
    '/v1/workspaces/:workspaceId/files/reservations/:reservationId/finalize',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, reservationId } = ReservationParamsSchema.parse(request.params);
      const parsedBody = FinalizeUploadRequestSchema.parse(request.body ?? {});

      try {
        const finalized = await withTenantContext(
          pool,
          { userId: actor.userId, workspaceId },
          async (client) => {
            return finalizeFileUpload(client, {
              workspaceId,
              actorId: actor.userId,
              reservationId,
              clientChecksum: parsedBody?.clientChecksum,
              operationId: parsedBody?.operationId,
            });
          }
        );

        const payload = validateResponse(FinalizeUploadResponseSchema, {
          data: finalized,
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });

        return reply.status(200).send(payload);
      } catch (err) {
        if (
          err instanceof FileValidationError &&
          (err.message.includes('security verification') || err.message.includes('malware scanner'))
        ) {
          try {
            await withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
              const res = await client.query<{ reserved_exposure_bytes: string }>(
                `UPDATE app.upload_reservations
                   SET status = 'rejected', reconciled = true, updated_at = now()
                   WHERE id = $1 AND workspace_id = $2
                   RETURNING reserved_exposure_bytes`,
                [reservationId, workspaceId]
              );
              if (res.rows[0]) {
                await releaseReservedExposure(
                  client,
                  workspaceId,
                  Number(res.rows[0].reserved_exposure_bytes)
                );
              }
            });
          } catch {
            // best-effort persistence of rejection status
          }
        }
        throw err;
      }
    }
  );

  // 4. Get Reservation Status
  app.get(
    '/v1/workspaces/:workspaceId/files/reservations/:reservationId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, reservationId } = ReservationParamsSchema.parse(request.params);

      const status = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        async (client): Promise<ReservationRecord> => {
          return getUploadReservationStatus(client, workspaceId, reservationId);
        }
      );

      const payload = validateResponse(UploadStatusResponseSchema, {
        data: {
          reservationId: status.id,
          fileId: status.fileId,
          status: status.status,
          fileName: status.fileName,
          declaredBytes: status.declaredBytes,
          reservedExposureBytes: status.reservedExposureBytes,
          expiresAt: status.expiresAt,
          rejectionReason: null,
          reconciled: status.reconciled,
        },
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      });

      return reply.status(200).send(payload);
    }
  );

  // 5. Cancel Reservation
  app.post(
    '/v1/workspaces/:workspaceId/files/reservations/:reservationId/cancel',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, reservationId } = ReservationParamsSchema.parse(request.params);

      const cancelled = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        async (client) => {
          return cancelUploadReservation(client, workspaceId, actor.userId, reservationId);
        }
      );

      const payload = validateResponse(CancelReservationResponseSchema, {
        data: cancelled,
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      });

      return reply.status(200).send(payload);
    }
  );

  // 6. Authorized Download Capability (Short-Lived 300s token)
  app.get(
    '/v1/workspaces/:workspaceId/files/:fileId/download',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, fileId } = FileParamsSchema.parse(request.params);

      const capability = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId },
        async (client) => {
          return getFileDownloadCapability(client, workspaceId, fileId);
        }
      );

      const payload = validateResponse(DownloadCapabilityResponseSchema, {
        data: capability,
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      });

      return reply.status(200).send(payload);
    }
  );

  // 7. Get File Metadata
  app.get('/v1/workspaces/:workspaceId/files/:fileId', async (request: FastifyRequest, reply) => {
    const actor = request.actor;
    if (!actor) {
      return reply.status(401).send({ error: { message: 'Authentication required' } });
    }

    const { workspaceId, fileId } = FileParamsSchema.parse(request.params);

    const file = await withTenantContext(
      pool,
      { userId: actor.userId, workspaceId },
      async (client) => {
        return getFileItem(client, workspaceId, fileId);
      }
    );

    const payload = validateResponse(FileItemResponseSchema, {
      data: file,
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    });

    return reply.status(200).send(payload);
  });

  // 8. Delete File
  app.delete(
    '/v1/workspaces/:workspaceId/files/:fileId',
    async (request: FastifyRequest, reply) => {
      const actor = request.actor;
      if (!actor) {
        return reply.status(401).send({ error: { message: 'Authentication required' } });
      }

      const { workspaceId, fileId } = FileParamsSchema.parse(request.params);

      await withTenantContext(pool, { userId: actor.userId, workspaceId }, async (client) => {
        return deleteFileItem(client, workspaceId, actor.userId, fileId);
      });

      return reply.status(200).send({
        data: { success: true },
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      });
    }
  );
}
