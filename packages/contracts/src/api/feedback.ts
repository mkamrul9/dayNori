import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const FeedbackReportTypeSchema = z.enum(['bug', 'suggestion', 'contact']);
export type FeedbackReportType = z.infer<typeof FeedbackReportTypeSchema>;

export const FeedbackFrequencySchema = z.enum(['always', 'often', 'sometimes', 'once']);
export type FeedbackFrequency = z.infer<typeof FeedbackFrequencySchema>;

export const FeedbackSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type FeedbackSeverity = z.infer<typeof FeedbackSeveritySchema>;

export const FeedbackReportStatusSchema = z.enum([
  'received',
  'triaged',
  'in_progress',
  'resolved',
  'closed',
  'dismissed',
  'duplicate',
]);
export type FeedbackReportStatus = z.infer<typeof FeedbackReportStatusSchema>;

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
