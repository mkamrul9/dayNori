import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  CreateRoomRequestSchema,
  CreateRoomInvitationRequestSchema,
  AcceptRoomInvitationRequestSchema,
  UpdateRoomMemberRoleRequestSchema,
  TransferRoomOwnershipRequestSchema,
  CopyPersonalItemToRoomRequestSchema,
  RoomListResponseSchema,
  RoomResponseSchema,
  RoomInvitationResponseSchema,
  RoomInvitationListResponseSchema,
  RoomInvitationPreviewResponseSchema,
  AcceptRoomInvitationResponseSchema,
  MemberListResponseSchema,
  MemberResponseSchema,
  CopyPersonalItemToRoomPreviewResponseSchema,
  CopyPersonalItemToRoomResponseSchema,
  WorkspaceParamsSchema,
} from '@daynori/contracts';
import { withTenantContext, withUserContext } from '../../db/index.js';
import { NotFoundError, ValidationError, validateResponse } from '../../plugins/errorHandler.js';
import {
  RoomServiceError,
  acceptRoomInvitation,
  archiveRoom,
  copyPersonalItemToRoom,
  createRoom,
  createRoomInvitation,
  getRoom,
  leaveRoom,
  listRoomInvitations,
  listRoomMembers,
  listRooms,
  previewCopyPersonalItemToRoom,
  previewRoomInvitation,
  removeRoomMember,
  revokeRoomInvitation,
  transferRoomOwnership,
  updateRoomMemberRole,
} from '../../modules/rooms/service.js';

const RoomParamsSchema = z.object({ roomId: z.string().uuid() });
const RoomMemberParamsSchema = RoomParamsSchema.extend({ userId: z.string().uuid() });
const RoomInvitationParamsSchema = RoomParamsSchema.extend({ invitationId: z.string().uuid() });

function handleRoomError(err: unknown): never {
  if (err instanceof RoomServiceError) {
    const error = new Error(err.message) as Error & { statusCode?: number; code?: string };
    error.statusCode = err.statusCode;
    error.code = err.code;
    throw err;
  }
  throw err;
}

function sendRoomError(
  err: unknown,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } }
) {
  if (err instanceof RoomServiceError) {
    return reply.status(err.statusCode).send({
      error: { message: err.message, code: err.code },
    });
  }
  if (err instanceof NotFoundError || err instanceof ValidationError) {
    throw err;
  }
  throw err;
}

