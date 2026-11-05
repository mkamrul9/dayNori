import type {
  FeedbackAttachmentRef,
  FeedbackClientSubmissionState,
  FeedbackDiagnostics,
  FeedbackFrequency,
  FeedbackReportReceipt,
  FeedbackReportType,
  FeedbackSeverity,
} from './types.js';

export interface FeedbackDraft {
  clientReportId: string;
  reportType: FeedbackReportType;
  category: string;
  summary: string;
  description: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  frequency?: FeedbackFrequency;
  severity?: FeedbackSeverity;
  replyEmail?: string;
  includeDiagnostics: boolean;
  diagnostics?: FeedbackDiagnostics;
  attachments: FeedbackAttachmentRef[];
  state: FeedbackClientSubmissionState;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  receipt?: FeedbackReportReceipt;
}

/**
 * Creates a unique random UUID v4 string across platforms without external dependencies.
 */
export function generateFeedbackReportId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates an empty or pre-filled feedback draft with a stable clientReportId.
 */
export function createFeedbackDraft(
  reportType: FeedbackReportType,
  initial: Partial<FeedbackDraft> = {}
): FeedbackDraft {
  const now = new Date().toISOString();
  return {
    clientReportId: initial.clientReportId || generateFeedbackReportId(),
    reportType,
    category: initial.category || (reportType === 'bug' ? 'ui' : 'general'),
    summary: initial.summary || '',
    description: initial.description || '',
    stepsToReproduce: initial.stepsToReproduce,
    expectedBehavior: initial.expectedBehavior,
    actualBehavior: initial.actualBehavior,
    frequency: initial.frequency,
    severity: initial.severity,
    replyEmail: initial.replyEmail,
    includeDiagnostics: initial.includeDiagnostics ?? false,
    diagnostics: initial.diagnostics,
    attachments: initial.attachments || [],
    state: initial.state || 'draft',
    createdAt: initial.createdAt || now,
    updatedAt: now,
    lastError: initial.lastError,
    receipt: initial.receipt,
  };
}

/**
 * Generates an account-and-workspace scoped storage key for feedback drafts.
 * Prevents cross-account or cross-workspace draft leaking.
 */
export function getFeedbackStorageKey(
  userId: string,
  workspaceId: string,
  reportType: FeedbackReportType
): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `daynori:feedback:draft:${safeUser}:${safeWs}:${reportType}`;
}

/**
 * Quarantines drafts when switching accounts so that User B never sees
 * or accidentally submits User A's unsubmitted feedback draft.
 */
export function quarantineFeedbackDrafts(options: {
  currentUserId: string;
  nextUserId: string;
  allDraftsByStorageKey: Record<string, FeedbackDraft>;
}): {
  allowedDrafts: Record<string, FeedbackDraft>;
  quarantinedDrafts: Record<string, FeedbackDraft>;
} {
  const { currentUserId, nextUserId, allDraftsByStorageKey } = options;
  const allowedDrafts: Record<string, FeedbackDraft> = {};
  const quarantinedDrafts: Record<string, FeedbackDraft> = {};

  const safeCurrent = currentUserId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeNext = nextUserId.replace(/[^a-zA-Z0-9_-]/g, '');

  for (const [key, draft] of Object.entries(allDraftsByStorageKey)) {
    if (key.includes(`:${safeNext}:`)) {
      allowedDrafts[key] = draft;
    } else if (key.includes(`:${safeCurrent}:`)) {
      quarantinedDrafts[key] = draft;
    }
  }

  return { allowedDrafts, quarantinedDrafts };
}
