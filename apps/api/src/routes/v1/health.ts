import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  HealthCheckResponseSchema,
  ReadinessCheckResponseSchema,
  type HealthCheckResponse,
  type ReadinessCheckResponse,
} from '@daynori/contracts';
import { validateResponse } from '../../plugins/errorHandler.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  runtimePool: Pool,
  isAuthConfigured: boolean
): void {
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
    return reply.status(200).send(validateResponse(HealthCheckResponseSchema, payload));
  });

  app.get('/v1/ready', async (request, reply): Promise<ReadinessCheckResponse> => {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      // Enforce actual 2000ms timeout on database connectivity probe
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<'disconnected'>((resolve) => {
        timer = setTimeout(() => resolve('disconnected'), 2000);
      });

      const probePromise = (async (): Promise<'connected'> => {
        const client = await runtimePool.connect();
        try {
          await client.query('SELECT 1;');
          return 'connected';
        } finally {
          client.release();
        }
      })();

      dbStatus = await Promise.race([probePromise, timeoutPromise]);
      if (timer) {
        clearTimeout(timer);
      }
    } catch {
      dbStatus = 'disconnected';
    }

    const authStatus = isAuthConfigured ? ('ready' as const) : ('unconfigured' as const);
    const isReady = dbStatus === 'connected' && authStatus === 'ready';

    const payload: ReadinessCheckResponse = {
      data: {
        status: isReady ? 'ready' : 'unavailable',
        checks: {
          database: dbStatus,
          auth: authStatus,
        },
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    };

    const statusCode = isReady ? 200 : 503;
    return reply.status(statusCode).send(validateResponse(ReadinessCheckResponseSchema, payload));
  });
}
