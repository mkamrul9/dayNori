import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const MembershipRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

export const MembershipSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: MembershipRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Membership = z.infer<typeof MembershipSchema>;

/**
 * Strict mutation contract: rejects unknown mutation fields
 */
export const AddMemberRequestSchema = z
  .object({
    userId: z.string().uuid(),
    role: MembershipRoleSchema,
  })
  .strict();

export type AddMemberRequest = z.infer<typeof AddMemberRequestSchema>;

export const MemberParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type MemberParams = z.infer<typeof MemberParamsSchema>;

export const MemberListResponseSchema = z.object({
  data: z.array(MembershipSchema),
  meta: ResponseMetaSchema,
});

export type MemberListResponse = z.infer<typeof MemberListResponseSchema>;

export const MemberResponseSchema = z.object({
  data: MembershipSchema,
  meta: ResponseMetaSchema,
});

export type MemberResponse = z.infer<typeof MemberResponseSchema>;
