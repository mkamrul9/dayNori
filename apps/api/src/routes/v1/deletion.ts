import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  RequestAccountDeletionBodySchema,
  ConfirmAccountDeletionBodySchema,
  CancelAccountDeletionBodySchema,
  RequestWorkspaceDeletionBodySchema,
  PublicDeletionRequestSubmissionSchema,
  VerifyPublicDeletionRequestBodySchema,
} from '@daynori/contracts';
import { DeletionService } from '../../modules/lifecycle/deletionService.js';
import { AuthError } from '../../auth/jwt.js';
import { withUserContext } from '../../db/index.js';

const deletionService = new DeletionService();

export function registerAuthenticatedDeletionRoutes(app: FastifyInstance, pool: Pool): void {
  // 1. Request account deletion
  app.post('/v1/auth/account-deletion/request', async (request, reply) => {
    if (!request.actor) {
      throw new AuthError('Authentication required');
    }

    const body = RequestAccountDeletionBodySchema.parse(request.body || {});
    const res = await withUserContext(pool, request.actor.userId, async (client) => {
      return deletionService.requestAccountDeletion(
        client,
        request.actor!.userId,
        request.rawToken || '',
        body,
        request.actor!.email
      );
    });
    return reply.status(200).send(res);
  });

  // 2. Confirm account deletion
  app.post('/v1/auth/account-deletion/confirm', async (request, reply) => {
    if (!request.actor) {
      throw new AuthError('Authentication required');
    }

    const body = ConfirmAccountDeletionBodySchema.parse(request.body || {});
    const res = await deletionService.confirmAccountDeletionWithPool(
      pool,
      request.actor!.userId,
      request.rawToken || '',
      body.confirmationToken,
      request.actor!.email
    );
    return reply.status(200).send(res);
  });

  // 3. Cancel account deletion
  app.post('/v1/auth/account-deletion/cancel', async (request, reply) => {
    if (!request.actor) {
      throw new AuthError('Authentication required');
    }

    const body = CancelAccountDeletionBodySchema.parse(request.body || {});
    const res = await withUserContext(pool, request.actor.userId, async (client) => {
      return deletionService.cancelAccountDeletion(
        client,
        request.actor!.userId,
        undefined,
        body.reason
      );
    });
    return reply.status(200).send(res);
  });

  // 4. Get deletion status
  app.get('/v1/auth/account-deletion/status', async (request, reply) => {
    if (!request.actor) {
      throw new AuthError('Authentication required');
    }

    const res = await withUserContext(pool, request.actor.userId, async (client) => {
      return deletionService.getAccountDeletionStatus(client, request.actor!.userId);
    });
    return reply.status(200).send(res);
  });

  // 5. Delete single workspace
  app.post('/v1/workspaces/:workspaceId/deletion', async (request, reply) => {
    if (!request.actor) {
      throw new AuthError('Authentication required');
    }

    const params = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
    const body = RequestWorkspaceDeletionBodySchema.parse(request.body || {});

    const res = await deletionService.deleteSingleWorkspaceWithPool(
      pool,
      request.actor!.userId,
      params.workspaceId,
      request.rawToken || '',
      body,
      request.actor!.email
    );
    return reply.status(200).send(res);
  });
}

export function registerPublicDeletionRoutes(app: FastifyInstance, pool: Pool): void {
  // Public, unauthenticated deletion request resource (Google Play policy compliance)
  app.post('/v1/public/account-deletion-request', async (request, reply) => {
    const body = PublicDeletionRequestSubmissionSchema.parse(request.body || {});
    const res = await deletionService.submitPublicDeletionRequest(pool, body.email, body.reason);
    return reply.status(200).send(res);
  });

  // Verify and process public deletion request
  app.post('/v1/public/account-deletion-request/verify', async (request, reply) => {
    const body = VerifyPublicDeletionRequestBodySchema.parse(request.body || {});
    const res = await deletionService.verifyPublicDeletionRequest(
      pool,
      body.requestId,
      body.verificationToken
    );
    return reply.status(200).send(res);
  });
}
