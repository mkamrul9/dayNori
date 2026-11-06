import type { PoolClient } from 'pg';
import {
  CONFIGURED_DELIVERY_QUEUED_NOTICE,
  isExternalDeliveryConfigured,
  isValidFeedbackStatusTransition,
  sanitizeDiagnostics,
  sanitizeTriageAuditDetails,
  UNCONFIGURED_DELIVERY_NOTICE,
  type FeedbackAttachmentRef,
  type FeedbackDiagnostics,
  type FeedbackFrequency,
  type FeedbackInternalNote,
  type FeedbackPriority,
  type FeedbackReportReceipt,
  type FeedbackReportType,
  type FeedbackReportUpdate,
  type FeedbackSeverity,
  type FeedbackTriageAuditRecord,
  type FeedbackTriageItem,
  type FeedbackTriageQuery,
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
    priority: (row['priority'] ? String(row['priority']) : 'medium') as FeedbackPriority,
    duplicateOfId: row['duplicate_of_id'] ? String(row['duplicate_of_id']) : null,
    acknowledgedAt: row['acknowledged_at']
      ? new Date(String(row['acknowledged_at'])).toISOString()
      : null,
    resolvedAt: row['resolved_at'] ? new Date(String(row['resolved_at'])).toISOString() : null,
    responseText: row['response_text'] ? String(row['response_text']) : null,
    respondedAt: row['responded_at']
      ? new Date(String(row['responded_at'])).toISOString()
      : null,
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

function rowToTriageItem(
  row: Record<string, unknown>,
  internalNotesCount = 0
): FeedbackTriageItem {
  const receipt = rowToReceipt(row);
  return {
    ...receipt,
    assignedTo: row['assigned_to'] ? String(row['assigned_to']) : null,
    internalNotesCount,
  };
}

export async function listTriageReports(
  client: PoolClient,
  query: FeedbackTriageQuery
): Promise<{
  data: FeedbackTriageItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(50, Math.max(1, query.pageSize || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (query.status) {
    conditions.push(`status = $${paramIdx++}`);
    values.push(query.status);
  }
  if (query.category) {
    conditions.push(`category = $${paramIdx++}`);
    values.push(query.category);
  }
  if (query.reportType) {
    conditions.push(`report_type = $${paramIdx++}`);
    values.push(query.reportType);
  }
  if (query.priority) {
    conditions.push(`priority = $${paramIdx++}`);
    values.push(query.priority);
  }
  if (query.search && query.search.trim()) {
    conditions.push(`(summary ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`);
    values.push(`%${query.search.trim()}%`);
    paramIdx++;
  }
  if (query.createdAfter) {
    conditions.push(`created_at >= $${paramIdx++}`);
    values.push(query.createdAfter);
  }
  if (query.createdBefore) {
    conditions.push(`created_at <= $${paramIdx++}`);
    values.push(query.createdBefore);
  }

  const whereClause = conditions.join(' AND ');

  const countRes = await client.query<{ total: string }>(
    `SELECT count(*) AS total FROM app.feedback_reports WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countRes.rows[0]?.total || '0', 10);
  const totalPages = Math.ceil(total / pageSize) || 1;

  const dataValues = [...values, pageSize, offset];
  const dataRes = await client.query<Record<string, unknown>>(
    `
    SELECT * FROM app.feedback_reports
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `,
    dataValues
  );

  const reportIds = dataRes.rows.map((r) => String(r['id']));
  const notesCountMap = new Map<string, number>();

  if (reportIds.length > 0) {
    const notesRes = await client.query<{ report_id: string; count: string }>(
      `
      SELECT report_id, count(*) AS count
      FROM app.feedback_internal_notes
      WHERE report_id = ANY($1)
      GROUP BY report_id
      `,
      [reportIds]
    );
    for (const n of notesRes.rows) {
      notesCountMap.set(n.report_id, parseInt(n.count, 10));
    }
  }

  const data = dataRes.rows.map((row) => {
    const id = String(row['id']);
    return rowToTriageItem(row, notesCountMap.get(id) || 0);
  });

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

export async function getTriageReport(
  client: PoolClient,
  reportId: string
): Promise<FeedbackTriageItem> {
  const res = await client.query<Record<string, unknown>>(
    `SELECT * FROM app.feedback_reports WHERE id = $1`,
    [reportId]
  );
  if (res.rowCount === 0 || !res.rows[0]) {
    throw new NotFoundError('Report not found');
  }

  const notesRes = await client.query<{ count: string }>(
    `SELECT count(*) AS count FROM app.feedback_internal_notes WHERE report_id = $1`,
    [reportId]
  );
  const internalNotesCount = parseInt(notesRes.rows[0]?.count || '0', 10);

  return rowToTriageItem(res.rows[0], internalNotesCount);
}

export async function updateTriageReport(
  client: PoolClient,
  reportId: string,
  actorId: string,
  update: FeedbackReportUpdate
): Promise<FeedbackTriageItem> {
  const existingRes = await client.query<Record<string, unknown>>(
    `SELECT * FROM app.feedback_reports WHERE id = $1 FOR UPDATE`,
    [reportId]
  );
  if (existingRes.rowCount === 0 || !existingRes.rows[0]) {
    throw new NotFoundError('Report not found');
  }
  const current = existingRes.rows[0];
  const currentStatus = String(current['status']) as FeedbackReportReceipt['status'];
  const currentPriority = String(current['priority'] || 'medium') as FeedbackPriority;

  const auditEvents: Array<{ action: string; details: Record<string, unknown> }> = [];

  // 1. Status transition check
  let nextStatus = currentStatus;
  let acknowledgedAt = current['acknowledged_at']
    ? new Date(String(current['acknowledged_at'])).toISOString()
    : null;
  let resolvedAt = current['resolved_at']
    ? new Date(String(current['resolved_at'])).toISOString()
    : null;

  if (update.status && update.status !== currentStatus) {
    if (!isValidFeedbackStatusTransition(currentStatus, update.status)) {
      throw new FeedbackServiceError(
        `Invalid status transition from "${currentStatus}" to "${update.status}"`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }
    nextStatus = update.status;
    auditEvents.push({
      action: 'status_change',
      details: { oldStatus: currentStatus, newStatus: nextStatus },
    });

    if (
      (nextStatus === 'acknowledged' ||
        nextStatus === 'investigating' ||
        nextStatus === 'resolved') &&
      !acknowledgedAt
    ) {
      acknowledgedAt = new Date().toISOString();
    }
    if (nextStatus === 'resolved' || nextStatus === 'closed') {
      resolvedAt = resolvedAt || new Date().toISOString();
    } else if (nextStatus === 'investigating') {
      resolvedAt = null; // Reopened
    }
  }

  // 2. Priority check
  let nextPriority = currentPriority;
  if (update.priority && update.priority !== currentPriority) {
    nextPriority = update.priority;
    auditEvents.push({
      action: 'priority_change',
      details: { oldPriority: currentPriority, newPriority: nextPriority },
    });
  }

  // 3. Duplicate check
  let nextDuplicateOfId = (current['duplicate_of_id'] as string | null) || null;
  if (update.duplicateOfId !== undefined) {
    if (update.duplicateOfId) {
      if (update.duplicateOfId === reportId) {
        throw new FeedbackServiceError(
          'A report cannot be marked as a duplicate of itself',
          400,
          'INVALID_DUPLICATE_ID'
        );
      }
      const dupCheck = await client.query(
        `SELECT 1 FROM app.feedback_reports WHERE id = $1`,
        [update.duplicateOfId]
      );
      if (dupCheck.rowCount === 0) {
        throw new FeedbackServiceError(
          'Target duplicate report does not exist',
          400,
          'DUPLICATE_NOT_FOUND'
        );
      }
    }
    nextDuplicateOfId = update.duplicateOfId;
    auditEvents.push({
      action: 'duplicate_linked',
      details: { duplicateOfId: nextDuplicateOfId },
    });
  }

  // 4. Assignment
  let nextAssignedTo = (current['assigned_to'] as string | null) || null;
  if (update.assignedTo !== undefined) {
    nextAssignedTo = update.assignedTo;
    auditEvents.push({
      action: 'assigned',
      details: { assignedTo: nextAssignedTo },
    });
  }

  // 5. Response text
  let responseText = (current['response_text'] as string | null) || null;
  let respondedAt = current['responded_at']
    ? new Date(String(current['responded_at'])).toISOString()
    : null;
  let respondedBy = (current['responded_by'] as string | null) || null;

  if (update.responseText !== undefined && update.responseText.trim()) {
    responseText = update.responseText.trim();
    respondedAt = new Date().toISOString();
    respondedBy = actorId;
    auditEvents.push({
      action: 'response_sent',
      details: { responseTextLength: responseText.length },
    });
  }

  // Update report
  const updateRes = await client.query<Record<string, unknown>>(
    `
    UPDATE app.feedback_reports
    SET status = $1,
        priority = $2,
        duplicate_of_id = $3,
        assigned_to = $4,
        acknowledged_at = $5,
        resolved_at = $6,
        response_text = $7,
        responded_at = $8,
        responded_by = $9,
        updated_at = now()
    WHERE id = $10
    RETURNING *
    `,
    [
      nextStatus,
      nextPriority,
      nextDuplicateOfId,
      nextAssignedTo,
      acknowledgedAt,
      resolvedAt,
      responseText,
      respondedAt,
      respondedBy,
      reportId,
    ]
  );

  // Insert audit trail
  for (const event of auditEvents) {
    const sanitized = sanitizeTriageAuditDetails(event.details);
    await client.query(
      `
      INSERT INTO app.feedback_triage_audit (report_id, actor_id, action, details)
      VALUES ($1, $2, $3, $4::jsonb)
      `,
      [reportId, actorId, event.action, JSON.stringify(sanitized)]
    );
  }

  const updatedRow = updateRes.rows[0]!;
  const notesRes = await client.query<{ count: string }>(
    `SELECT count(*) AS count FROM app.feedback_internal_notes WHERE report_id = $1`,
    [reportId]
  );
  const internalNotesCount = parseInt(notesRes.rows[0]?.count || '0', 10);

  return rowToTriageItem(updatedRow, internalNotesCount);
}

export async function addInternalNote(
  client: PoolClient,
  reportId: string,
  authorId: string,
  noteText: string
): Promise<FeedbackInternalNote> {
  const trimmed = noteText.trim();
  if (!trimmed) {
    throw new FeedbackServiceError('Note cannot be empty', 400, 'EMPTY_NOTE');
  }

  // Verify report exists
  const reportRes = await client.query<{ id: string }>(
    `SELECT id FROM app.feedback_reports WHERE id = $1`,
    [reportId]
  );
  if (reportRes.rowCount === 0) {
    throw new NotFoundError('Report not found');
  }

  const insertRes = await client.query<Record<string, unknown>>(
    `
    INSERT INTO app.feedback_internal_notes (report_id, author_id, note)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [reportId, authorId, trimmed]
  );

  const row = insertRes.rows[0]!;

  // Audit note creation
  const auditDetails = sanitizeTriageAuditDetails({ noteLength: trimmed.length });
  await client.query(
    `
    INSERT INTO app.feedback_triage_audit (report_id, actor_id, action, details)
    VALUES ($1, $2, 'note_added', $3::jsonb)
    `,
    [reportId, authorId, JSON.stringify(auditDetails)]
  );

  return {
    id: String(row['id']),
    reportId: String(row['report_id']),
    authorId: String(row['author_id']),
    note: String(row['note']),
    createdAt: new Date(String(row['created_at'])).toISOString(),
  };
}

export async function listInternalNotes(
  client: PoolClient,
  reportId: string
): Promise<FeedbackInternalNote[]> {
  const res = await client.query<Record<string, unknown>>(
    `
    SELECT * FROM app.feedback_internal_notes
    WHERE report_id = $1
    ORDER BY created_at ASC
    `,
    [reportId]
  );

  return res.rows.map((row) => ({
    id: String(row['id']),
    reportId: String(row['report_id']),
    authorId: String(row['author_id']),
    note: String(row['note']),
    createdAt: new Date(String(row['created_at'])).toISOString(),
  }));
}

export async function listTriageAudit(
  client: PoolClient,
  reportId: string
): Promise<FeedbackTriageAuditRecord[]> {
  const res = await client.query<Record<string, unknown>>(
    `
    SELECT * FROM app.feedback_triage_audit
    WHERE report_id = $1
    ORDER BY created_at DESC
    `,
    [reportId]
  );

  return res.rows.map((row) => ({
    id: String(row['id']),
    reportId: String(row['report_id']),
    actorId: String(row['actor_id']),
    action: String(row['action']),
    details: (row['details'] as Record<string, unknown>) || {},
    createdAt: new Date(String(row['created_at'])).toISOString(),
  }));
}

export async function purgeExpiredReports(
  client: PoolClient,
  retentionDays = 90
): Promise<{ purgedCount: number; cutoffDate: string }> {
  if (retentionDays < 1 || retentionDays > 365) {
    throw new FeedbackServiceError(
      'Retention days must be between 1 and 365',
      400,
      'INVALID_RETENTION_DAYS'
    );
  }

  const res = await client.query<{ purge_expired_feedback_reports: number }>(
    `SELECT app.purge_expired_feedback_reports($1) AS purge_expired_feedback_reports`,
    [retentionDays]
  );

  const purgedCount = res.rows[0]?.purge_expired_feedback_reports ?? 0;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    purgedCount,
    cutoffDate,
  };
}
