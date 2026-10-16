import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { SecurityScopeSchema } from './organization.js';

// --- Portable Note Document AST ---

export const NoteMarkSchema = z.enum(['bold', 'italic']);
export type NoteMark = z.infer<typeof NoteMarkSchema>;

export const NoteTextInlineSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  marks: z.array(NoteMarkSchema).optional(),
});
export type NoteTextInline = z.infer<typeof NoteTextInlineSchema>;

export const NoteHardBreakInlineSchema = z.object({
  type: z.literal('hard_break'),
});
export type NoteHardBreakInline = z.infer<typeof NoteHardBreakInlineSchema>;

export const NoteInlineNodeSchema = z.discriminatedUnion('type', [
  NoteTextInlineSchema,
  NoteHardBreakInlineSchema,
]);
export type NoteInlineNode = z.infer<typeof NoteInlineNodeSchema>;

export const NoteParagraphBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal('paragraph'),
  content: z.array(NoteInlineNodeSchema).optional(),
});
export type NoteParagraphBlock = z.infer<typeof NoteParagraphBlockSchema>;

export const NoteHeadingBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  content: z.array(NoteInlineNodeSchema).optional(),
});
export type NoteHeadingBlock = z.infer<typeof NoteHeadingBlockSchema>;

export const NoteListItemNodeSchema = z.object({
  id: z.string().optional(),
  type: z.literal('list_item'),
  content: z.array(NoteInlineNodeSchema).default([]),
});
export type NoteListItemNode = z.infer<typeof NoteListItemNodeSchema>;

export const NoteBulletListBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal('bullet_list'),
  items: z.array(NoteListItemNodeSchema).default([]),
});
export type NoteBulletListBlock = z.infer<typeof NoteBulletListBlockSchema>;

export const NoteOrderedListBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal('ordered_list'),
  items: z.array(NoteListItemNodeSchema).default([]),
});
export type NoteOrderedListBlock = z.infer<typeof NoteOrderedListBlockSchema>;

export const NoteChecklistItemNodeSchema = z.object({
  id: z.string().optional(),
  type: z.literal('checklist_item'),
  checked: z.boolean().default(false),
  content: z.array(NoteInlineNodeSchema).default([]),
});
export type NoteChecklistItemNode = z.infer<typeof NoteChecklistItemNodeSchema>;

export const NoteChecklistBlockSchema = z.object({
  id: z.string().optional(),
  type: z.literal('checklist'),
  items: z.array(NoteChecklistItemNodeSchema).default([]),
});
export type NoteChecklistBlock = z.infer<typeof NoteChecklistBlockSchema>;

export const NoteBlockNodeSchema = z.discriminatedUnion('type', [
  NoteParagraphBlockSchema,
  NoteHeadingBlockSchema,
  NoteBulletListBlockSchema,
  NoteOrderedListBlockSchema,
  NoteChecklistBlockSchema,
]);
export type NoteBlockNode = z.infer<typeof NoteBlockNodeSchema>;

export const NoteDocumentSchema = z.object({
  version: z.literal(1).default(1),
  type: z.literal('doc').default('doc'),
  content: z.array(NoteBlockNodeSchema).default([]),
});
export type NoteDocument = z.infer<typeof NoteDocumentSchema>;

// --- Note Entity & Requests ---

export const NoteSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  title: z.string().max(255),
  document: NoteDocumentSchema,
  plainText: z.string(),
  wordCount: z.number().int().nonnegative(),
  charCount: z.number().int().nonnegative(),
  rank: z.string().default('00001000'),
  isArchived: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  securityScope: SecurityScopeSchema.default('standard'),
  revision: z.number().int().nonnegative().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type Note = z.infer<typeof NoteSchema>;

export const CreateNoteRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().max(255).optional(),
    document: NoteDocumentSchema.optional(),
    plainText: z.string().optional(),
    rank: z.string().optional(),
    isPinned: z.boolean().optional(),
    securityScope: SecurityScopeSchema.optional().default('standard'),
  })
  .strict();
export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;

export const UpdateNoteRequestSchema = z
  .object({
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().max(255).optional(),
    document: NoteDocumentSchema.optional(),
    plainText: z.string().optional(),
    rank: z.string().optional(),
    isPinned: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;

export const TrashNoteRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type TrashNoteRequest = z.infer<typeof TrashNoteRequestSchema>;

export const RestoreNoteRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type RestoreNoteRequest = z.infer<typeof RestoreNoteRequestSchema>;

export const NoteParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  noteId: z.string().uuid(),
});
export type NoteParams = z.infer<typeof NoteParamsSchema>;

export const QueryBooleanSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
  }
  return val;
}, z.boolean().optional());

export const NoteListQuerySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  isArchived: QueryBooleanSchema,
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type NoteListQuery = z.infer<typeof NoteListQuerySchema>;

export const NoteResponseSchema = z.object({
  data: NoteSchema,
  meta: ResponseMetaSchema,
});
export type NoteResponse = z.infer<typeof NoteResponseSchema>;

export const NoteListResponseSchema = z.object({
  data: z.array(NoteSchema),
  meta: ResponseMetaSchema,
});
export type NoteListResponse = z.infer<typeof NoteListResponseSchema>;
