import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const WorkspaceKindSchema = z.enum(['personal', 'room']);
export type WorkspaceKind = z.infer<typeof WorkspaceKindSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  kind: WorkspaceKindSchema,
  ownerId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

/**
 * Strict mutation contract: rejects unknown mutation fields
 */
export const CreateWorkspaceRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
    kind: WorkspaceKindSchema.default('personal'),
  })
  .strict();

export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;
export type CreateWorkspaceRequestInput = z.input<typeof CreateWorkspaceRequestSchema>;

export const WorkspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

export type WorkspaceParams = z.infer<typeof WorkspaceParamsSchema>;

export const WorkspaceResponseSchema = z.object({
  data: WorkspaceSchema,
  meta: ResponseMetaSchema,
});

export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>;

export const WorkspaceListResponseSchema = z.object({
  data: z.array(WorkspaceSchema),
  meta: ResponseMetaSchema,
});

export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponseSchema>;
