import { describe, expect, it } from 'vitest';
import {
  filterDiagnosticsForTriageDisplay,
  isFeedbackReportExpired,
  isValidFeedbackStatusTransition,
  sanitizeTriageAuditDetails,
  type FeedbackDiagnostics,
} from '@daynori/domain';

describe('Phase 83 Domain: Feedback triage status transitions', () => {
  it('allows same-status transitions as no-ops', () => {
    expect(isValidFeedbackStatusTransition('new', 'new')).toBe(true);
    expect(isValidFeedbackStatusTransition('investigating', 'investigating')).toBe(true);
    expect(isValidFeedbackStatusTransition('resolved', 'resolved')).toBe(true);
    expect(isValidFeedbackStatusTransition('closed', 'closed')).toBe(true);
  });

  it('allows forward progression from new / received to acknowledged and investigating', () => {
    expect(isValidFeedbackStatusTransition('new', 'acknowledged')).toBe(true);
    expect(isValidFeedbackStatusTransition('new', 'investigating')).toBe(true);
    expect(isValidFeedbackStatusTransition('new', 'resolved')).toBe(true);
    expect(isValidFeedbackStatusTransition('new', 'duplicate')).toBe(true);
    expect(isValidFeedbackStatusTransition('new', 'dismissed')).toBe(true);

    expect(isValidFeedbackStatusTransition('received', 'acknowledged')).toBe(true);
    expect(isValidFeedbackStatusTransition('received', 'investigating')).toBe(true);
  });

  it('disallows skipping directly from new to closed without resolution or investigation', () => {
    expect(isValidFeedbackStatusTransition('new', 'closed')).toBe(false);
    expect(isValidFeedbackStatusTransition('received', 'closed')).toBe(false);
  });

  it('allows acknowledged to progress to investigating, resolved, duplicate, dismissed', () => {
    expect(isValidFeedbackStatusTransition('acknowledged', 'investigating')).toBe(true);
    expect(isValidFeedbackStatusTransition('acknowledged', 'resolved')).toBe(true);
    expect(isValidFeedbackStatusTransition('acknowledged', 'duplicate')).toBe(true);
    expect(isValidFeedbackStatusTransition('acknowledged', 'dismissed')).toBe(true);
    expect(isValidFeedbackStatusTransition('acknowledged', 'closed')).toBe(false);
  });

  it('allows investigating to resolve or close/duplicate/dismiss', () => {
    expect(isValidFeedbackStatusTransition('investigating', 'resolved')).toBe(true);
    expect(isValidFeedbackStatusTransition('investigating', 'closed')).toBe(true);
    expect(isValidFeedbackStatusTransition('investigating', 'duplicate')).toBe(true);
    expect(isValidFeedbackStatusTransition('investigating', 'dismissed')).toBe(true);
  });

  it('allows resolved to be closed or reopened to investigating', () => {
    expect(isValidFeedbackStatusTransition('resolved', 'closed')).toBe(true);
    expect(isValidFeedbackStatusTransition('resolved', 'investigating')).toBe(true);
  });

  it('allows closed to be reopened only to investigating', () => {
    expect(isValidFeedbackStatusTransition('closed', 'investigating')).toBe(true);
    expect(isValidFeedbackStatusTransition('closed', 'resolved')).toBe(false);
    expect(isValidFeedbackStatusTransition('closed', 'new')).toBe(false);
  });
});

