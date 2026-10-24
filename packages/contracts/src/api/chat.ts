import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const RoomChatMessageSchema = z
  .object({
    id: z.string().uuid(),
    roomId: z.string().uuid(),
    senderId: z.string().uuid(),
    clientMessageId: z.string().uuid(),
    body: z.string().max(4000),
    bodyRevision: z.number().int().positive(),
    attachmentFileId: z.string().uuid().nullable(),
    serverOrder: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
  })
  .strict();

export type RoomChatMessage = z.infer<typeof RoomChatMessageSchema>;

export const SendRoomChatMessageRequestSchema = z
  .object({
    clientMessageId: z.string().uuid(),
    body: z.string().min(1).max(4000),
    attachmentFileId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type SendRoomChatMessageRequest = z.infer<typeof SendRoomChatMessageRequestSchema>;

export const EditRoomChatMessageRequestSchema = z
  .object({
    body: z.string().min(1).max(4000),
    baseRevision: z.number().int().positive(),
  })
  .strict();

export type EditRoomChatMessageRequest = z.infer<typeof EditRoomChatMessageRequestSchema>;

export const RoomChatMessageResponseSchema = z.object({
  data: RoomChatMessageSchema,
  meta: ResponseMetaSchema,
});
export type RoomChatMessageResponse = z.infer<typeof RoomChatMessageResponseSchema>;

export const RoomChatMessageListResponseSchema = z.object({
  data: z.object({
    messages: z.array(RoomChatMessageSchema),
    nextBeforeOrder: z.number().int().positive().nullable(),
    hasMore: z.boolean(),
  }),
  meta: ResponseMetaSchema,
});
export type RoomChatMessageListResponse = z.infer<typeof RoomChatMessageListResponseSchema>;

export const RoomChatReadStateSchema = z
  .object({
    roomId: z.string().uuid(),
    lastReadServerOrder: z.number().int().nonnegative(),
    unreadCount: z.number().int().nonnegative(),
    muted: z.boolean(),
    mutedUntil: z.string().datetime().nullable(),
    lastReadAt: z.string().datetime().nullable(),
  })
  .strict();

export type RoomChatReadState = z.infer<typeof RoomChatReadStateSchema>;

export const RoomChatReadStateResponseSchema = z.object({
  data: RoomChatReadStateSchema,
  meta: ResponseMetaSchema,
});
export type RoomChatReadStateResponse = z.infer<typeof RoomChatReadStateResponseSchema>;

export const UpdateRoomChatReadStateRequestSchema = z
  .object({
    lastReadServerOrder: z.number().int().nonnegative(),
  })
  .strict();

export type UpdateRoomChatReadStateRequest = z.infer<typeof UpdateRoomChatReadStateRequestSchema>;

export const UpdateRoomChatMuteRequestSchema = z
  .object({
    muted: z.boolean(),
    mutedUntil: z.string().datetime().nullable().optional(),
  })
  .strict();

export type UpdateRoomChatMuteRequest = z.infer<typeof UpdateRoomChatMuteRequestSchema>;

export const RoomChatEventSchema = z
  .object({
    id: z.string().uuid(),
    roomId: z.string().uuid(),
    serverOrder: z.number().int().positive(),
    eventType: z.enum(['room_message.created', 'room_message.edited', 'room_message.deleted']),
    messageId: z.string().uuid(),
    message: RoomChatMessageSchema.nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type RoomChatEvent = z.infer<typeof RoomChatEventSchema>;

export const RoomChatEventsResponseSchema = z.object({
  data: z.object({
    events: z.array(RoomChatEventSchema),
    latestServerOrder: z.number().int().nonnegative(),
    connectionStatus: z.enum(['connected', 'reconnecting', 'offline']),
  }),
  meta: ResponseMetaSchema,
});
export type RoomChatEventsResponse = z.infer<typeof RoomChatEventsResponseSchema>;
