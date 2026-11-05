import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const FeedbackReportTypeSchema = z.enum(['bug', 'suggestion', 'contact']);
export type FeedbackReportType = z.infer<typeof FeedbackReportTypeSchema>;

export const FeedbackFrequencySchema = z.enum(['always', 'often', 'sometimes', 'once']);
export type FeedbackFrequency = z.infer<typeof FeedbackFrequencySchema>;

export const FeedbackSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type FeedbackSeverity = z.infer<typeof FeedbackSeveritySchema>;

export const FeedbackReportStatusSchema = z.enum([
  'new',
  'received',
  'acknowledged',
  'investigating',
  'triaged',
  'in_progress',
  'resolved',
  'closed',
  'dismissed',
  'duplicate',
]);
export type FeedbackReportStatus = z.infer<typeof FeedbackReportStatusSchema>;

export const FeedbackPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type FeedbackPriority = z.infer<typeof FeedbackPrioritySchema>;

export const FeedbackDeliveryStatusSchema = z.enum([
  'unconfigured',
  'queued',
  'delivered',
  'failed',
]);
export type FeedbackDeliveryStatus = z.infer<typeof FeedbackDeliveryStatusSchema>;

export const FeedbackClientSubmissionStateSchema = z.enum([
  'draft',
  'queued_locally',
  'submitting',
  'submitted',
  'failed_retry',
]);
export type FeedbackClientSubmissionState = z.infer<typeof FeedbackClientSubmissionStateSchema>;

export const FeedbackDiagnosticsSchema = z
  .object({
    appVersion: z.string().max(50),
    buildNumber: z.string().max(50).optional(),
    platform: z.enum(['web', 'android', 'ios', 'desktop']),
    browserOrOs: z.string().max(200),
    routeTemplate: z.string().max(200),
    locale: z.string().max(35),
    timestamp: z.string().max(50),
    correlationId: z.string().max(100),
    errorCode: z.string().max(50).optional(),
  })
  .strict();
export type FeedbackDiagnostics = z.infer<typeof FeedbackDiagnosticsSchema>;

export const FeedbackAttachmentRefSchema = z
  .object({
    id: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(100),
    sizeBytes: z.number().int().nonnegative().max(10 * 1024 * 1024),
    checksumSha256: z.string().length(64).optional(),
  })
  .strict();
export type FeedbackAttachmentRef = z.infer<typeof FeedbackAttachmentRefSchema>;

export const CreateFeedbackReportRequestSchema = z
  .object({
    clientReportId: z.string().uuid(),
    reportType: FeedbackReportTypeSchema,
    category: z.string().min(1).max(50).default('general'),
    summary: z.string().min(3).max(140),
    description: z.string().min(10).max(5000),
    stepsToReproduce: z.string().max(2000).optional(),
    expectedBehavior: z.string().max(1000).optional(),
    actualBehavior: z.string().max(1000).optional(),
    frequency: FeedbackFrequencySchema.optional(),
    severity: FeedbackSeveritySchema.optional(),
    replyEmail: z.string().email().max(255).optional(),
    includeDiagnostics: z.boolean().default(false),
    diagnostics: FeedbackDiagnosticsSchema.optional(),
    attachments: z.array(FeedbackAttachmentRefSchema).max(5).default([]),
  })
  .strict();
export type CreateFeedbackReportRequest = z.infer<typeof CreateFeedbackReportRequestSchema>;

export const FeedbackReportReceiptSchema = z
  .object({
    id: z.string().uuid(),
    clientReportId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    reporterId: z.string().uuid(),
    reportType: FeedbackReportTypeSchema,
    category: z.string(),
    summary: z.string(),
    description: z.string(),
    stepsToReproduce: z.string().nullable().optional(),
    expectedBehavior: z.string().nullable().optional(),
    actualBehavior: z.string().nullable().optional(),
    frequency: FeedbackFrequencySchema.nullable().optional(),
    severity: FeedbackSeveritySchema.nullable().optional(),
    replyEmail: z.string().nullable().optional(),
    includeDiagnostics: z.boolean(),
    diagnostics: FeedbackDiagnosticsSchema.nullable().optional(),
    attachments: z.array(FeedbackAttachmentRefSchema),
    status: FeedbackReportStatusSchema,
    priority: FeedbackPrioritySchema.optional(),
    duplicateOfId: z.string().uuid().nullable().optional(),
    acknowledgedAt: z.string().datetime().nullable().optional(),
    resolvedAt: z.string().datetime().nullable().optional(),
    responseText: z.string().nullable().optional(),
    respondedAt: z.string().datetime().nullable().optional(),
    deliveryStatus: FeedbackDeliveryStatusSchema,
    deliveryNotice: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    isReplay: z.boolean().optional(),
  })
  .strict();