describe('Phase 83 Domain: Retention and expiration policy', () => {
  const baseNow = new Date('2026-11-05T12:00:00Z');

  it('never marks active reports (new, acknowledged, investigating) as expired', () => {
    const oldDate = new Date(baseNow.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      isFeedbackReportExpired(
        { status: 'new', updatedAt: oldDate },
        90,
        baseNow
      )
    ).toBe(false);

    expect(
      isFeedbackReportExpired(
        { status: 'acknowledged', updatedAt: oldDate },
        90,
        baseNow
      )
    ).toBe(false);

    expect(
      isFeedbackReportExpired(
        { status: 'investigating', updatedAt: oldDate },
        90,
        baseNow
      )
    ).toBe(false);
  });

  it('marks terminal reports older than retentionDays as expired', () => {
    const olderThan90Days = new Date(baseNow.getTime() - 95 * 24 * 60 * 60 * 1000).toISOString();
    const newerThan90Days = new Date(baseNow.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    expect(
      isFeedbackReportExpired(
        { status: 'resolved', resolvedAt: olderThan90Days, updatedAt: olderThan90Days },
        90,
        baseNow
      )
    ).toBe(true);

    expect(
      isFeedbackReportExpired(
        { status: 'resolved', resolvedAt: newerThan90Days, updatedAt: newerThan90Days },
        90,
        baseNow
      )
    ).toBe(false);

    expect(
      isFeedbackReportExpired(
        { status: 'closed', updatedAt: olderThan90Days },
        90,
        baseNow
      )
    ).toBe(true);

    expect(
      isFeedbackReportExpired(
        { status: 'duplicate', updatedAt: olderThan90Days },
        90,
        baseNow
      )
    ).toBe(true);

    expect(
      isFeedbackReportExpired(
        { status: 'dismissed', updatedAt: olderThan90Days },
        90,
        baseNow
      )
    ).toBe(true);
  });

  it('returns false when retentionDays is invalid or non-positive', () => {
    const oldDate = new Date(baseNow.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      isFeedbackReportExpired(
        { status: 'resolved', updatedAt: oldDate },
        0,
        baseNow
      )
    ).toBe(false);
    expect(
      isFeedbackReportExpired(
        { status: 'resolved', updatedAt: oldDate },
        -10,
        baseNow
      )
    ).toBe(false);
  });
});

describe('Phase 83 Domain: Audit details sanitization', () => {
  it('strips secrets, tokens, passwords, bodies, notes and preserves metadata', () => {
    const rawDetails = {
      oldStatus: 'new',
      newStatus: 'acknowledged',
      oldPriority: 'medium',
      newPriority: 'high',
      userToken: 'ey.secret.jwt.token',
      dbPassword: 'super_secret_password',
      internalNote: 'Private developer discussion about customer bug',
      reportDescription: 'Full report body with sensitive customer information',
      signedUrl: 'https://storage.supabase.com/v1/s/private-asset?signature=12345',
      assignedTo: '8f7a93a5-1f90-4a81-8fd7-66a7b3e21010',
    };

    const sanitized = sanitizeTriageAuditDetails(rawDetails);

    expect(sanitized['oldStatus']).toBe('new');
    expect(sanitized['newStatus']).toBe('acknowledged');
    expect(sanitized['oldPriority']).toBe('medium');
    expect(sanitized['newPriority']).toBe('high');
    expect(sanitized['assignedTo']).toBe('8f7a93a5-1f90-4a81-8fd7-66a7b3e21010');

    // Forbidden values should be stripped and replaced with length metadata
    expect(sanitized['userToken']).toBeUndefined();
    expect(sanitized['userTokenLength']).toBe(rawDetails.userToken.length);

    expect(sanitized['dbPassword']).toBeUndefined();
    expect(sanitized['dbPasswordLength']).toBe(rawDetails.dbPassword.length);

    expect(sanitized['internalNote']).toBeUndefined();
    expect(sanitized['internalNoteLength']).toBe(rawDetails.internalNote.length);

    expect(sanitized['reportDescription']).toBeUndefined();
    expect(sanitized['reportDescriptionLength']).toBe(rawDetails.reportDescription.length);

    expect(sanitized['signedUrl']).toBeUndefined();
    expect(sanitized['signedUrlLength']).toBe(rawDetails.signedUrl.length);
  });
});

describe('Phase 83 Domain: Diagnostics filter for triage display', () => {
  it('extracts only safe technical attributes', () => {
    const diag: FeedbackDiagnostics = {
      platform: 'web',
      appVersion: '1.4.0',
      buildNumber: '1040',
      browserOrOs: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      routeTemplate: '/support',
      locale: 'en-US',
      timestamp: '2026-11-05T12:00:00Z',
      correlationId: 'corr-8491-abcd',
      errorCode: 'ERR_SYNC_FAIL',
    };

    const filtered = filterDiagnosticsForTriageDisplay(diag);
    expect(filtered).toEqual({
      platform: 'web',
      appVersion: '1.4.0',
      buildNumber: '1040',
      browserOrOs: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      routeTemplate: '/support',
      locale: 'en-US',
      timestamp: '2026-11-05T12:00:00Z',
      correlationId: 'corr-8491-abcd',
      errorCode: 'ERR_SYNC_FAIL',
    });
  });

  it('handles null or undefined gracefully', () => {
    expect(filterDiagnosticsForTriageDisplay(null)).toBeNull();
    expect(filterDiagnosticsForTriageDisplay(undefined)).toBeNull();
  });
});
