import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const KnowledgePresetKindSchema = z.enum(['guide', 'cheatsheet', 'reference']);
export type KnowledgePresetKind = z.infer<typeof KnowledgePresetKindSchema>;

export const KnowledgeSavedViewFilterSchema = z.object({
  presetKind: z.enum(['guide', 'cheatsheet', 'reference', 'all']).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tagNames: z.array(z.string().min(1).max(64)).max(10).optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional().default(false),
  searchQuery: z.string().max(100).optional(),
  sortBy: z.enum(['title', 'updatedAt', 'createdAt', 'rank']).optional().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type KnowledgeSavedViewFilter = z.infer<typeof KnowledgeSavedViewFilterSchema>;

export const SavedViewSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(255).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  entityType: z.enum(['knowledge', 'notes', 'all']).default('knowledge'),
  filter: KnowledgeSavedViewFilterSchema,
  rank: z.string().default('0'),
  isPinned: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SavedView = z.infer<typeof SavedViewSchema>;

export const CreateSavedViewRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(100),
    description: z.string().max(255).optional(),
    icon: z.string().max(64).optional(),
    color: z.string().max(64).optional(),
    entityType: z.enum(['knowledge', 'notes', 'all']).optional().default('knowledge'),
    filter: KnowledgeSavedViewFilterSchema.optional().default({}),
    rank: z.string().optional().default('0'),
    isPinned: z.boolean().optional().default(false),
  })
  .strict();
export type CreateSavedViewRequest = z.input<typeof CreateSavedViewRequestSchema>;

export const UpdateSavedViewRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(255).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
    color: z.string().max(64).nullable().optional(),
    filter: KnowledgeSavedViewFilterSchema.optional(),
    rank: z.string().optional(),
    isPinned: z.boolean().optional(),
  })
  .strict();
export type UpdateSavedViewRequest = z.input<typeof UpdateSavedViewRequestSchema>;

export const SavedViewResponseSchema = z.object({
  data: SavedViewSchema,
  meta: ResponseMetaSchema,
});
export type SavedViewResponse = z.infer<typeof SavedViewResponseSchema>;

export const SavedViewListResponseSchema = z.object({
  data: z.array(SavedViewSchema),
  meta: ResponseMetaSchema,
});
export type SavedViewListResponse = z.infer<typeof SavedViewListResponseSchema>;

// --- Resolved Item Links & Backlinks ---

export const ResolvedItemLinkTargetSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: z.string(),
  folderId: z.string().uuid().nullable(),
  isAvailable: z.boolean(),
  unavailableReason: z.enum(['deleted', 'not_found', 'unauthorized']).optional(),
});
export type ResolvedItemLinkTarget = z.infer<typeof ResolvedItemLinkTargetSchema>;

export const ResolvedItemLinkSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sourceItemId: z.string().uuid(),
  targetItemId: z.string().uuid(),
  linkType: z.string(),
  direction: z.enum(['outgoing', 'incoming']),
  targetId: z.string().uuid(),
  targetTitle: z.string().nullable(),
  isAvailable: z.boolean(),
  unavailableReason: z.enum(['deleted', 'not_found', 'unauthorized']).optional(),
  createdAt: z.string().datetime(),
  target: ResolvedItemLinkTargetSchema,
});
export type ResolvedItemLink = z.infer<typeof ResolvedItemLinkSchema>;

export const ResolvedItemLinkListResponseSchema = z.object({
  data: z.array(ResolvedItemLinkSchema),
  meta: ResponseMetaSchema,
});
export type ResolvedItemLinkListResponse = z.infer<typeof ResolvedItemLinkListResponseSchema>;
