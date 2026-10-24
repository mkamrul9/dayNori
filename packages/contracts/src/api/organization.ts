import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const SecurityScopeSchema = z.enum(['standard', 'vault']);
export type SecurityScope = z.infer<typeof SecurityScopeSchema>;

export const FolderDeletePolicySchema = z.enum(['preserve_to_parent', 'trash_subtree']);
export type FolderDeletePolicy = z.infer<typeof FolderDeletePolicySchema>;

export const FolderSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string().min(1).max(255),
  color: z.string().max(64).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  rank: z.string().default('0'),
  isArchived: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  securityScope: SecurityScopeSchema.default('standard'),
  revision: z.number().int().nonnegative().default(1),
  depth: z.number().int().min(1).max(5).default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const CreateFolderRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    parentId: z.string().uuid().nullable().optional(),
    name: z.string().min(1).max(255),
    color: z.string().max(64).optional(),
    icon: z.string().max(64).optional(),
    rank: z.string().optional(),
    securityScope: SecurityScopeSchema.optional().default('standard'),
  })
  .strict();
export type CreateFolderRequest = z.infer<typeof CreateFolderRequestSchema>;

export const UpdateFolderRequestSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    color: z.string().max(64).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateFolderRequest = z.infer<typeof UpdateFolderRequestSchema>;

export const MoveFolderRequestSchema = z
  .object({
    targetParentId: z.string().uuid().nullable(),
    rank: z.string().optional(),
    baseRevision: z.number().int().nonnegative(),
    expectedCollectionRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type MoveFolderRequest = z.infer<typeof MoveFolderRequestSchema>;

export const ReorderFolderRequestSchema = z
  .object({
    rank: z.string(),
    baseRevision: z.number().int().nonnegative(),
    expectedCollectionRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ReorderFolderRequest = z.infer<typeof ReorderFolderRequestSchema>;

export const ArchiveFolderRequestSchema = z
  .object({
    isArchived: z.boolean(),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ArchiveFolderRequest = z.infer<typeof ArchiveFolderRequestSchema>;

export const PinFolderRequestSchema = z
  .object({
    isPinned: z.boolean(),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type PinFolderRequest = z.infer<typeof PinFolderRequestSchema>;

export const DeleteFolderRequestSchema = z
  .object({
    policy: FolderDeletePolicySchema,
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type DeleteFolderRequest = z.infer<typeof DeleteFolderRequestSchema>;

export const RestoreFolderRequestSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    restoreSubtree: z.boolean().optional(),
    affectedItemIds: z.array(z.string().uuid()).optional(),
    affectedFolderIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type RestoreFolderRequest = z.infer<typeof RestoreFolderRequestSchema>;

export const RebalanceSiblingsRequestSchema = z
  .object({
    parentId: z.string().uuid().nullable().optional(),
    siblingIds: z.array(z.string().uuid()).min(1),
    expectedCollectionRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type RebalanceSiblingsRequest = z.infer<typeof RebalanceSiblingsRequestSchema>;

export const FolderResponseSchema = z.object({
  data: FolderSchema,
  meta: ResponseMetaSchema,
});
export type FolderResponse = z.infer<typeof FolderResponseSchema>;

export const FolderListResponseSchema = z.object({
  data: z.array(FolderSchema),
  meta: ResponseMetaSchema,
});
export type FolderListResponse = z.infer<typeof FolderListResponseSchema>;

export const FolderDeleteResultSchema = z.object({
  data: z.object({
    folderId: z.string().uuid(),
    policy: FolderDeletePolicySchema,
    affectedItemsCount: z.number().int().nonnegative(),
    affectedFoldersCount: z.number().int().nonnegative(),
    targetParentId: z.string().uuid().nullable().optional(),
    revision: z.number().int().nonnegative().optional(),
    affectedFolderIds: z.array(z.string().uuid()).optional(),
    affectedItemIds: z.array(z.string().uuid()).optional(),
  }),
  meta: ResponseMetaSchema,
});
export type FolderDeleteResult = z.infer<typeof FolderDeleteResultSchema>;

// Tags
export const TagSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(64),
  color: z.string().max(64).nullable().optional(),
  revision: z.number().int().nonnegative().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Tag = z.infer<typeof TagSchema>;

export const CreateTagRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(64),
    color: z.string().max(64).optional(),
  })
  .strict();
export type CreateTagRequest = z.infer<typeof CreateTagRequestSchema>;

export const UpdateTagRequestSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    color: z.string().max(64).nullable().optional(),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateTagRequest = z.infer<typeof UpdateTagRequestSchema>;

export const TagResponseSchema = z.object({
  data: TagSchema,
  meta: ResponseMetaSchema,
});
export type TagResponse = z.infer<typeof TagResponseSchema>;

export const TagListResponseSchema = z.object({
  data: z.array(TagSchema),
  meta: ResponseMetaSchema,
});
export type TagListResponse = z.infer<typeof TagListResponseSchema>;

// Item Tags
export const ItemTagSchema = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid(),
  tagId: z.string().uuid(),
  tagName: z.string().optional(),
  tagColor: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type ItemTag = z.infer<typeof ItemTagSchema>;

export const AddItemTagRequestSchema = z
  .object({
    tagId: z.string().uuid(),
  })
  .strict();
export type AddItemTagRequest = z.infer<typeof AddItemTagRequestSchema>;

export const ItemTagListResponseSchema = z.object({
  data: z.array(ItemTagSchema),
  meta: ResponseMetaSchema,
});
export type ItemTagListResponse = z.infer<typeof ItemTagListResponseSchema>;

// Item Links
export const ItemLinkSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sourceItemId: z.string().uuid(),
  targetItemId: z.string().uuid(),
  linkType: z.string().min(1).max(64).default('related'),
  createdAt: z.string().datetime(),
});
export type ItemLink = z.infer<typeof ItemLinkSchema>;

export const CreateItemLinkRequestSchema = z
  .object({
    targetItemId: z.string().uuid(),
    linkType: z.string().min(1).max(64).default('related'),
  })
  .strict();
export type CreateItemLinkRequest = z.infer<typeof CreateItemLinkRequestSchema>;

export const ItemLinkResponseSchema = z.object({
  data: ItemLinkSchema,
  meta: ResponseMetaSchema,
});
export type ItemLinkResponse = z.infer<typeof ItemLinkResponseSchema>;

export const ItemLinkListResponseSchema = z.object({
  data: z.array(ItemLinkSchema),
  meta: ResponseMetaSchema,
});
export type ItemLinkListResponse = z.infer<typeof ItemLinkListResponseSchema>;
