import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const MAX_BLOCKS_PER_SECTION = 10;
export const MAX_FIELDS_PER_COLLECTION = 20;
export const MAX_TEXT_FIELD_LENGTH = 5000;
export const MAX_RECORDS_PER_SECTION = 1000;

export const CustomBlockTypeSchema = z.enum(['existing_record_view', 'field_collection']);
export type CustomBlockType = z.infer<typeof CustomBlockTypeSchema>;

export const ExistingRecordTargetKindSchema = z.enum([
  'note',
  'task',
  'routine',
  'file',
  'journal',
  'expense_summary',
]);
export type ExistingRecordTargetKind = z.infer<typeof ExistingRecordTargetKindSchema>;

export const ExistingRecordViewFilterSchema = z.object({
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  status: z.enum(['all', 'active', 'completed', 'archived']).default('all').optional(),
  dateRange: z
    .enum(['all', 'today', 'upcoming_7_days', 'current_month'])
    .default('all')
    .optional(),
});
export type ExistingRecordViewFilter = z.infer<typeof ExistingRecordViewFilterSchema>;

export const ExistingRecordViewBlockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.literal('existing_record_view'),
  title: z.string().min(1).max(100),
  targetKind: ExistingRecordTargetKindSchema,
  filter: ExistingRecordViewFilterSchema.default({}),
  displayMode: z.enum(['list', 'card', 'compact']).default('list'),
  limit: z.number().int().min(1).max(50).default(20),
  sortBy: z.enum(['updated_at', 'created_at', 'deadline', 'name']).default('updated_at'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
});
export type ExistingRecordViewBlock = z.infer<typeof ExistingRecordViewBlockSchema>;

export const CustomFieldTypeSchema = z.enum([
  'text',
  'checklist',
  'date',
  'number',
  'link',
  'attachment',
]);
export type CustomFieldType = z.infer<typeof CustomFieldTypeSchema>;

const BaseFieldDefinitionSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Field ID must be alphanumeric, hyphen, or underscore'),
  label: z.string().min(1).max(100),
  required: z.boolean().default(false),
  description: z.string().max(250).optional(),
});

export const TextFieldDefinitionSchema = BaseFieldDefinitionSchema.extend({
  type: z.literal('text'),
  multiline: z.boolean().default(false).optional(),
  maxLength: z.number().int().min(1).max(MAX_TEXT_FIELD_LENGTH).default(MAX_TEXT_FIELD_LENGTH).optional(),
  pattern: z.string().max(200).optional(),
});
export type TextFieldDefinition = z.infer<typeof TextFieldDefinitionSchema>;

export const ChecklistItemSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(500),
  completed: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ChecklistFieldDefinitionSchema = BaseFieldDefinitionSchema.extend({
  type: z.literal('checklist'),
  maxEntries: z.number().int().min(1).max(100).default(50).optional(),
});
export type ChecklistFieldDefinition = z.infer<typeof ChecklistFieldDefinitionSchema>;

export const DateFieldDefinitionSchema = BaseFieldDefinitionSchema.extend({
  type: z.literal('date'),
  minDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  maxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
});
export type DateFieldDefinition = z.infer<typeof DateFieldDefinitionSchema>;

export const NumberFieldDefinitionSchema = BaseFieldDefinitionSchema.extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  precision: z.number().int().min(0).max(6).default(0).optional(),
  unit: z.string().max(20).optional(),
});
export type NumberFieldDefinition = z.infer<typeof NumberFieldDefinitionSchema>;

export const LinkFieldDefinitionSchema = BaseFieldDefinitionSchema.extend({
  type: z.literal('link'),
  placeholder: z.string().max(100).optional(),
});
export type LinkFieldDefinition = z.infer<typeof LinkFieldDefinitionSchema>;

export const AttachmentFieldDefinitionSchema = BaseFieldDefinitionSchema.extend({
  type: z.literal('attachment'),
  allowedMimeTypes: z.array(z.string().min(1).max(100)).max(10).optional(),
});
export type AttachmentFieldDefinition = z.infer<typeof AttachmentFieldDefinitionSchema>;

export const CustomFieldDefinitionSchema = z.discriminatedUnion('type', [
  TextFieldDefinitionSchema,
  ChecklistFieldDefinitionSchema,
  DateFieldDefinitionSchema,
  NumberFieldDefinitionSchema,
  LinkFieldDefinitionSchema,
  AttachmentFieldDefinitionSchema,
]);
export type CustomFieldDefinition = z.infer<typeof CustomFieldDefinitionSchema>;

export const FieldCollectionBlockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.literal('field_collection'),
  title: z.string().min(1).max(100),
  fields: z.array(CustomFieldDefinitionSchema).min(1).max(MAX_FIELDS_PER_COLLECTION),
  defaultViewMode: z.enum(['table', 'cards', 'list']).default('table'),
});
export type FieldCollectionBlock = z.infer<typeof FieldCollectionBlockSchema>;

export const CustomBlockDefinitionSchema = z.discriminatedUnion('type', [
  ExistingRecordViewBlockSchema,
  FieldCollectionBlockSchema,
]);
export type CustomBlockDefinition = z.infer<typeof CustomBlockDefinitionSchema>;

