import type { FastifyInstance } from 'fastify';
import { isPlatformOperator } from '@daynori/domain';
import { AuthError } from '../../auth/jwt.js';
import { ExplicitForbiddenError } from '../../plugins/errorHandler.js';

/**
 * Phase 66 — operator session probe (deny-by-default allowlist).
 * Does not enable vault/rooms/AI/billing production gates.
 */
export function registerOperatorRoutes(app: FastifyInstance): void {
  app.get('/v1/operator/session', async (request, reply) => {
    const actor = request.actor;
    if (!actor) {
      throw new AuthError('Authentication required');
    }
    const allowed = isPlatformOperator({ userId: actor.userId }, process.env);
    if (!allowed) {
      throw new ExplicitForbiddenError('Platform operator access required');
    }
    return reply.status(200).send({
      data: {
        operator: true,
        userId: actor.userId,
        surfaces: ['developer', 'vault-harness', 'component-review'],
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    });
  });
}
