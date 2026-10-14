import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  CreateWorkspaceRequestSchema,
  WorkspaceParamsSchema,
  WorkspaceListResponseSchema,
  WorkspaceResponseSchema,
  type WorkspaceListResponse,
  type WorkspaceResponse,
} from '@daynori/contracts';
import {
  withUserContext,
  withTenantContext,
  listWorkspaces,
  getWorkspace,
  createWorkspaceWithOwner,
} from '../../db/index.js';
import { NotFoundError } from '../../plugins/errorHandler.js';

export function registerWorkspaceRoutes(app: FastifyInstance, runtimePool: Pool): void {
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

    return reply.status(200).send(WorkspaceListResponseSchema.parse(payload));
  });

  // POST /v1/workspaces — Create a new workspace and bootstrap caller as owner
  app.post('/v1/workspaces', async (request, reply): Promise<WorkspaceResponse> => {
    const actor = request.actor!;
    // Strict schema parse rejects unknown fields
    const body = CreateWorkspaceRequestSchema.parse(request.body);

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

    return reply.status(201).send(WorkspaceResponseSchema.parse(payload));
  });

  // GET /v1/workspaces/:workspaceId — Get workspace details
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

      return reply.status(200).send(WorkspaceResponseSchema.parse(payload));
    } catch (err: unknown) {
      // If RLS rejects access (e.g. non-member), consistently return 404 to avoid leaking existence
      if (err instanceof NotFoundError) {
        throw err;
      }
      throw new NotFoundError('Workspace not found');
    }
  });
}
