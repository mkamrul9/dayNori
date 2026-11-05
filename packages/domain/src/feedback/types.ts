export type FeedbackReportType = 'bug' | 'suggestion' | 'contact';

export type FeedbackFrequency = 'always' | 'often' | 'sometimes' | 'once';

export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';

export type FeedbackReportStatus =
  | 'new'
  | 'received'
  | 'acknowledged'
  | 'investigating'
  | 'triaged'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'dismissed'
  | 'duplicate';

export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';

export type FeedbackDeliveryStatus = 'unconfigured' | 'queued' | 'delivered' | 'failed';

export type FeedbackClientSubmissionState =
  | 'draft'
  | 'queued_locally'
  | 'submitting'
  | 'submitted'
  | 'failed_retry';

export interface FeedbackDiagnostics {
  appVersion: string;
  buildNumber?: string;
  platform: 'web' | 'android' | 'ios' | 'desktop';
  browserOrOs: string;
  routeTemplate: string;
  locale: string;
  timestamp: string;
  correlationId: string;
  errorCode?: string;
}

export interface FeedbackAttachmentRef {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string;
}

export interface FeedbackReportReceipt {
  id: string;
  clientReportId: string;
  workspaceId: string;
  reporterId: string;
  reportType: FeedbackReportType;
  category: string;
  summary: string;
  description: string;
  stepsToReproduce?: string | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  frequency?: FeedbackFrequency | null;
  severity?: FeedbackSeverity | null;
  replyEmail?: string | null;
  includeDiagnostics: boolean;
  diagnostics?: FeedbackDiagnostics | null;
  attachments: FeedbackAttachmentRef[];
  status: FeedbackReportStatus;
  priority?: FeedbackPriority;
  duplicateOfId?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  responseText?: string | null;
  respondedAt?: string | null;
  deliveryStatus: FeedbackDeliveryStatus;
  deliveryNotice: string;
  createdAt: string;
  updatedAt: string;
  isReplay?: boolean;
}

export interface FeedbackInternalNote {
  id: string;
  reportId: string;
  authorId: string;
  note: string;
  createdAt: string;
}

export interface FeedbackTriageAuditRecord {
  id: string;
  reportId: string;
  actorId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface FeedbackTriageItem extends FeedbackReportReceipt {
  assignedTo?: string | null;
  internalNotesCount?: number;
}

export interface FeedbackTriageQuery {
  page?: number;
  pageSize?: number;
  status?: FeedbackReportStatus;
  category?: string;
  reportType?: FeedbackReportType;
  priority?: FeedbackPriority;
  search?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export interface FeedbackReportUpdate {
  status?: FeedbackReportStatus;
  priority?: FeedbackPriority;
  assignedTo?: string | null;
  duplicateOfId?: string | null;
  responseText?: string;
}
