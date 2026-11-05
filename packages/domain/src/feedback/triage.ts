import type {
  FeedbackPriority,
  FeedbackReportStatus,
  FeedbackDiagnostics,
} from './types.js';

export const FEEDBACK_STATUSES: readonly FeedbackReportStatus[] = [
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
] as const;

export const FEEDBACK_PRIORITIES: readonly FeedbackPriority[] = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

/**
 * Validates report status transitions in developer triage.
 *
 * Rules:
 * - Same status is always a valid no-op.
 * - 'new' and 'received' can move to acknowledged, investigating, resolved, duplicate, or dismissed.
 * - 'acknowledged' can move to investigating, resolved, duplicate, or dismissed.
 * - 'investigating' can move to acknowledged, resolved, closed, duplicate, or dismissed.
 * - 'triaged' / 'in_progress' (compat) can move to investigating, resolved, closed, duplicate, or dismissed.
 * - 'resolved' can move to closed, or be reopened to investigating.
 * - 'dismissed' or 'duplicate' can be reopened to investigating or closed.
 * - 'closed' can only be reopened to investigating.
 */
export function isValidFeedbackStatusTransition(
  currentStatus: FeedbackReportStatus,
  targetStatus: FeedbackReportStatus
): boolean {
  if (currentStatus === targetStatus) {
    return true;
  }

  switch (currentStatus) {
    case 'new':
    case 'received':
      return [
        'acknowledged',
        'investigating',
        'triaged',
        'in_progress',
        'resolved',
        'duplicate',
        'dismissed',
      ].includes(targetStatus);

    case 'acknowledged':
      return ['investigating', 'in_progress', 'resolved', 'duplicate', 'dismissed'].includes(
        targetStatus
      );

    case 'triaged':
    case 'in_progress':
    case 'investigating':
      return ['acknowledged', 'resolved', 'closed', 'duplicate', 'dismissed'].includes(
        targetStatus
      );

    case 'resolved':
      return ['closed', 'investigating', 'in_progress'].includes(targetStatus);

    case 'dismissed':
    case 'duplicate':
      return ['investigating', 'closed'].includes(targetStatus);

    case 'closed':
      return ['investigating'].includes(targetStatus);

    default:
      return false;
  }
}

/**
 * Checks whether a report has exceeded the retention cutoff.
 * Only terminal reports ('resolved', 'closed', 'dismissed', 'duplicate')
 * whose last activity (resolvedAt or updatedAt) exceeds retentionDays are eligible for purge.
 */
export function isFeedbackReportExpired(
  report: {
    status: FeedbackReportStatus;
    resolvedAt?: string | null;
    updatedAt: string;
  },
  retentionDays: number,
  now: Date = new Date()
): boolean {
  const terminalStatuses: Set<FeedbackReportStatus> = new Set([
    'resolved',
    'closed',
    'dismissed',
    'duplicate',
  ]);

  if (!terminalStatuses.has(report.status)) {
    return false;
  }

  if (retentionDays <= 0) {
    return false;
  }

  const effectiveTimestamp = report.resolvedAt
    ? new Date(report.resolvedAt).getTime()
    : new Date(report.updatedAt).getTime();

  if (isNaN(effectiveTimestamp)) {
    return false;
  }

  const cutoffTime = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return effectiveTimestamp < cutoffTime;
}

/**
 * Sanitizes audit details before persisting to the triage audit table.
 * Strips secrets, raw prompts, full bodies, notes, auth tokens, passwords, and signed URLs.
 */
export function sanitizeTriageAuditDetails(
  details: Record<string, unknown>
): Record<string, unknown> {
  const forbiddenKeyPatterns = [
    /pass/i,
    /token/i,
    /secret/i,
    /auth/i,
    /cookie/i,
    /key/i,
    /jwt/i,
    /prompt/i,
    /body/i,
    /note/i,
    /url/i,
    /description/i,
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(details)) {
    const isForbidden = forbiddenKeyPatterns.some((pattern) => pattern.test(k));
    if (isForbidden) {
      if (typeof v === 'string') {
        sanitized[`${k}Length`] = v.length;
      }
      continue;
    }

    if (v === null || v === undefined) {
      sanitized[k] = v;
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      sanitized[k] = sanitizeTriageAuditDetails(v as Record<string, unknown>);
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      sanitized[k] = v;
    } else if (Array.isArray(v)) {
      sanitized[k] = v.length;
    }
  }

  return sanitized;
}

/**
 * Sanitizes technical diagnostics for display in operator triage.
 * Guarantees that only safe diagnostic fields are surfaced.
 */
export function filterDiagnosticsForTriageDisplay(
  diagnostics?: FeedbackDiagnostics | null
): Record<string, string> | null {
  if (!diagnostics) return null;

  const result: Record<string, string> = {
    platform: diagnostics.platform,
    appVersion: diagnostics.appVersion,
    browserOrOs: diagnostics.browserOrOs,
    routeTemplate: diagnostics.routeTemplate,
    locale: diagnostics.locale,
    timestamp: diagnostics.timestamp,
    correlationId: diagnostics.correlationId,
  };

  if (diagnostics.buildNumber) {
    result['buildNumber'] = diagnostics.buildNumber;
  }
  if (diagnostics.errorCode) {
    result['errorCode'] = diagnostics.errorCode;
  }

  return result;
}
