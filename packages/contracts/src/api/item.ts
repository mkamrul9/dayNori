import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const ItemKindSchema = z.enum([
  'folder',
  'note',
  'task',
  'todo',
  'routine',
  'journal_entry',
  'file',
  'file_item',
  'calendar_event',
]);
export type ItemKind = z.infer<typeof ItemKindSchema>;

export const ItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  kind: ItemKindSchema,
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  displayOrder: z.number().int(),
});

export type Item = z.infer<typeof ItemSchema>;

/**
 * Strict mutation contract: rejects unknown mutation fields
 */
export const CreateItemRequestSchema = z
  .object({
    kind: ItemKindSchema,
    folderId: z.string().uuid().nullable().optional(),
    displayOrder: z.number().int().optional(),
  })
  .strict();

export type CreateItemRequest = z.infer<typeof CreateItemRequestSchema>;
export type CreateItemRequestInput = z.input<typeof CreateItemRequestSchema>;

export const ItemListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  kind: ItemKindSchema.optional(),
});

export type ItemListQuery = z.infer<typeof ItemListQuerySchema>;
export type ItemListQueryInput = z.input<typeof ItemListQuerySchema>;

export const ItemParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export type ItemParams = z.infer<typeof ItemParamsSchema>;

export const ItemResponseSchema = z.object({
  data: ItemSchema,
  meta: ResponseMetaSchema,
});

export type ItemResponse = z.infer<typeof ItemResponseSchema>;

export const ItemListResponseSchema = z.object({
  data: z.array(ItemSchema),
  meta: ResponseMetaSchema,
});

export type ItemListResponse = z.infer<typeof ItemListResponseSchema>;
