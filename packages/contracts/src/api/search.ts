import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const SearchItemTypeSchema = z.enum([
  'all',
  'note',
  'task',
  'journal',
  'file',
  'knowledge',
  'folder',
]);
export type SearchItemType = z.infer<typeof SearchItemTypeSchema>;

export const SearchQuerySchema = z.object({
  q: z.string().max(200).optional().default(''),
  types: z.array(SearchItemTypeSchema).optional(),
  folderId: z.string().uuid().optional(),
  tagNames: z.array(z.string().min(1).max(50)).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  includeArchived: z.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchQueryInput = z.input<typeof SearchQuerySchema>;

export const SearchResultItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  displayType: z.enum(['note', 'task', 'journal', 'file', 'knowledge', 'folder']),
  title: z.string(),
  snippet: z.string(),
  folderId: z.string().uuid().nullable().optional(),
  folderPath: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResponseMetaSchema = ResponseMetaSchema.extend({
  totalCount: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  coverage: z.enum(['complete', 'offline_limited']),
});
export type SearchResponseMeta = z.infer<typeof SearchResponseMetaSchema>;

export const SearchResponseSchema = z.object({
  data: z.array(SearchResultItemSchema),
  meta: SearchResponseMetaSchema,
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
