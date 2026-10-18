import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import {
  ReauthenticateRequestSchema,
  ReauthenticateResponseSchema,
  CreateExportRequestSchema,
  CreateExportResponseSchema,
  ImportPreviewResponseSchema,
  ExecuteImportRequestSchema,
  ExecuteImportResponseSchema,
  WorkspaceParamsSchema,
  type ReauthenticateResponse,
  type CreateExportResponse,
  type ImportPreviewResponse,
  type ExecuteImportResponse,
} from '@daynori/contracts';
import { withTenantContext } from '../../db/index.js';
import { AuthError } from '../../auth/jwt.js';
import {
  issueReauthToken,
  assertValidReauthentication,
  getReauthAuthenticator,
} from '../../modules/portability/reauth.js';
import {
  generateWorkspaceExport,
  getDurableExportArchive,
} from '../../modules/portability/exportService.js';
import {
  validateAndPreviewImport,
  executeConfirmedImport,
} from '../../modules/portability/importService.js';
import {
  validateResponse,
  ForbiddenError,
  ValidationError,
} from '../../plugins/errorHandler.js';

export function registerPortabilityRoutes(app: FastifyInstance, runtimePool: Pool): void {
  // Support raw zip binary uploads up to 50 MiB
  app.addContentTypeParser(
    ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: 52428800 },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // 1. Reauthentication endpoint
  // POST /v1/auth/reauthenticate
  app.post('/v1/auth/reauthenticate', async (request: FastifyRequest, reply: FastifyReply): Promise<ReauthenticateResponse> => {
    const actor = request.actor;
    if (!actor) {
      throw new AuthError('User authentication is required to reauthenticate');
    }

    const currentSession = request.headers['authorization']?.replace(/^bearer\s+/i, '');
    if (!currentSession) {
      throw new AuthError('Active session bearer token is required for reauthentication');
    }

    const body = ReauthenticateRequestSchema.parse(request.body || {});

    // Reauthentication requires verifying credentials (or password)
    if (!body.password || typeof body.password !== 'string' || body.password.trim().length === 0) {
      throw new ValidationError('Password is required for reauthentication');
    }

    // Verify credentials against authenticating provider
    const authResult = await getReauthAuthenticator().verifyPassword({
      userId: actor.userId,
      email: actor.email,
      password: body.password,
    });

    if (!authResult.success) {
      throw new AuthError(
        authResult.error || 'Reauthentication failed: invalid credentials',
        'REAUTHENTICATION_FAILED',
        401
      );
    }

    const workspaceId = (request.headers['x-workspace-id'] as string) || body.sessionBinding;

    if (body.purpose === 'protected_export') {
      if (!workspaceId) {
        throw new ValidationError('Workspace context (x-workspace-id header or sessionBinding) is required for protected export');
      }

      // Verify actor is editor or owner of the workspace
      await withTenantContext(runtimePool, { userId: actor.userId, workspaceId }, async (client) => {
        const res = await client.query<{ exists: boolean }>(
          `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
          [workspaceId]
        );
        if (!res.rows[0]?.exists) {
          throw new ForbiddenError('You are not authorized for protected operations in this workspace');
        }
      });
    }

    const boundWorkspaceId = workspaceId || '00000000-0000-0000-0000-000000000000';
    const { token, expiresAt } = issueReauthToken({
      userId: actor.userId,
      workspaceId: boundWorkspaceId,
      purpose: body.purpose,
      sessionToken: currentSession,
    });

    const response: ReauthenticateResponse = {
      reauthToken: token,
      expiresAt,
      purpose: body.purpose,
      userId: actor.userId,
      workspaceId: boundWorkspaceId,
    };

    return reply.status(200).send(validateResponse(ReauthenticateResponseSchema, response));
  });

  // 2. Protected Workspace Export
  // POST /v1/workspaces/:workspaceId/export
  app.post(
    '/v1/workspaces/:workspaceId/export',
    async (request: FastifyRequest, reply: FastifyReply): Promise<CreateExportResponse> => {
      const actor = request.actor;
      if (!actor) {
        throw new AuthError('User authentication is required');
      }

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = CreateExportRequestSchema.safeParse(request.body || {});
      const reauthToken =
        (request.headers['x-reauth-token'] as string) || (body.success ? body.data.reauthToken : undefined);

      if (!reauthToken) {
        throw new ForbiddenError(
          'REAUTHENTICATION_REQUIRED: Fresh reauthentication token is required before creating a protected export'
        );
      }

      // Assert recent reauthentication bound to current active session
      const currentSession = request.headers['authorization']?.replace(/^bearer\s+/i, '');
      try {
        assertValidReauthentication({
          token: reauthToken,
          expectedUserId: actor.userId,
          expectedWorkspaceId: workspaceId,
          expectedPurpose: 'protected_export',
          currentSessionToken: currentSession,
        });
      } catch (err) {
        throw new ForbiddenError(err instanceof Error ? err.message : String(err));
      }

      const includeAttachments = body.success ? body.data.includeAttachments !== false : true;

      const result = await withTenantContext(
        runtimePool,
        { userId: actor.userId, workspaceId },
        async (client) => {
          return generateWorkspaceExport(client, workspaceId, actor.userId, includeAttachments, currentSession);
        }
      );

      return reply.status(200).send(validateResponse(CreateExportResponseSchema, result));
    }
  );

  // 3. Ephemeral Authorized Download
  // GET /v1/workspaces/:workspaceId/export/download/:exportId
  app.get(
    '/v1/workspaces/:workspaceId/export/download/:exportId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const actor = request.actor;
      if (!actor) {
        throw new AuthError('User authentication is required');
      }

      const params = request.params as { workspaceId: string; exportId: string };
      const { workspaceId, exportId } = params;
      const query = request.query as { token?: string; expires?: string };
      const currentSession = request.headers['authorization']?.replace(/^bearer\s+/i, '');

      const { archiveBuffer, fileSizeBytes } = await withTenantContext(
        runtimePool,
        { userId: actor.userId, workspaceId },
        async (client) => {
          return getDurableExportArchive(
            client,
            exportId,
            actor.userId,
            query.token,
            query.expires,
            currentSession
          );
        }
      );

      reply.header('Content-Type', 'application/zip');
      reply.header(
        'Content-Disposition',
        `attachment; filename="daynori-workspace-${workspaceId.substring(0, 8)}-${exportId.substring(
          0,
          8
        )}.zip"`
      );
      reply.header('Content-Length', fileSizeBytes);

      return reply.status(200).send(archiveBuffer);
    }
  );

  // 4. Import Preview
  // POST /v1/workspaces/:workspaceId/import/preview
  app.post(
    '/v1/workspaces/:workspaceId/import/preview',
    { bodyLimit: 52428800 }, // 50 MiB limit for archive uploads
    async (request: FastifyRequest, reply: FastifyReply): Promise<ImportPreviewResponse> => {
      const actor = request.actor;
      if (!actor) {
        throw new AuthError('User authentication is required');
      }

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const currentSession = request.headers['authorization']?.replace(/^bearer\s+/i, '');

      // Check if body is buffer or JSON with base64 data
      let archiveBuffer: Buffer;
      if (Buffer.isBuffer(request.body)) {
        archiveBuffer = request.body;
      } else if (
        request.body &&
        typeof request.body === 'object' &&
        'archiveBase64' in request.body &&
        typeof (request.body as { archiveBase64: unknown }).archiveBase64 === 'string'
      ) {
        archiveBuffer = Buffer.from(
          (request.body as { archiveBase64: string }).archiveBase64,
          'base64'
        );
      } else {
        throw new ValidationError(
          'Expected binary application/zip or JSON with archiveBase64 string'
        );
      }

      const preview = await withTenantContext(
        runtimePool,
        { userId: actor.userId, workspaceId },
        async (client) => {
          return validateAndPreviewImport(client, workspaceId, actor.userId, archiveBuffer, currentSession);
        }
      );

      return reply.status(200).send(validateResponse(ImportPreviewResponseSchema, preview));
    }
  );

  // 5. Execute Import
  // POST /v1/workspaces/:workspaceId/import/execute
  app.post(
    '/v1/workspaces/:workspaceId/import/execute',
    async (request: FastifyRequest, reply: FastifyReply): Promise<ExecuteImportResponse> => {
      const actor = request.actor;
      if (!actor) {
        throw new AuthError('User authentication is required');
      }

      const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
      const body = ExecuteImportRequestSchema.parse(request.body || {});

      const result = await withTenantContext(
        runtimePool,
        { userId: actor.userId, workspaceId },
        async (client) => {
          return executeConfirmedImport(
            client,
            workspaceId,
            actor.userId,
            body.previewId,
            body.duplicateStrategy
          );
        }
      );

      return reply.status(200).send(validateResponse(ExecuteImportResponseSchema, result));
    }
  );
}