export function registerRoomRoutes(app: FastifyInstance, pool: Pool): void {
  app.post('/v1/rooms', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = CreateRoomRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        createRoom(client, { actorId: actor.userId, name: body.name })
      );
      return reply.status(201).send(
        validateResponse(RoomResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.get('/v1/rooms', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        listRooms(client, actor.userId)
      );
      return reply.status(200).send(
        validateResponse(RoomListResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.get('/v1/rooms/:roomId', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    try {
      const data = await withTenantContext(pool, { userId: actor.userId, workspaceId: roomId }, (client) =>
        getRoom(client, roomId, actor.userId)
      );
      return reply.status(200).send(
        validateResponse(RoomResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.post('/v1/rooms/:roomId/invitations', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    const body = CreateRoomInvitationRequestSchema.parse(request.body);
    try {
      const data = await withTenantContext(pool, { userId: actor.userId, workspaceId: roomId }, (client) =>
        createRoomInvitation(client, {
          roomId,
          actorId: actor.userId,
          role: body.role,
          expiresInHours: body.expiresInHours,
          recipientUserId: body.recipientUserId,
        })
      );
      reply.header('Cache-Control', 'no-store');
      return reply.status(201).send(
        validateResponse(RoomInvitationResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.get('/v1/rooms/:roomId/invitations', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    try {
      const data = await withTenantContext(pool, { userId: actor.userId, workspaceId: roomId }, (client) =>
        listRoomInvitations(client, roomId, actor.userId)
      );
      return reply.status(200).send(
        validateResponse(RoomInvitationListResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.post('/v1/rooms/:roomId/invitations/:invitationId/revoke', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId, invitationId } = RoomInvitationParamsSchema.parse(request.params);
    try {
      await withTenantContext(pool, { userId: actor.userId, workspaceId: roomId }, (client) =>
        revokeRoomInvitation(client, { roomId, invitationId, actorId: actor.userId })
      );
      return reply.status(200).send({
        data: { revoked: true },
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.get('/v1/room-invitations/preview', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const q = z.object({ token: z.string().min(16).max(512) }).parse(request.query);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        previewRoomInvitation(client, q.token)
      );
      return reply.status(200).send(
        validateResponse(RoomInvitationPreviewResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.post('/v1/room-invitations/accept', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = AcceptRoomInvitationRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        acceptRoomInvitation(client, { actorId: actor.userId, token: body.token })
      );
      return reply.status(200).send(
        validateResponse(AcceptRoomInvitationResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.get('/v1/rooms/:roomId/members', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    try {
      const members = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId: roomId },
        (client) => listRoomMembers(client, roomId, actor.userId)
      );
      return reply.status(200).send(
        validateResponse(MemberListResponseSchema, {
          data: members.map((m) => ({
            workspaceId: m.workspace_id,
            userId: m.user_id,
            role: m.role,
            createdAt: m.created_at.toISOString(),
            updatedAt: m.updated_at.toISOString(),
          })),
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.patch('/v1/rooms/:roomId/members/:userId', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId, userId } = RoomMemberParamsSchema.parse(request.params);
    const body = UpdateRoomMemberRoleRequestSchema.parse(request.body);
    try {
      const member = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId: roomId },
        (client) =>
          updateRoomMemberRole(client, {
            roomId,
            actorId: actor.userId,
            targetUserId: userId,
            role: body.role,
          })
      );
      return reply.status(200).send(
        validateResponse(MemberResponseSchema, {
          data: {
            workspaceId: member!.workspace_id,
            userId: member!.user_id,
            role: member!.role,
            createdAt: member!.created_at.toISOString(),
            updatedAt: member!.updated_at.toISOString(),
          },
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.delete('/v1/rooms/:roomId/members/:userId', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId, userId } = RoomMemberParamsSchema.parse(request.params);
    try {
      await withTenantContext(pool, { userId: actor.userId, workspaceId: roomId }, (client) =>
        removeRoomMember(client, { roomId, actorId: actor.userId, targetUserId: userId })
      );
      return reply.status(200).send({
        data: { removed: true },
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.post('/v1/rooms/:roomId/leave', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    try {
      await withTenantContext(pool, { userId: actor.userId, workspaceId: roomId }, (client) =>
        leaveRoom(client, { roomId, actorId: actor.userId })
      );
      return reply.status(200).send({
        data: { left: true },
        meta: { requestId: request.id, serverTime: new Date().toISOString() },
      });
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.post('/v1/rooms/:roomId/transfer-ownership', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    const body = TransferRoomOwnershipRequestSchema.parse(request.body);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId: roomId },
        (client) =>
          transferRoomOwnership(client, {
            roomId,
            actorId: actor.userId,
            newOwnerUserId: body.newOwnerUserId,
          })
      );
      return reply.status(200).send(
        validateResponse(RoomResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.post('/v1/rooms/:roomId/archive', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    try {
      const data = await withTenantContext(pool, { userId: actor.userId, workspaceId: roomId }, (client) =>
        archiveRoom(client, { roomId, actorId: actor.userId })
      );
      return reply.status(200).send(
        validateResponse(RoomResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.post('/v1/rooms/copy-preview', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = CopyPersonalItemToRoomRequestSchema.parse(request.body);
    try {
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId: body.sourceWorkspaceId },
        (client) =>
          previewCopyPersonalItemToRoom(client, {
            actorId: actor.userId,
            sourceWorkspaceId: body.sourceWorkspaceId,
            sourceItemId: body.sourceItemId,
            destinationRoomId: body.destinationRoomId,
          })
      );
      return reply.status(200).send(
        validateResponse(CopyPersonalItemToRoomPreviewResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  app.post('/v1/rooms/copy', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const body = CopyPersonalItemToRoomRequestSchema.parse(request.body);
    try {
      // Authorize source personal workspace in tenant context; destination checks inside service.
      const data = await withTenantContext(
        pool,
        { userId: actor.userId, workspaceId: body.sourceWorkspaceId },
        (client) =>
          copyPersonalItemToRoom(client, {
            actorId: actor.userId,
            sourceWorkspaceId: body.sourceWorkspaceId,
            sourceItemId: body.sourceItemId,
            destinationRoomId: body.destinationRoomId,
          })
      );
      return reply.status(201).send(
        validateResponse(CopyPersonalItemToRoomResponseSchema, {
          data,
          meta: { requestId: request.id, serverTime: new Date().toISOString() },
        })
      );
    } catch (err) {
      return sendRoomError(err, reply);
    }
  });

  // Silence unused schema import if tree-shaken oddly
  void WorkspaceParamsSchema;
  void handleRoomError;
}
