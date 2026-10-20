import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { MembershipRoleSchema } from './membership.js';

export const RoomInviteRoleSchema = z.enum(['editor', 'viewer']);
export type RoomInviteRole = z.infer<typeof RoomInviteRoleSchema>;

export const RoomStatusSchema = z.enum(['active', 'archived']);

export const RoomSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    kind: z.literal('room'),
    ownerId: z.string().uuid(),
    status: RoomStatusSchema,
    membershipRevision: z.number().int().nonnegative(),
    actorRole: MembershipRoleSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    archivedAt: z.string().datetime().nullable(),
  })
  .strict();

export type Room = z.infer<typeof RoomSchema>;

export const CreateRoomRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
  })
  .strict();

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const RoomListResponseSchema = z.object({
  data: z.array(RoomSchema),
  meta: ResponseMetaSchema,
});
export type RoomListResponse = z.infer<typeof RoomListResponseSchema>;

export const RoomResponseSchema = z.object({
  data: RoomSchema,
  meta: ResponseMetaSchema,
});
export type RoomResponse = z.infer<typeof RoomResponseSchema>;

export const CreateRoomInvitationRequestSchema = z
  .object({
    role: RoomInviteRoleSchema,
    /** Hours until expiry; default applied server-side when omitted. */
    expiresInHours: z.number().int().min(1).max(168).optional(),
    /** Targeted recipient user id (trusted identity); omit for bearer-link policy. */
    recipientUserId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type CreateRoomInvitationRequest = z.infer<typeof CreateRoomInvitationRequestSchema>;

export const RoomInvitationSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    role: RoomInviteRoleSchema,
    status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
    tokenPrefix: z.string().min(4).max(16),
    expiresAt: z.string().datetime(),
    recipientUserId: z.string().uuid().nullable(),
    deliveryPolicy: z.enum(['bearer_link', 'targeted_recipient']),
    createdAt: z.string().datetime(),
    /** Present only on create — copy locally; never logged. */
    inviteToken: z.string().min(16).optional(),
    invitePath: z.string().min(1).optional(),
  })
  .strict();

export type RoomInvitation = z.infer<typeof RoomInvitationSchema>;

export const RoomInvitationResponseSchema = z.object({
  data: RoomInvitationSchema,
  meta: ResponseMetaSchema,
});
export type RoomInvitationResponse = z.infer<typeof RoomInvitationResponseSchema>;

export const RoomInvitationListResponseSchema = z.object({
  data: z.array(RoomInvitationSchema),
  meta: ResponseMetaSchema,
});
export type RoomInvitationListResponse = z.infer<typeof RoomInvitationListResponseSchema>;

export const RoomInvitationPreviewSchema = z
  .object({
    roomName: z.string().min(1).max(100),
    role: RoomInviteRoleSchema,
    expiresAt: z.string().datetime(),
    status: z.enum(['pending', 'accepted', 'revoked', 'expired', 'unavailable']),
    deliveryPolicy: z.enum(['bearer_link', 'targeted_recipient']),
  })
  .strict();

export const RoomInvitationPreviewResponseSchema = z.object({
  data: RoomInvitationPreviewSchema,
  meta: ResponseMetaSchema,
});
export type RoomInvitationPreviewResponse = z.infer<typeof RoomInvitationPreviewResponseSchema>;

export const AcceptRoomInvitationRequestSchema = z
  .object({
    token: z.string().min(16).max(512),
  })
  .strict();

export type AcceptRoomInvitationRequest = z.infer<typeof AcceptRoomInvitationRequestSchema>;

export const AcceptRoomInvitationResponseSchema = z.object({
  data: z.object({
    status: z.enum(['accepted', 'already_accepted', 'already_member']),
    room: RoomSchema,
  }),
  meta: ResponseMetaSchema,
});
export type AcceptRoomInvitationResponse = z.infer<typeof AcceptRoomInvitationResponseSchema>;

export const UpdateRoomMemberRoleRequestSchema = z
  .object({
    role: MembershipRoleSchema,
  })
  .strict();

export type UpdateRoomMemberRoleRequest = z.infer<typeof UpdateRoomMemberRoleRequestSchema>;

export const TransferRoomOwnershipRequestSchema = z
  .object({
    newOwnerUserId: z.string().uuid(),
  })
  .strict();

export type TransferRoomOwnershipRequest = z.infer<typeof TransferRoomOwnershipRequestSchema>;

export const CopyPersonalItemToRoomRequestSchema = z
  .object({
    sourceWorkspaceId: z.string().uuid(),
    sourceItemId: z.string().uuid(),
    destinationRoomId: z.string().uuid(),
  })
  .strict();

export type CopyPersonalItemToRoomRequest = z.infer<typeof CopyPersonalItemToRoomRequestSchema>;

export const CopyPersonalItemToRoomPreviewSchema = z
  .object({
    sourceItemId: z.string().uuid(),
    sourceTitle: z.string(),
    sourceKind: z.string(),
    destinationRoomId: z.string().uuid(),
    destinationRoomName: z.string(),
    ownershipExplanation: z.string(),
    blocked: z.boolean(),
    blockReason: z.string().nullable(),
  })
  .strict();

export const CopyPersonalItemToRoomPreviewResponseSchema = z.object({
  data: CopyPersonalItemToRoomPreviewSchema,
  meta: ResponseMetaSchema,
});
export type CopyPersonalItemToRoomPreviewResponse = z.infer<
  typeof CopyPersonalItemToRoomPreviewResponseSchema
>;

export const CopyPersonalItemToRoomResponseSchema = z.object({
  data: z.object({
    destinationItemId: z.string().uuid(),
    destinationRoomId: z.string().uuid(),
    sourcePreserved: z.literal(true),
  }),
  meta: ResponseMetaSchema,
});
export type CopyPersonalItemToRoomResponse = z.infer<typeof CopyPersonalItemToRoomResponseSchema>;

/**
 * Phase 52: Room content listing response
 */
export const RoomContentItemSchema = z.object({
  notes: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
  ),
  tasks: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      status: z.string(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })
  ),
  files: z.array(
    z.object({
      id: z.string().uuid(),
      fileName: z.string(),
      mimeType: z.string(),
      byteSize: z.number().int().nonnegative(),
      createdAt: z.string().datetime(),
    })
  ),
});

export type RoomContent = z.infer<typeof RoomContentItemSchema>;

export const RoomContentResponseSchema = z.object({
  data: RoomContentItemSchema,
  meta: ResponseMetaSchema,
});

export type RoomContentResponse = z.infer<typeof RoomContentResponseSchema>;
