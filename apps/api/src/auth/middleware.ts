import crypto from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { AuthError, type JwtVerifier, type VerifiedActor } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor?: VerifiedActor;
    rawToken?: string;
  }
}

export function createAuthMiddleware(verifier: JwtVerifier, pool?: Pool) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new AuthError('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
      throw new AuthError('Authorization header must use Bearer scheme');
    }

    const token = parts[1]!;
    const actor = await verifier.verify(token);

    if (pool) {
      const isDeletionConfirmRoute =
        (request.url === '/v1/auth/account-deletion/confirm' ||
          request.url.startsWith('/v1/auth/account-deletion/confirm?')) &&
        request.method === 'POST';

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const revoked = await pool.query<{ id: string; revocation_reason: string }>(
        `SELECT id, revocation_reason FROM app.revoked_tokens WHERE token_hash = $1 AND expires_at > now() LIMIT 1;`,
        [tokenHash]
      );
      if (revoked.rows.length > 0) {
        const isSelfAccountDeletion =
          isDeletionConfirmRoute && revoked.rows[0]?.revocation_reason === 'account_deletion';
        if (!isSelfAccountDeletion) {
          throw new AuthError('Token has been revoked', 'TOKEN_REVOKED', 401);
        }
      }

      const suppressed = await pool.query<{ id: string }>(
        `SELECT id FROM app.deletion_suppression_ledger WHERE entity_type = 'account' AND entity_id = $1 LIMIT 1;`,
        [actor.userId]
      );
      if (suppressed.rows.length > 0 && !isDeletionConfirmRoute) {
        throw new AuthError('Account has been deleted', 'ACCOUNT_DELETED', 401);
      }
    }

    request.actor = actor;
    request.rawToken = token;
  };
}