export const CustomSectionSchemaPayloadSchema = z.object({
  version: z.number().int().positive(),
  blocks: z.array(CustomBlockDefinitionSchema).min(1).max(MAX_BLOCKS_PER_SECTION),
});
export type CustomSectionSchemaPayload = z.infer<typeof CustomSectionSchemaPayloadSchema>;

export const CustomSectionLayoutModeSchema = z.enum(['single_column', 'two_column', 'grid']);
export type CustomSectionLayoutMode = z.infer<typeof CustomSectionLayoutModeSchema>;

export const CustomSectionStatusSchema = z.enum(['active', 'archived']);
export type CustomSectionStatus = z.infer<typeof CustomSectionStatusSchema>;

export const CustomSectionItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  currentSchemaVersion: z.number().int().positive(),
  layoutMode: CustomSectionLayoutModeSchema,
  status: CustomSectionStatusSchema,
  rank: z.string(),
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid(),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  currentSchema: CustomSectionSchemaPayloadSchema.optional(),
});
export type CustomSectionItem = z.infer<typeof CustomSectionItemSchema>;

export const CreateCustomSectionRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  layoutMode: CustomSectionLayoutModeSchema.default('single_column').optional(),
  rank: z.string().optional(),
  initialSchema: CustomSectionSchemaPayloadSchema,
});
export type CreateCustomSectionRequest = z.infer<typeof CreateCustomSectionRequestSchema>;

export const UpdateCustomSectionRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  layoutMode: CustomSectionLayoutModeSchema.optional(),
  status: CustomSectionStatusSchema.optional(),
  rank: z.string().optional(),
  expectedRevision: z.number().int().positive(),
});
export type UpdateCustomSectionRequest = z.infer<typeof UpdateCustomSectionRequestSchema>;

export const CreateCustomSectionSchemaRequestSchema = z.object({
  blocks: z.array(CustomBlockDefinitionSchema).min(1).max(MAX_BLOCKS_PER_SECTION),
});
export type CreateCustomSectionSchemaRequest = z.infer<
  typeof CreateCustomSectionSchemaRequestSchema
>;

export const CustomSectionRecordItemSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  schemaVersion: z.number().int().positive(),
  fieldValues: z.record(z.unknown()),
  archivedValues: z.record(z.unknown()).default({}),
  rank: z.string(),
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid(),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomSectionRecordItem = z.infer<typeof CustomSectionRecordItemSchema>;

export const CreateCustomSectionRecordRequestSchema = z.object({
  fieldValues: z.record(z.unknown()),
  rank: z.string().optional(),
});
export type CreateCustomSectionRecordRequest = z.infer<
  typeof CreateCustomSectionRecordRequestSchema
>;

export const UpdateCustomSectionRecordRequestSchema = z.object({
  fieldValues: z.record(z.unknown()),
  rank: z.string().optional(),
  expectedRevision: z.number().int().positive(),
});
export type UpdateCustomSectionRecordRequest = z.infer<
  typeof UpdateCustomSectionRecordRequestSchema
>;

export const CustomSectionResponseSchema = z.object({
  data: CustomSectionItemSchema,
  meta: ResponseMetaSchema,
});
export type CustomSectionResponse = z.infer<typeof CustomSectionResponseSchema>;

export const ListCustomSectionsResponseSchema = z.object({
  data: z.array(CustomSectionItemSchema),
  meta: ResponseMetaSchema,
});
export type ListCustomSectionsResponse = z.infer<typeof ListCustomSectionsResponseSchema>;

export const CustomSectionSchemaResponseSchema = z.object({
  data: CustomSectionSchemaPayloadSchema,
  meta: ResponseMetaSchema,
});
export type CustomSectionSchemaResponse = z.infer<typeof CustomSectionSchemaResponseSchema>;

export const CustomSectionRecordResponseSchema = z.object({
  data: CustomSectionRecordItemSchema,
  meta: ResponseMetaSchema,
});
export type CustomSectionRecordResponse = z.infer<typeof CustomSectionRecordResponseSchema>;

export const ListCustomSectionRecordsResponseSchema = z.object({
  data: z.array(CustomSectionRecordItemSchema),
  meta: ResponseMetaSchema,
});
export type ListCustomSectionRecordsResponse = z.infer<
  typeof ListCustomSectionRecordsResponseSchema
>;

export const QueryExistingRecordViewRequestSchema = z.object({
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  status: z.enum(['all', 'active', 'completed', 'archived']).optional(),
  limit: z.number().int().min(1).max(50).default(20).optional(),
});
export type QueryExistingRecordViewRequest = z.infer<
  typeof QueryExistingRecordViewRequestSchema
>;

export const ExistingRecordViewItemSummarySchema = z.object({
  id: z.string().uuid(),
  targetKind: ExistingRecordTargetKindSchema,
  title: z.string(),
  subtitle: z.string().optional(),
  status: z.string().optional(),
  updatedAt: z.string(),
  referenceUri: z.string(),
});
export type ExistingRecordViewItemSummary = z.infer<
  typeof ExistingRecordViewItemSummarySchema
>;

export const QueryExistingRecordViewResponseSchema = z.object({
  data: z.array(ExistingRecordViewItemSummarySchema),
  meta: ResponseMetaSchema,
});
export type QueryExistingRecordViewResponse = z.infer<
  typeof QueryExistingRecordViewResponseSchema
>;

