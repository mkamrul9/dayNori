import type { FastifyInstance } from 'fastify';
import { generateCanonicalOpenApiSpec } from '@daynori/contracts';

export function getOpenApiSpec(): Record<string, unknown> {
  return generateCanonicalOpenApiSpec();
}

export function registerOpenApiRoutes(app: FastifyInstance): void {
  app.get('/v1/openapi.json', async (_request, reply) => {
    return reply.status(200).send(getOpenApiSpec());
  });
}
