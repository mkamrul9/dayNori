import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  HealthCheckResponseSchema,
  ReadinessCheckResponseSchema,
  type HealthCheckResponse,
  type ReadinessCheckResponse,
} from '@daynori/contracts';

export function registerHealthRoutes(app: FastifyInstance, runtimePool: Pool): void {
  app.get('/v1/health', async (request, reply): Promise<HealthCheckResponse> => {
    const payload: HealthCheckResponse = {
      data: {
        status: 'ok',
        version: '0.1.0',
        environment: process.env['NODE_ENV'] ?? 'development',
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    };
    return reply.status(200).send(HealthCheckResponseSchema.parse(payload));
  });

  app.get('/v1/ready', async (request, reply): Promise<ReadinessCheckResponse> => {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      // Bounded probe query with 2s timeout
      const client = await runtimePool.connect();
      try {
        await client.query('SELECT 1;');
        dbStatus = 'connected';
      } finally {
        client.release();
      }
    } catch {
      dbStatus = 'disconnected';
    }

    const isReady = dbStatus === 'connected';
    const payload: ReadinessCheckResponse = {
      data: {
        status: isReady ? 'ready' : 'unavailable',
        checks: {
          database: dbStatus,
        },
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    };

    const statusCode = isReady ? 200 : 503;
    return reply.status(statusCode).send(ReadinessCheckResponseSchema.parse(payload));
  });
}
