import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  SendRoomChatMessageRequestSchema,
  EditRoomChatMessageRequestSchema,
  UpdateRoomChatReadStateRequestSchema,
  UpdateRoomChatMuteRequestSchema,
  RoomChatMessageResponseSchema,
  RoomChatMessageListResponseSchema,
  RoomChatReadStateResponseSchema,
  RoomChatEventsResponseSchema,
} from '@daynori/contracts';
import { withUserContext } from '../../db/index.js';
import { NotFoundError, ValidationError, validateResponse } from '../../plugins/errorHandler.js';
import {
  ChatServiceError,
  deleteRoomMessage,
  editRoomMessage,
  getRoomChatReadState,
  listRoomChatEvents,
  listRoomMessages,
  markChatEventPublished,
  publishChatAfterCommit,
  sendRoomMessage,
  updateRoomChatMute,
  updateRoomChatReadState,
} from '../../modules/chat/service.js';

const RoomParamsSchema = z.object({ roomId: z.string().uuid() });
const MessageParamsSchema = RoomParamsSchema.extend({ messageId: z.string().uuid() });

function sendChatError(
  err: unknown,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } }
) {
  if (err instanceof ChatServiceError) {
    return reply.status(err.statusCode).send({
      error: { message: err.message, code: err.code },
    });
  }
  if (err instanceof NotFoundError || err instanceof ValidationError) {
    throw err;
  }
  throw err;
}

function meta(requestId: string) {
  return { requestId, serverTime: new Date().toISOString() };
}

export function registerChatRoutes(app: FastifyInstance, pool: Pool): void {
  app.post('/v1/rooms/:roomId/messages', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    const body = SendRoomChatMessageRequestSchema.parse(request.body);
    try {
      const result = await withUserContext(pool, actor.userId, (client) =>
        sendRoomMessage(client, {
          roomId,
          actorId: actor.userId,
          clientMessageId: body.clientMessageId,
          body: body.body,
          attachmentFileId: body.attachmentFileId,
        })
      );
      if (!result.isReplay) {
        publishChatAfterCommit({
          roomId,
          serverOrder: result.eventServerOrder,
          eventType: 'room_message.created',
          messageId: result.message.id,
        });
        await withUserContext(pool, actor.userId, (client) =>
          markChatEventPublished(client, roomId, result.eventServerOrder)
        );
      }
      return reply.status(result.isReplay ? 200 : 201).send(
        validateResponse(RoomChatMessageResponseSchema, {
          data: result.message,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendChatError(err, reply);
    }
  });

  app.get('/v1/rooms/:roomId/messages', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    const query = z
      .object({
        beforeOrder: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().optional(),
      })
      .parse(request.query);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        listRoomMessages(client, {
          roomId,
          actorId: actor.userId,
          beforeOrder: query.beforeOrder,
          limit: query.limit,
        })
      );
      return reply.send(
        validateResponse(RoomChatMessageListResponseSchema, {
          data,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendChatError(err, reply);
    }
  });

  app.patch('/v1/rooms/:roomId/messages/:messageId', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId, messageId } = MessageParamsSchema.parse(request.params);
    const body = EditRoomChatMessageRequestSchema.parse(request.body);
    try {
      const result = await withUserContext(pool, actor.userId, (client) =>
        editRoomMessage(client, {
          roomId,
          messageId,
          actorId: actor.userId,
          body: body.body,
          baseRevision: body.baseRevision,
        })
      );
      if (!result.isReplay) {
        publishChatAfterCommit({
          roomId,
          serverOrder: result.eventServerOrder,
          eventType: 'room_message.edited',
          messageId: result.message.id,
        });
        await withUserContext(pool, actor.userId, (client) =>
          markChatEventPublished(client, roomId, result.eventServerOrder)
        );
      }
      return reply.send(
        validateResponse(RoomChatMessageResponseSchema, {
          data: result.message,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendChatError(err, reply);
    }
  });

  app.delete('/v1/rooms/:roomId/messages/:messageId', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId, messageId } = MessageParamsSchema.parse(request.params);
    try {
      const result = await withUserContext(pool, actor.userId, (client) =>
        deleteRoomMessage(client, {
          roomId,
          messageId,
          actorId: actor.userId,
        })
      );
      if (!result.isReplay) {
        publishChatAfterCommit({
          roomId,
          serverOrder: result.eventServerOrder,
          eventType: 'room_message.deleted',
          messageId: result.message.id,
        });
        await withUserContext(pool, actor.userId, (client) =>
          markChatEventPublished(client, roomId, result.eventServerOrder)
        );
      }
      return reply.send(
        validateResponse(RoomChatMessageResponseSchema, {
          data: result.message,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendChatError(err, reply);
    }
  });

  app.get('/v1/rooms/:roomId/chat/read-state', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        getRoomChatReadState(client, { roomId, actorId: actor.userId })
      );
      return reply.send(
        validateResponse(RoomChatReadStateResponseSchema, {
          data,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendChatError(err, reply);
    }
  });

  app.put('/v1/rooms/:roomId/chat/read-state', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    const body = UpdateRoomChatReadStateRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        updateRoomChatReadState(client, {
          roomId,
          actorId: actor.userId,
          lastReadServerOrder: body.lastReadServerOrder,
        })
      );
      return reply.send(
        validateResponse(RoomChatReadStateResponseSchema, {
          data,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendChatError(err, reply);
    }
  });

  app.put('/v1/rooms/:roomId/chat/mute', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    const body = UpdateRoomChatMuteRequestSchema.parse(request.body);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        updateRoomChatMute(client, {
          roomId,
          actorId: actor.userId,
          muted: body.muted,
          mutedUntil: body.mutedUntil,
        })
      );
      return reply.send(
        validateResponse(RoomChatReadStateResponseSchema, {
          data,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendChatError(err, reply);
    }
  });

  app.get('/v1/rooms/:roomId/chat/events', async (request, reply) => {
    const actor = request.actor;
    if (!actor) return reply.status(401).send({ error: { message: 'Authentication required' } });
    const { roomId } = RoomParamsSchema.parse(request.params);
    const query = z
      .object({
        sinceOrder: z.coerce.number().int().nonnegative().optional(),
        limit: z.coerce.number().int().positive().optional(),
      })
      .parse(request.query);
    try {
      const data = await withUserContext(pool, actor.userId, (client) =>
        listRoomChatEvents(client, {
          roomId,
          actorId: actor.userId,
          sinceOrder: query.sinceOrder,
          limit: query.limit,
        })
      );
      return reply.send(
        validateResponse(RoomChatEventsResponseSchema, {
          data,
          meta: meta(request.id),
        })
      );
    } catch (err) {
      return sendChatError(err, reply);
    }
  });
}
