import type { PoolClient } from 'pg';
import {
  CONFIGURED_DELIVERY_QUEUED_NOTICE,
  isExternalDeliveryConfigured,
  sanitizeDiagnostics,
  UNCONFIGURED_DELIVERY_NOTICE,
  type FeedbackAttachmentRef,
  type FeedbackDiagnostics,
  type FeedbackFrequency,
  type FeedbackReportReceipt,
  type FeedbackReportType,
  type FeedbackSeverity,
} from '@daynori/domain';
import { NotFoundError } from '../../plugins/errorHandler.js';

export class FeedbackServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'FeedbackServiceError';
  }
}

export interface CreateReportParams {
  reporterId: string;
  workspaceId: string;
  clientReportId: string;
  reportType: FeedbackReportType;
  category?: string;
  summary: string;
  description: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  frequency?: FeedbackFrequency;
  severity?: FeedbackSeverity;
  replyEmail?: string;
  includeDiagnostics?: boolean;
  diagnostics?: FeedbackDiagnostics;
  attachments?: FeedbackAttachmentRef[];
}

export interface CreateReportResult {
  receipt: FeedbackReportReceipt;
  isReplay: boolean;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/pdf',
  'application/json',
]);

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS_PER_REPORT = 5;
const RATE_LIMIT_COUNT = 20;

function rowToReceipt(row: Record<string, unknown>, isReplay = false): FeedbackReportReceipt {
  const deliveryStatus = String(row['delivery_status'] || 'unconfigured') as
    | 'unconfigured'
    | 'queued'
    | 'delivered'
    | 'failed';

  let deliveryNotice = UNCONFIGURED_DELIVERY_NOTICE;
  if (deliveryStatus === 'queued') {
    deliveryNotice = CONFIGURED_DELIVERY_QUEUED_NOTICE;
  } else if (deliveryStatus === 'delivered') {
    deliveryNotice = 'Receipt acknowledged by server. Delivered to support queue.';
  } else if (deliveryStatus === 'failed') {
    deliveryNotice = 'Receipt acknowledged by server. Delivery to support queue failed.';
  }

  const rawDiag = row['diagnostics'];
  const hasDiag = Boolean(row['include_diagnostics'] && rawDiag && Object.keys(rawDiag).length > 0);
  const diag = hasDiag ? (rawDiag as FeedbackDiagnostics) : null;

  return {
    id: String(row['id']),
    clientReportId: String(row['client_report_id']),
    workspaceId: String(row['workspace_id']),
    reporterId: String(row['reporter_id']),
    reportType: String(row['report_type']) as FeedbackReportType,
    category: String(row['category'] || 'general'),
    summary: String(row['summary']),
    description: String(row['description']),
    stepsToReproduce: row['steps_to_reproduce'] ? String(row['steps_to_reproduce']) : null,
    expectedBehavior: row['expected_behavior'] ? String(row['expected_behavior']) : null,
    actualBehavior: row['actual_behavior'] ? String(row['actual_behavior']) : null,
    frequency: (row['frequency'] ? String(row['frequency']) : null) as FeedbackFrequency | null,
    severity: (row['severity'] ? String(row['severity']) : null) as FeedbackSeverity | null,
    replyEmail: row['reply_email'] ? String(row['reply_email']) : null,
    includeDiagnostics: Boolean(row['include_diagnostics']),
    diagnostics: diag,
    attachments: (row['attachments'] as FeedbackAttachmentRef[]) || [],
    status: String(row['status'] || 'received') as FeedbackReportReceipt['status'],
    deliveryStatus,
    deliveryNotice,
    createdAt: new Date(String(row['created_at'])).toISOString(),
    updatedAt: new Date(String(row['updated_at'])).toISOString(),
    isReplay,
  };
}

