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
import { registerUserRoutes } from './routes/v1/users.js';
import { registerMemberRoutes } from './routes/v1/members.js';
import { registerItemRoutes } from './routes/v1/items.js';
import { registerOrganizationRoutes } from './routes/v1/organization.js';
import { registerNoteRoutes } from './routes/v1/notes.js';
import { registerTaskRoutes } from './routes/v1/tasks.js';
import { registerRoutineRoutes } from './routes/v1/routines.js';
import { registerJournalRoutes } from './routes/v1/journal.js';
import { registerFileRoutes } from './routes/v1/files.js';
import { registerCalendarRoutes } from './routes/v1/calendar.js';
import { registerReminderRoutes } from './routes/v1/reminders.js';
import { registerKnowledgeRoutes } from './routes/v1/knowledge.js';
import { registerSearchRoutes } from './routes/v1/search.js';
import { registerPortabilityRoutes } from './routes/v1/portability.js';
import {
  registerAuthenticatedDeletionRoutes,
  registerPublicDeletionRoutes,
} from './routes/v1/deletion.js';
import { registerSyncRoutes } from './modules/sync/index.js';
import { storageTransferPlugin } from './modules/files/storageTransfer.js';
import { registerBetaRoutes } from './routes/v1/beta.js';
import { registerExpenseRoutes } from './routes/v1/expenses.js';
import { registerCustomSectionRoutes } from './routes/v1/customSections.js';
import { registerDriveRoutes } from './routes/v1/drive.js';
import { registerRoomRoutes } from './routes/v1/rooms.js';
import { BetaAccessService } from './modules/beta/betaAccessService.js';
import { ExplicitForbiddenError } from './plugins/errorHandler.js';

export interface ServerOptions {
  runtimePool?: Pool;
  jwtVerifier?: JwtVerifier;
  jwtConfig?: JwtVerifierConfig;
  rateLimiter?: ProcessLocalRateLimiter;
  rateLimitOptions?: { windowMs?: number; maxRequests?: number };
  logger?: SafeLogger;
  allowUnauthenticatedStartup?: boolean;
  enableExpenses?: boolean;
}

const REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function sanitizeRequestId(incoming: unknown): string {
  if (typeof incoming === 'string' && REQUEST_ID_REGEX.test(incoming.trim())) {
    return incoming.trim();
  }
  return crypto.randomUUID();
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
        : process.env['SUPABASE_JWT_SECRET']
          ? new JwtVerifier({
              issuer: process.env['SUPABASE_JWT_ISSUER'] ?? 'https://supabase.local',
              audience: process.env['SUPABASE_JWT_AUDIENCE'] ?? 'authenticated',
              secret: process.env['SUPABASE_JWT_SECRET'],
            })
          : undefined);

  if (!verifier && options?.allowUnauthenticatedStartup !== true) {
    throw new Error(
      'Server startup failed: authentication verifier is not configured. Protected routes cannot be served.'
    );
  }

  const app = Fastify({
    logger: false, // Disables unredacted raw logging; handled by SafeLogger
    requestIdHeader: false,
    genReqId: (req) => sanitizeRequestId(req.headers['x-request-id']),
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

  const allowExpenses = options?.enableExpenses ?? process.env['ENABLE_EXPENSES'] === 'true';
  // Provisional local rooms only — not public invitation / release enablement.
  const allowRoomsLocal =
    process.env['DAYNORI_ROOMS_LOCAL_ENABLED'] === 'true' ||
    process.env['NODE_ENV'] === 'test' ||
    process.env['NODE_ENV'] === 'development';

  // Global barrier for unreleased feature scope (expenses, vault, rooms, ai, billing)
  // Rejects direct calls with 403 Forbidden before router matching
  app.addHook('onRequest', async (request) => {
    const url = request.url;
    const roomsBlocked =
      !allowRoomsLocal &&
      (url.startsWith('/v1/rooms') || url.startsWith('/v1/room-invitations'));
    if (
      (!allowExpenses && (url.startsWith('/v1/expenses') || url.includes('/expenses'))) ||
      url.startsWith('/v1/vault') ||
      roomsBlocked ||
      url.startsWith('/v1/ai') ||
      url.startsWith('/v1/billing')
    ) {
      throw new ExplicitForbiddenError(
        'This module is unavailable in beta until release gate requirements are verified.'
      );
    }
  });

  // 1. Unauthenticated Foundation Routes
  registerHealthRoutes(app, runtimePool, Boolean(verifier));
  registerOpenApiRoutes(app);
  registerPublicDeletionRoutes(app, runtimePool);
  app.register(storageTransferPlugin);

  // 2. Authenticated Routes (/v1/workspaces and sub-resources)
  if (verifier) {
    const authenticate = createAuthMiddleware(verifier, runtimePool);

    const betaAccessService = new BetaAccessService(runtimePool);

    app.register(async (authScope) => {
      authScope.addHook('preHandler', authenticate);

      // Enforce private beta boundaries and unreleased feature scope
      authScope.addHook('preHandler', async (request) => {
        const url = request.url;

        // 1. Unreleased feature scope barriers (403 Forbidden on direct access)
        const roomsBlockedAuth =
          !allowRoomsLocal &&
          (url.startsWith('/v1/rooms') || url.startsWith('/v1/room-invitations'));
        if (
          (!allowExpenses && (url.startsWith('/v1/expenses') || url.includes('/expenses'))) ||
          url.startsWith('/v1/vault') ||
          roomsBlockedAuth ||
          url.startsWith('/v1/ai') ||
          url.startsWith('/v1/billing')
        ) {
          throw new ExplicitForbiddenError(
            'This module is unavailable in beta until release gate requirements are verified.'
          );
        }

        // 2. Private invitation-only enrollment enforcement
        const accessMode = process.env['BETA_ACCESS_MODE'];
        if (accessMode === 'private_invitation_only') {
          // Exempt invitation claiming and account deletion routes
          if (
            url.startsWith('/v1/beta/claim-invitation') ||
            url.startsWith('/v1/auth/account-deletion')
          ) {
            return;
          }

          if (request.actor?.userId) {
            const isEnrolled = await betaAccessService.isUserEnrolled(request.actor.userId);
            if (!isEnrolled) {
              throw new ExplicitForbiddenError(
                'Private beta access requires an active invitation enrollment. Claim an invitation at /v1/beta/claim-invitation.'
              );
            }
          }
        }
      });

      registerBetaRoutes(authScope, runtimePool);
      registerWorkspaceRoutes(authScope, runtimePool);
      registerUserRoutes(authScope, runtimePool);
      registerMemberRoutes(authScope, runtimePool);
      registerItemRoutes(authScope, runtimePool);
      registerOrganizationRoutes(authScope, runtimePool);
      registerNoteRoutes(authScope, runtimePool);
      registerTaskRoutes(authScope, runtimePool);
      registerRoutineRoutes(authScope, runtimePool);
      registerJournalRoutes(authScope, runtimePool);
      registerExpenseRoutes(authScope, runtimePool);
      registerFileRoutes(authScope, runtimePool);
      registerCalendarRoutes(authScope, runtimePool);
      registerReminderRoutes(authScope, runtimePool);
      registerKnowledgeRoutes(authScope, runtimePool);
      registerSearchRoutes(authScope, runtimePool);
      registerPortabilityRoutes(authScope, runtimePool);
      registerSyncRoutes(authScope, runtimePool);
      registerCustomSectionRoutes(authScope, runtimePool);
      registerDriveRoutes(authScope, runtimePool);
      registerRoomRoutes(authScope, runtimePool);
      registerAuthenticatedDeletionRoutes(authScope, runtimePool);
    });
  }

  return app;
}
