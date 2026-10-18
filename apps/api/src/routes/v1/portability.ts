import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import crypto from 'node:crypto';
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
} from '../../modules/portability/reauth.js';
import {
  generateWorkspaceExport,
  getEphemeralExport,
} from '../../modules/portability/exportService.js';
import {
  validateAndPreviewImport,
  executeConfirmedImport,
} from '../../modules/portability/importService.js';
import {
  validateResponse,
  NotFoundError,
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

    const body = ReauthenticateRequestSchema.parse(request.body || {});
    const workspaceId = body.sessionBinding || request.headers['x-workspace-id'] as string;

    if (!workspaceId) {
      throw new ValidationError('Workspace context (sessionBinding or x-workspace-id header) is required');
    }

    // Verify actor is member of the workspace
    await withTenantContext(runtimePool, { userId: actor.userId, workspaceId }, async (client) => {
      const res = await client.query<{ exists: boolean }>(
        `SELECT app.user_has_workspace_role($1, 'editor') as exists;`,
        [workspaceId]
      );
      if (!res.rows[0]?.exists) {
        throw new ForbiddenError('You are not authorized for protected operations in this workspace');
      }
    });

    // In a test environment or provider flow, we verify password if provided or confirm recent session
    const currentSession = request.headers['authorization']?.replace(/^bearer\s+/i, '');
    const { token, expiresAt } = issueReauthToken({
      userId: actor.userId,
      workspaceId,
      purpose: body.purpose,
      sessionToken: currentSession,
    });

    const response: ReauthenticateResponse = {
      reauthToken: token,
      expiresAt,
      purpose: body.purpose,
      userId: actor.userId,
      workspaceId,
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

      // Assert recent reauthentication
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
          return generateWorkspaceExport(client, workspaceId, actor.userId, includeAttachments);
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

      if (!query.token || !query.expires) {
        throw new AuthError('Missing signed download token or expiration');
      }

      const expires = Number(query.expires);
      if (Date.now() > expires) {
        throw new ForbiddenError('EXPIRED_DOWNLOAD_LINK: The export download link has expired');
      }

      // Validate signature
      const expectedToken = crypto
        .createHmac(
          'sha256',
          process.env['REAUTH_SIGNING_SECRET'] || 'daynori-reauth-fallback-secret-2026'
        )
        .update(`${exportId}:${workspaceId}:${actor.userId}:${expires}`)
        .digest('hex');

      if (query.token !== expectedToken) {
        throw new ForbiddenError('UNAUTHORIZED_DOWNLOAD: Invalid download token signature or cross-account reuse');
      }

      const storedExport = getEphemeralExport(exportId);
      if (!storedExport) {
        throw new NotFoundError('Export not found or download link has expired');
      }

      if (storedExport.workspaceId !== workspaceId) {
        throw new ForbiddenError('Export belongs to a different workspace');
      }

      if (storedExport.userId !== actor.userId) {
        throw new ForbiddenError('Export was generated by a different user');
      }

      reply.header('Content-Type', 'application/zip');
      reply.header(
        'Content-Disposition',
        `attachment; filename="daynori-workspace-${workspaceId.substring(0, 8)}-${exportId.substring(
          0,
          8
        )}.zip"`
      );
      reply.header('Content-Length', storedExport.archiveBuffer.length);

      return reply.status(200).send(storedExport.archiveBuffer);
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
          return validateAndPreviewImport(client, workspaceId, actor.userId, archiveBuffer);
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