export async function createFeedbackReport(
  client: PoolClient,
  params: CreateReportParams
): Promise<CreateReportResult> {
  const { reporterId, workspaceId, clientReportId, reportType } = params;

  // 1. Authorize workspace membership
  const memberRes = await client.query<{ exists: number }>(
    `SELECT 1 FROM app.workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, reporterId]
  );
  if (memberRes.rowCount === 0) {
    throw new FeedbackServiceError('Workspace access denied', 403, 'FORBIDDEN');
  }

  // 2. Check for idempotent replay
  const replayRes = await client.query<Record<string, unknown>>(
    `SELECT * FROM app.feedback_reports WHERE reporter_id = $1 AND client_report_id = $2`,
    [reporterId, clientReportId]
  );
  if (replayRes.rowCount && replayRes.rowCount > 0 && replayRes.rows[0]) {
    return {
      receipt: rowToReceipt(replayRes.rows[0], true),
      isReplay: true,
    };
  }

  // 3. Abuse prevention & rate limiting (max 20 reports per 10 minutes)
  const rateRes = await client.query<{ count: string }>(
    `SELECT count(*) AS count FROM app.feedback_reports WHERE reporter_id = $1 AND created_at > now() - interval '10 minutes'`,
    [reporterId]
  );
  const recentCount = parseInt(rateRes.rows[0]?.count || '0', 10);
  if (recentCount >= RATE_LIMIT_COUNT) {
    throw new FeedbackServiceError(
      'Too many feedback reports submitted. Please wait before submitting another.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }

  // 4. Validate attachments
  const attachments = params.attachments || [];
  if (attachments.length > MAX_ATTACHMENTS_PER_REPORT) {
    throw new FeedbackServiceError(
      `Cannot attach more than ${MAX_ATTACHMENTS_PER_REPORT} files`,
      400,
      'TOO_MANY_ATTACHMENTS'
    );
  }
  for (const att of attachments) {
    if (att.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new FeedbackServiceError(
        `Attachment "${att.fileName}" exceeds maximum size of 10MB`,
        400,
        'ATTACHMENT_TOO_LARGE'
      );
    }
    if (!ALLOWED_MIME_TYPES.has(att.mimeType)) {
      throw new FeedbackServiceError(
        `Attachment "${att.fileName}" has unsupported MIME type "${att.mimeType}"`,
        400,
        'UNSUPPORTED_ATTACHMENT_TYPE'
      );
    }
  }

  // 5. Diagnostics
  const includeDiagnostics = Boolean(params.includeDiagnostics);
  const diagnostics = includeDiagnostics
    ? sanitizeDiagnostics(params.diagnostics)
    : {};

  // 6. Delivery configuration & background job
  const isDeliveryConfigured = isExternalDeliveryConfigured({
    webhookUrl: process.env['FEEDBACK_DELIVERY_WEBHOOK_URL'],
    emailTo: process.env['FEEDBACK_DELIVERY_EMAIL_TO'],
  });

  let deliveryJobId: string | null = null;
  let deliveryStatus: 'unconfigured' | 'queued' = 'unconfigured';

  if (isDeliveryConfigured) {
    const jobRes = await client.query<{ id: string }>(
      `
      INSERT INTO app.background_jobs (task_type, payload, status)
      VALUES ($1, $2, 'pending')
      RETURNING id
      `,
      [
        'feedback_delivery',
        {
          reporterId,
          workspaceId,
          clientReportId,
          reportType,
          summary: params.summary.slice(0, 140),
          category: params.category || 'general',
          replyEmail: params.replyEmail || null,
        },
      ]
    );
    if (jobRes.rowCount && jobRes.rowCount > 0 && jobRes.rows[0]) {
      deliveryJobId = jobRes.rows[0].id;
      deliveryStatus = 'queued';
    }
  }

  // 7. Insert feedback report
  const insertRes = await client.query<Record<string, unknown>>(
    `
    INSERT INTO app.feedback_reports (
      client_report_id,
      workspace_id,
      reporter_id,
      report_type,
      category,
      summary,
      description,
      steps_to_reproduce,
      expected_behavior,
      actual_behavior,
      frequency,
      severity,
      reply_email,
      include_diagnostics,
      diagnostics,
      attachments,
      status,
      delivery_status,
      delivery_job_id
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, 'received', $17, $18
    )
    RETURNING *
    `,
    [
      clientReportId,
      workspaceId,
      reporterId,
      reportType,
      params.category || 'general',
      params.summary,
      params.description,
      params.stepsToReproduce || null,
      params.expectedBehavior || null,
      params.actualBehavior || null,
      params.frequency || null,
      params.severity || null,
      params.replyEmail || null,
      includeDiagnostics,
      JSON.stringify(diagnostics),
      JSON.stringify(attachments),
      deliveryStatus,
      deliveryJobId,
    ]
  );

  const row = insertRes.rows[0]!;
  return {
    receipt: rowToReceipt(row, false),
    isReplay: false,
  };
}

export async function listFeedbackReports(
  client: PoolClient,
  params: { reporterId: string; workspaceId: string }
): Promise<FeedbackReportReceipt[]> {
  const { reporterId, workspaceId } = params;
  const res = await client.query<Record<string, unknown>>(
    `
    SELECT * FROM app.feedback_reports
    WHERE reporter_id = $1 AND workspace_id = $2
    ORDER BY created_at DESC
    LIMIT 50
    `,
    [reporterId, workspaceId]
  );
  return res.rows.map((row) => rowToReceipt(row));
}

export async function getFeedbackReport(
  client: PoolClient,
  params: { reportId: string; reporterId: string; workspaceId: string }
): Promise<FeedbackReportReceipt> {
  const { reportId, reporterId, workspaceId } = params;
  const res = await client.query<Record<string, unknown>>(
    `
    SELECT * FROM app.feedback_reports
    WHERE id = $1 AND reporter_id = $2 AND workspace_id = $3
    `,
    [reportId, reporterId, workspaceId]
  );
  if (res.rowCount === 0 || !res.rows[0]) {
    throw new NotFoundError('Report not found');
  }
  return rowToReceipt(res.rows[0]);
}
