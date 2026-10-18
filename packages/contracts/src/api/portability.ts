import { z } from 'zod';

export const ReauthenticatePurposeSchema = z.enum([
  'protected_export',
  'account_deletion',
  'workspace_deletion',
]);
export type ReauthenticatePurpose = z.infer<typeof ReauthenticatePurposeSchema>;

export const ReauthenticateRequestSchema = z.object({
  purpose: ReauthenticatePurposeSchema,
  password: z.string().optional(),
  sessionBinding: z.string().optional(),
});
export type ReauthenticateRequest = z.infer<typeof ReauthenticateRequestSchema>;

export const ReauthenticateResponseSchema = z.object({
  reauthToken: z.string(),
  expiresAt: z.string(),
  purpose: ReauthenticatePurposeSchema,
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});
export type ReauthenticateResponse = z.infer<typeof ReauthenticateResponseSchema>;

export const ExportManifestSummarySchema = z.object({
  foldersCount: z.number().int().nonnegative(),
  notesCount: z.number().int().nonnegative(),
  tasksCount: z.number().int().nonnegative(),
  routinesCount: z.number().int().nonnegative(),
  journalCount: z.number().int().nonnegative(),
  calendarCount: z.number().int().nonnegative(),
  filesCount: z.number().int().nonnegative(),
  totalBinaryBytes: z.number().int().nonnegative(),
});
export type ExportManifestSummary = z.infer<typeof ExportManifestSummarySchema>;

export const ExportManifestExclusionSchema = z.object({
  category: z.string(),
  reason: z.string(),
});
export type ExportManifestExclusion = z.infer<typeof ExportManifestExclusionSchema>;

export const ExportManifestSchema = z.object({
  schemaVersion: z.literal(1),
  exportVersion: z.string(),
  createdAt: z.string(),
  workspace: z.object({
    id: z.string().uuid(),
    name: z.string(),
    kind: z.string(),
    timeZone: z.string().optional(),
    preferredLocale: z.string().optional(),
  }),
  exportedBy: z.object({
    userId: z.string().uuid(),
  }),
  format: z.literal('daynori-workspace-export-v1'),
  summary: ExportManifestSummarySchema,
  checksums: z.record(z.string(), z.string()),
  exclusions: z.array(ExportManifestExclusionSchema),
});
export type ExportManifest = z.infer<typeof ExportManifestSchema>;

export const CreateExportRequestSchema = z.object({
  reauthToken: z.string(),
  includeAttachments: z.boolean().default(true),
});
export type CreateExportRequest = z.infer<typeof CreateExportRequestSchema>;

export const CreateExportResponseSchema = z.object({
  exportId: z.string().uuid(),
  status: z.enum(['completed', 'pending', 'processing', 'failed']),
  downloadUrl: z.string().optional(),
  expiresAt: z.string(),
  manifestSummary: ExportManifestSummarySchema,
  exclusions: z.array(ExportManifestExclusionSchema),
});
export type CreateExportResponse = z.infer<typeof CreateExportResponseSchema>;

export const ImportDuplicateStrategySchema = z.enum(['skip', 'create_copy', 'overwrite_if_newer']);
export type ImportDuplicateStrategy = z.infer<typeof ImportDuplicateStrategySchema>;

export const ImportDuplicateItemSchema = z.object({
  entityType: z.enum(['folder', 'note', 'task', 'routine', 'journal', 'calendar', 'file']),
  identifier: z.string(),
  title: z.string(),
  existingId: z.string(),
  importedId: z.string(),
  existingUpdatedAt: z.string().optional(),
  importedUpdatedAt: z.string().optional(),
});
export type ImportDuplicateItem = z.infer<typeof ImportDuplicateItemSchema>;

export const ImportQuotaCheckSchema = z.object({
  requiredBytes: z.number().int().nonnegative(),
  availableBytes: z.number().int().nonnegative(),
  isQuotaSufficient: z.boolean(),
});
export type ImportQuotaCheck = z.infer<typeof ImportQuotaCheckSchema>;

export const ImportPreviewResponseSchema = z.object({
  previewId: z.string().uuid(),
  manifestSummary: ExportManifestSummarySchema,
  detectedDuplicates: z.array(ImportDuplicateItemSchema),
  availableDuplicateStrategies: z.array(ImportDuplicateStrategySchema),
  storageQuota: ImportQuotaCheckSchema,
  warnings: z.array(z.string()),
  isValid: z.boolean(),
  expiresAt: z.string(),
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponseSchema>;

export const ExecuteImportRequestSchema = z.object({
  previewId: z.string().uuid(),
  duplicateStrategy: ImportDuplicateStrategySchema.default('create_copy'),
});
export type ExecuteImportRequest = z.infer<typeof ExecuteImportRequestSchema>;

export const ExecuteImportResponseSchema = z.object({
  success: z.boolean(),
  workspaceId: z.string().uuid(),
  duplicateStrategy: ImportDuplicateStrategySchema,
  importedCounts: z.object({
    folders: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    tasks: z.number().int().nonnegative(),
    routines: z.number().int().nonnegative(),
    journal: z.number().int().nonnegative(),
    calendar: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
  }),
  skippedCounts: z.number().int().nonnegative(),
  copiedCounts: z.number().int().nonnegative(),
  overwrittenCounts: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  completedAt: z.string(),
});
export type ExecuteImportResponse = z.infer<typeof ExecuteImportResponseSchema>;