export type FeedbackReportReceipt = z.infer<typeof FeedbackReportReceiptSchema>;

export const FeedbackReportResponseSchema = z.object({
  data: FeedbackReportReceiptSchema,
  meta: ResponseMetaSchema,
});
export type FeedbackReportResponse = z.infer<typeof FeedbackReportResponseSchema>;

export const FeedbackReportListResponseSchema = z.object({
  data: z.array(FeedbackReportReceiptSchema),
  meta: ResponseMetaSchema,
});
export type FeedbackReportListResponse = z.infer<typeof FeedbackReportListResponseSchema>;

// Phase 83 Operator Triage Schemas

export const FeedbackTriageQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    status: FeedbackReportStatusSchema.optional(),
    category: z.string().optional(),
    reportType: FeedbackReportTypeSchema.optional(),
    priority: FeedbackPrioritySchema.optional(),
    search: z.string().max(100).optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
  })
  .strict();
export type FeedbackTriageQuery = z.input<typeof FeedbackTriageQuerySchema>;

export const FeedbackReportUpdateSchema = z
  .object({
    status: FeedbackReportStatusSchema.optional(),
    priority: FeedbackPrioritySchema.optional(),
    assignedTo: z.string().uuid().nullable().optional(),
    duplicateOfId: z.string().uuid().nullable().optional(),
    responseText: z.string().max(5000).optional(),
  })
  .strict();
export type FeedbackReportUpdate = z.infer<typeof FeedbackReportUpdateSchema>;

export const FeedbackInternalNoteCreateSchema = z
  .object({
    note: z.string().min(1).max(5000),
  })
  .strict();
export type FeedbackInternalNoteCreate = z.infer<typeof FeedbackInternalNoteCreateSchema>;

export const FeedbackInternalNoteSchema = z
  .object({
    id: z.string().uuid(),
    reportId: z.string().uuid(),
    authorId: z.string().uuid(),
    note: z.string(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type FeedbackInternalNote = z.infer<typeof FeedbackInternalNoteSchema>;

export const FeedbackInternalNoteListResponseSchema = z.object({
  data: z.array(FeedbackInternalNoteSchema),
  meta: ResponseMetaSchema,
});
export type FeedbackInternalNoteListResponse = z.infer<
  typeof FeedbackInternalNoteListResponseSchema
>;

export const FeedbackTriageAuditSchema = z
  .object({
    id: z.string().uuid(),
    reportId: z.string().uuid(),
    actorId: z.string().uuid(),
    action: z.string(),
    details: z.record(z.unknown()),
    createdAt: z.string().datetime(),
  })
  .strict();
export type FeedbackTriageAudit = z.infer<typeof FeedbackTriageAuditSchema>;

export const FeedbackTriageAuditListResponseSchema = z.object({
  data: z.array(FeedbackTriageAuditSchema),
  meta: ResponseMetaSchema,
});
export type FeedbackTriageAuditListResponse = z.infer<
  typeof FeedbackTriageAuditListResponseSchema
>;

export const FeedbackTriageItemSchema = FeedbackReportReceiptSchema.extend({
  assignedTo: z.string().uuid().nullable().optional(),
  duplicateOfId: z.string().uuid().nullable().optional(),
  internalNotesCount: z.number().int().nonnegative().optional(),
});
export type FeedbackTriageItem = z.infer<typeof FeedbackTriageItemSchema>;

export const FeedbackTriagePaginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type FeedbackTriagePagination = z.infer<typeof FeedbackTriagePaginationSchema>;

export const FeedbackTriageListResponseSchema = z.object({
  data: z.array(FeedbackTriageItemSchema),
  pagination: FeedbackTriagePaginationSchema,
  meta: ResponseMetaSchema,
});
export type FeedbackTriageListResponse = z.infer<typeof FeedbackTriageListResponseSchema>;

export const FeedbackTriageResponseSchema = z.object({
  data: FeedbackTriageItemSchema,
  meta: ResponseMetaSchema,
});
export type FeedbackTriageResponse = z.infer<typeof FeedbackTriageResponseSchema>;

export const FeedbackRetentionPurgeRequestSchema = z
  .object({
    retentionDays: z.coerce.number().int().min(1).max(365).default(90),
  })
  .strict();
export type FeedbackRetentionPurgeRequest = z.input<
  typeof FeedbackRetentionPurgeRequestSchema
>;

export const FeedbackRetentionPurgeResponseSchema = z.object({
  data: z.object({
    purgedCount: z.number().int().nonnegative(),
    cutoffDate: z.string().datetime(),
  }),
  meta: ResponseMetaSchema,
});
export type FeedbackRetentionPurgeResponse = z.infer<
  typeof FeedbackRetentionPurgeResponseSchema
>;
