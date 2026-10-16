import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { NoteDocumentSchema } from './note.js';
import { SecurityScopeSchema } from './organization.js';

export const JournalPromptEntrySchema = z
  .object({
    id: z.string().optional(),
    prompt: z.string().min(1).max(500),
    response: z.string().max(5000).optional(),
  })
  .strict();

export type JournalPromptEntry = z.infer<typeof JournalPromptEntrySchema>;

export const JournalEntrySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  title: z.string().max(255).nullable(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  timezone: z.string().min(1).max(64),
  document: NoteDocumentSchema,
  plainText: z.string(),
  wordCount: z.number().int().nonnegative(),
  charCount: z.number().int().nonnegative(),
  mood: z.string().max(50).nullable().optional(),
  prompts: z.array(JournalPromptEntrySchema).default([]),
  tags: z.array(z.string().min(1).max(64)).default([]),
  isDraft: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  securityScope: SecurityScopeSchema.default('standard'),
  serverRevision: z.number().int().nonnegative().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const CreateJournalEntryRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().max(255).nullable().optional(),
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    timezone: z.string().min(1).max(64).optional(),
    document: NoteDocumentSchema.optional(),
    plainText: z.string().optional(),
    mood: z.string().max(50).nullable().optional(),
    prompts: z.array(JournalPromptEntrySchema).optional(),
    tags: z.array(z.string().min(1).max(64)).optional(),
    isDraft: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    securityScope: SecurityScopeSchema.optional(),
  })
  .strict();

export type CreateJournalEntryRequest = z.infer<typeof CreateJournalEntryRequestSchema>;

export const UpdateJournalEntryRequestSchema = z
  .object({
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().max(255).nullable().optional(),
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
      .optional(),
    timezone: z.string().min(1).max(64).optional(),
    document: NoteDocumentSchema.optional(),
    plainText: z.string().optional(),
    mood: z.string().max(50).nullable().optional(),
    prompts: z.array(JournalPromptEntrySchema).optional(),
    tags: z.array(z.string().min(1).max(64)).optional(),
    isDraft: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    baseRevision: z.number().int().nonnegative().optional(),
  })
  .strict();

export type UpdateJournalEntryRequest = z.infer<typeof UpdateJournalEntryRequestSchema>;

export const JournalEntryListQuerySchema = z.object({
  folderId: z.string().uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  isDraft: z.preprocess(
    (val) => (val === 'true' ? true : val === 'false' ? false : val),
    z.boolean().optional()
  ),
  isArchived: z.preprocess(
    (val) => (val === 'true' ? true : val === 'false' ? false : val),
    z.boolean().optional()
  ),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type JournalEntryListQuery = z.infer<typeof JournalEntryListQuerySchema>;

export const JournalEntryResponseSchema = z.object({
  data: JournalEntrySchema,
  meta: ResponseMetaSchema,
});

export type JournalEntryResponse = z.infer<typeof JournalEntryResponseSchema>;

export const JournalEntryListResponseSchema = z.object({
  data: z.array(JournalEntrySchema),
  meta: ResponseMetaSchema.extend({
    cursor: z.string().optional(),
    hasMore: z.boolean().optional(),
    totalCount: z.number().int().optional(),
  }),
});

export type JournalEntryListResponse = z.infer<typeof JournalEntryListResponseSchema>;

export const JournalPreviewPreferencesSchema = z
  .object({
    previewHiddenOnToday: z.boolean().default(true),
    suppressBodySnippets: z.boolean().default(true),
  })
  .strict();

export type JournalPreviewPreferences = z.infer<typeof JournalPreviewPreferencesSchema>;
