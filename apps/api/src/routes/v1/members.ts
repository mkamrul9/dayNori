import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {
  AddMemberRequestSchema,
  MemberParamsSchema,
  WorkspaceParamsSchema,
  MemberListResponseSchema,
  MemberResponseSchema,
  type MemberListResponse,
  type MemberResponse,
} from '@daynori/contracts';
import {
  withTenantContext,
  listMemberships,
  addMembership,
  removeMembership,
} from '../../db/index.js';
import { NotFoundError, ValidationError, validateResponse } from '../../plugins/errorHandler.js';

export function registerMemberRoutes(app: FastifyInstance, runtimePool: Pool): void {
  // GET /v1/workspaces/:workspaceId/members
  app.get(
    '/v1/workspaces/:workspaceId/members',
    async (request, reply): Promise<MemberListResponse> => {
      const actor = request.actor!;
      const params = WorkspaceParamsSchema.parse(request.params);

      try {
        const members = await withTenantContext(
          runtimePool,
          { userId: actor.userId, workspaceId: params.workspaceId },
          async (client) => {
            const accessRes = await client.query<{ exists: boolean }>(
              `SELECT app.user_has_workspace_role($1, 'viewer') as exists;`,
              [params.workspaceId]
            );
            if (!accessRes.rows[0]?.exists) {
              throw new NotFoundError('Workspace not found');
            }

            return listMemberships(client, params.workspaceId);
          }
        );

        const payload: MemberListResponse = {
          data: members.map((m) => ({
            workspaceId: m.workspace_id,
            userId: m.user_id,
            role: m.role,
            createdAt: m.created_at.toISOString(),
            updatedAt: m.updated_at.toISOString(),
          })),
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        };

        return reply.status(200).send(validateResponse(MemberListResponseSchema, payload));
      } catch {
        // Consistently return 404 if workspace doesn't exist or caller has no access
        throw new NotFoundError('Workspace not found');
      }
    }
  );

  // POST /v1/workspaces/:workspaceId/members
  app.post(
    '/v1/workspaces/:workspaceId/members',
    async (request, reply): Promise<MemberResponse> => {
      const actor = request.actor!;
      const params = WorkspaceParamsSchema.parse(request.params);
      // Strict schema parse rejects unknown fields
      const body = AddMemberRequestSchema.parse(request.body);

      try {
        const member = await withTenantContext(
          runtimePool,
          { userId: actor.userId, workspaceId: params.workspaceId },
          async (client) => {
            const wsRes = await client.query<{ kind: string }>(
              `SELECT kind FROM app.workspaces WHERE id = $1`,
              [params.workspaceId]
            );
            if (!wsRes.rows[0]) {
              throw new NotFoundError('Workspace not found');
            }
            if (wsRes.rows[0].kind === 'personal') {
              throw new ValidationError(
                'Personal workspaces are owner-only in this release; adding additional members is forbidden.'
              );
            }
            if (wsRes.rows[0].kind === 'room') {
              throw new ValidationError(
                'Room members must join through a single-use invitation. Direct member inserts cannot bypass invitation acceptance.'
              );
            }
            return addMembership(client, {
              workspaceId: params.workspaceId,
              userId: body.userId,
              role: body.role,
            });
          }
        );

        const payload: MemberResponse = {
          data: {
            workspaceId: member.workspace_id,
            userId: member.user_id,
            role: member.role,
            createdAt: member.created_at.toISOString(),
            updatedAt: member.updated_at.toISOString(),
          },
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        };

        return reply.status(201).send(validateResponse(MemberResponseSchema, payload));
      } catch (err: unknown) {
        if (err instanceof NotFoundError || err instanceof ValidationError) {
          throw err;
        }
        // If RLS rejects (e.g. caller is not owner), throw 404 to avoid leaking existence
        throw new NotFoundError('Workspace not found or unauthorized');
      }
    }
  );

  // DELETE /v1/workspaces/:workspaceId/members/:userId
  app.delete(
    '/v1/workspaces/:workspaceId/members/:userId',
    async (request, reply): Promise<{ meta: { requestId: string; serverTime: string } }> => {
      const actor = request.actor!;
      const params = MemberParamsSchema.parse(request.params);

      try {
        const deleted = await withTenantContext(
          runtimePool,
          { userId: actor.userId, workspaceId: params.workspaceId },
          async (client) => {
            return removeMembership(client, params.workspaceId, params.userId);
          }
        );

        if (!deleted) {
          throw new NotFoundError('Membership not found');
        }

        return reply.status(200).send({
          meta: {
            requestId: request.id,
            serverTime: new Date().toISOString(),
          },
        });
      } catch (err: unknown) {
        if (err instanceof NotFoundError) {
          throw err;
        }
        throw new NotFoundError('Membership not found or unauthorized');
      }
    }
  );
}
