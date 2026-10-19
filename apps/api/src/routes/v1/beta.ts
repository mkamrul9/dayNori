import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AuthError } from '../../auth/jwt.js';
import { BetaAccessService } from '../../modules/beta/betaAccessService.js';

const ClaimInvitationBodySchema = z.object({
  invitationCode: z.string().min(1, 'Invitation code is required'),
});

export function registerBetaRoutes(app: FastifyInstance, pool: Pool): void {
  const betaService = new BetaAccessService(pool);

  app.post('/v1/beta/claim-invitation', async (request, reply) => {
    if (!request.actor) {
      throw new AuthError('Authentication required to claim an invitation');
    }

    const body = ClaimInvitationBodySchema.parse(request.body || {});
    const maxSeats = Number(process.env['BETA_MAX_SEATS'] || process.env['BETA_SEAT_LIMIT'] || 50);

    const result = await betaService.claimInvitation(
      request.actor.userId,
      body.invitationCode,
      maxSeats,
      request.actor.email
    );

    return reply.status(200).send(result);
  });
}
