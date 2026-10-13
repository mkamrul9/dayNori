import Fastify, { type FastifyInstance } from 'fastify';
import {
  HealthResponseSchema,
  SmokeResponseSchema,
  type HealthResponse,
  type SmokeResponse,
} from '@daynori/contracts';

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  app.get('/health', async (_request, reply): Promise<HealthResponse> => {
    const payload = HealthResponseSchema.parse({
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: process.env['NODE_ENV'] ?? 'development',
    });
    return reply.status(200).send(payload);
  });

  app.get('/api/v1/smoke', async (_request, reply): Promise<SmokeResponse> => {
    const payload = SmokeResponseSchema.parse({
      status: 'ready',
      phase: '01',
      service: 'daynori-api',
      timestamp: new Date().toISOString(),
    });
    return reply.status(200).send(payload);
  });

  return app;
}
