import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import crypto from 'node:crypto';
import {
  HealthResponseSchema,
  SmokeResponseSchema,
  type HealthResponse,
  type SmokeResponse,
} from '@daynori/contracts';
import { getDefaultRuntimePool } from './db/index.js';
import { JwtVerifier, type JwtVerifierConfig } from './auth/jwt.js';
import { createAuthMiddleware } from './auth/middleware.js';
import { SafeLogger } from './plugins/logger.js';
import { ProcessLocalRateLimiter } from './plugins/rateLimiter.js';
import { createErrorHandler } from './plugins/errorHandler.js';
import { registerHealthRoutes } from './routes/v1/health.js';
import { registerOpenApiRoutes } from './routes/v1/openapi.js';
import { registerWorkspaceRoutes } from './routes/v1/workspaces.js';
import { registerMemberRoutes } from './routes/v1/members.js';
import { registerItemRoutes } from './routes/v1/items.js';

export interface ServerOptions {
  runtimePool?: Pool;
  jwtVerifier?: JwtVerifier;
  jwtConfig?: JwtVerifierConfig;
  rateLimiter?: ProcessLocalRateLimiter;
  rateLimitOptions?: { windowMs?: number; maxRequests?: number };
  logger?: SafeLogger;
}

export function buildServer(options?: ServerOptions): FastifyInstance {
  const runtimePool = options?.runtimePool ?? getDefaultRuntimePool();
  const safeLogger = options?.logger ?? new SafeLogger();
  const rateLimiter =
    options?.rateLimiter ?? new ProcessLocalRateLimiter(options?.rateLimitOptions);

  // Setup JWT verifier (defaulting to environment variables if not provided)
  const verifier =
    options?.jwtVerifier ??
    (options?.jwtConfig
      ? new JwtVerifier(options.jwtConfig)
      : process.env['SUPABASE_JWKS_URL']
        ? new JwtVerifier({
            issuer: process.env['SUPABASE_JWT_ISSUER'] ?? 'https://supabase.local',
            audience: process.env['SUPABASE_JWT_AUDIENCE'] ?? 'authenticated',
            jwksUrl: process.env['SUPABASE_JWKS_URL'],
          })
        : undefined);

  const app = Fastify({
    logger: false, // Disables unredacted raw logging; handled by SafeLogger
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      if (typeof incoming === 'string' && incoming.trim().length > 0) {
        return incoming;
      }
      return crypto.randomUUID();
    },
    bodyLimit: 1048576, // 1 MiB JSON request limit conforming to api-conventions.md
  });

  // Track request timing for safe structured logging
  const requestStartTimes = new WeakMap<object, number>();

  app.addHook('onRequest', async (request, reply) => {
    requestStartTimes.set(request, Date.now());
    reply.header('x-request-id', request.id);

    // Enforce process-local rate limiting
    rateLimiter.check(request, reply);
  });

  app.addHook('onResponse', async (request, reply) => {
    const startTime = requestStartTimes.get(request) ?? Date.now();
    const duration = Date.now() - startTime;
    safeLogger.logRequest(request, reply, duration);
  });

  // Central structured error handler
  app.setErrorHandler(createErrorHandler(safeLogger));

  // Legacy Smoke routes for Phase 01 backwards compatibility
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

  // 1. Unauthenticated Foundation Routes
  registerHealthRoutes(app, runtimePool);
  registerOpenApiRoutes(app);

  // 2. Authenticated Routes (/v1/workspaces and sub-resources)
  if (verifier) {
    const authenticate = createAuthMiddleware(verifier);

    app.register(async (authScope) => {
      authScope.addHook('preHandler', authenticate);
      registerWorkspaceRoutes(authScope, runtimePool);
      registerMemberRoutes(authScope, runtimePool);
      registerItemRoutes(authScope, runtimePool);
    });
  }

  return app;
}
