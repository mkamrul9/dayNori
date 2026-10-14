import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthError, type JwtVerifier, type VerifiedActor } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor?: VerifiedActor;
  }
}

export function createAuthMiddleware(verifier: JwtVerifier) {
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
    request.actor = actor;
  };
}
