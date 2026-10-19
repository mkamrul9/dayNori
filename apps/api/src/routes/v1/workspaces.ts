import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  CreateWorkspaceRequestSchema,
  WorkspaceParamsSchema,
  WorkspaceListResponseSchema,
  WorkspaceResponseSchema,
  ProvisionWorkspaceRequestSchema,
  ProvisionWorkspaceResponseSchema,
  type WorkspaceListResponse,
  type WorkspaceResponse,
  type ProvisionWorkspaceResponse,
  type QuietHoursPreference,
  type HomeLayout,
  type OnboardingState,
} from '@daynori/contracts';
import {
  withUserContext,
  withTenantContext,
  listWorkspaces,
  getWorkspace,
  createWorkspaceWithOwner,
  provisionPersonalWorkspace,
  getPersonalWorkspace,
} from '../../db/index.js';
import { NotFoundError, ConflictError, validateResponse } from '../../plugins/errorHandler.js';

export function registerWorkspaceRoutes(app: FastifyInstance, runtimePool: Pool): void {
  // POST /v1/workspaces/provision — Idempotent personal workspace & profile provisioning
  app.post(
    '/v1/workspaces/provision',
    async (request, reply): Promise<ProvisionWorkspaceResponse> => {
      const actor = request.actor!;
      const body = ProvisionWorkspaceRequestSchema.parse(request.body || {});

      const result = await withUserContext(runtimePool, actor.userId, async (client) => {
        return provisionPersonalWorkspace(client, {
          userId: actor.userId,
          displayName: body?.displayName,
          preferredLocale: body?.preferredLocale,
          timeZone: body?.timeZone,
          weekStart: body?.weekStart,
        });
      });

      const payload: ProvisionWorkspaceResponse = {
        data: {
          workspace: {
            id: result.workspace.id,
            name: result.workspace.name,
            kind: result.workspace.kind,
            ownerId: result.workspace.owner_id,
            createdAt: result.workspace.created_at.toISOString(),
            updatedAt: result.workspace.updated_at.toISOString(),
          },
          profile: {
            id: result.profile.id,
            displayName: result.profile.display_name,
            preferredLocale: result.profile.preferred_locale,
            timeZone: result.profile.time_zone,
            weekStart: result.profile.week_start,
            preferences: {
              theme: result.profile.preferences?.theme || 'system',
              compactMode: Boolean(result.profile.preferences?.compactMode),
              journalPreviewHidden: result.profile.preferences?.journalPreviewHidden !== false,
              suppressBodySnippets: result.profile.preferences?.suppressBodySnippets !== false,
              expensesEnabled: Boolean(result.profile.preferences?.expensesEnabled),
              quietHours: (result.profile.preferences?.quietHours as QuietHoursPreference | undefined) || undefined,
              homeLayout: (result.profile.preferences?.homeLayout as HomeLayout | undefined) || undefined,
              onboarding: (result.profile.preferences?.onboarding as OnboardingState | undefined) || undefined,
            },
            preferencesSchemaVersion: result.profile.preferences_schema_version,
            revision: Number(result.profile.revision),
            createdAt: result.profile.created_at.toISOString(),
            updatedAt: result.profile.updated_at.toISOString(),
          },
          isNew: result.isNew,
        },
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      };

      const statusCode = result.isNew ? 201 : 200;
      return reply
        .status(statusCode)
        .send(validateResponse(ProvisionWorkspaceResponseSchema, payload));
    }
  );

  // GET /v1/workspaces/personal — Resolve personal workspace for authenticated actor
  app.get('/v1/workspaces/personal', async (request, reply): Promise<WorkspaceResponse> => {
    const actor = request.actor!;

    const workspace = await withUserContext(runtimePool, actor.userId, async (client) => {
      return getPersonalWorkspace(client, actor.userId);
    });

    if (!workspace) {
      throw new NotFoundError('Personal workspace not provisioned');
    }

    const payload: WorkspaceResponse = {
      data: {
        id: workspace.id,
        name: workspace.name,
        kind: workspace.kind,
        ownerId: workspace.owner_id,
        createdAt: workspace.created_at.toISOString(),
        updatedAt: workspace.updated_at.toISOString(),
      },
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    };

    return reply.status(200).send(validateResponse(WorkspaceResponseSchema, payload));
  });

  // GET /v1/workspaces — List workspaces accessible to caller
  app.get('/v1/workspaces', async (request, reply): Promise<WorkspaceListResponse> => {
    const actor = request.actor!;

    const workspaces = await withUserContext(runtimePool, actor.userId, async (client) => {
      return listWorkspaces(client);
    });

    const payload: WorkspaceListResponse = {
      data: workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        kind: ws.kind,
        ownerId: ws.owner_id,
        createdAt: ws.created_at.toISOString(),
        updatedAt: ws.updated_at.toISOString(),
      })),
      meta: {
        requestId: request.id,
        serverTime: new Date().toISOString(),
      },
    };

    return reply.status(200).send(validateResponse(WorkspaceListResponseSchema, payload));
  });

  // POST /v1/workspaces — Create a new workspace and bootstrap caller as owner
  app.post('/v1/workspaces', async (request, reply): Promise<WorkspaceResponse> => {
    const actor = request.actor!;
    // Strict schema parse rejects unknown fields
    const body = CreateWorkspaceRequestSchema.parse(request.body);

    try {
      const { workspace } = await withUserContext(runtimePool, actor.userId, async (client) => {
        return createWorkspaceWithOwner(client, {
          name: body.name,
          kind: body.kind,
          ownerId: actor.userId,
        });
      });

      const payload: WorkspaceResponse = {
        data: {
          id: workspace.id,
          name: workspace.name,
          kind: workspace.kind,
          ownerId: workspace.owner_id,
          createdAt: workspace.created_at.toISOString(),
          updatedAt: workspace.updated_at.toISOString(),
        },
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      };

      return reply.status(201).send(validateResponse(WorkspaceResponseSchema, payload));
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        throw new ConflictError(
          'A personal workspace already exists for this user. Only one personal workspace is permitted.'
        );
      }
      throw err;
    }
  });

  // GET /v1/workspaces/:workspaceId — Get workspace details (requires membership)
  app.get('/v1/workspaces/:workspaceId', async (request, reply): Promise<WorkspaceResponse> => {
    const actor = request.actor!;
    const params = WorkspaceParamsSchema.parse(request.params);

    try {
      const workspace = await withTenantContext(
        runtimePool,
        { userId: actor.userId, workspaceId: params.workspaceId },
        async (client) => {
          return getWorkspace(client, params.workspaceId);
        }
      );

      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      const payload: WorkspaceResponse = {
        data: {
          id: workspace.id,
          name: workspace.name,
          kind: workspace.kind,
          ownerId: workspace.owner_id,
          createdAt: workspace.created_at.toISOString(),
          updatedAt: workspace.updated_at.toISOString(),
        },
        meta: {
          requestId: request.id,
          serverTime: new Date().toISOString(),
        },
      };

      return reply.status(200).send(validateResponse(WorkspaceResponseSchema, payload));
    } catch (err: unknown) {
      if (err instanceof NotFoundError) {
        throw err;
      }
      throw new NotFoundError('Workspace not found');
    }
  });
}
