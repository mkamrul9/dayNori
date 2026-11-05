import { describe, expect, it } from 'vitest';
import {
  collectClientDiagnostics,
  createFeedbackDraft,
  getFeedbackStorageKey,
  isExternalDeliveryConfigured,
  quarantineFeedbackDrafts,
  sanitizeDiagnostics,
  sanitizeRouteTemplate,
  UNCONFIGURED_DELIVERY_NOTICE,
} from '@daynori/domain';
import {
  CreateFeedbackReportRequestSchema,
  FeedbackReportReceiptSchema,
} from '@daynori/contracts';

describe('Phase 82 - Feedback Domain & Invariants', () => {
  describe('Diagnostics Sanitization & Redaction', () => {
    it('sanitizes route template by removing query parameters, hashes, and replacing UUIDs', () => {
      const rawRoute = '/workspaces/b8a06bf4-60d9-4820-9bc6-32d7dc1cbbf5/notes/6ba7b810-9dad-11d1-80b4-00c04fd430c8?token=supersecret#section';
      const clean = sanitizeRouteTemplate(rawRoute);
      expect(clean).toBe('/workspaces/:id/notes/:id');
      expect(clean).not.toContain('supersecret');
      expect(clean).not.toContain('#section');
    });

    it('redacts tokens, credentials, and sensitive keys from diagnostics', () => {
      const maliciousDiagnostics = {
        appVersion: '1.2.3',
        platform: 'android',
        browserOrOs: 'Mozilla/5.0 with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDtoken1234567890',
        routeTemplate: '/support?token=leak',
        locale: 'en-US',
        timestamp: '2026-11-05T12:00:00.000Z',
        correlationId: 'test-corr-1',
        // Injected sensitive keys that should be deleted
        authToken: 'secret_token_value',
        password: 'my_password',
        journalBody: 'private journal notes that must never be sent',
        audioClip: 'base64audio...',
        prompt: 'system prompt instructions',
        cookie: 'sessionId=12345',
      };

      const sanitized = sanitizeDiagnostics(maliciousDiagnostics);

      // Verify approved keys exist
      expect(sanitized.appVersion).toBe('1.2.3');
      expect(sanitized.platform).toBe('android');
      expect(sanitized.locale).toBe('en-US');
      expect(sanitized.timestamp).toBe('2026-11-05T12:00:00.000Z');
      expect(sanitized.correlationId).toBe('test-corr-1');

      // Verify route template was sanitized
      expect(sanitized.routeTemplate).toBe('/support');
      expect(sanitized.routeTemplate).not.toContain('leak');

      // Verify JWT was redacted from string
      expect(sanitized.browserOrOs).toContain('[REDACTED_TOKEN]');
      expect(sanitized.browserOrOs).not.toContain('eyJhbGciOiJIUzI1Ni');

      // Verify forbidden properties were stripped
      const resultObj = sanitized as Record<string, unknown>;
      expect(resultObj['authToken']).toBeUndefined();
      expect(resultObj['password']).toBeUndefined();
      expect(resultObj['journalBody']).toBeUndefined();
      expect(resultObj['audioClip']).toBeUndefined();
      expect(resultObj['prompt']).toBeUndefined();
      expect(resultObj['cookie']).toBeUndefined();
    });

    it('collectClientDiagnostics returns reviewable diagnostic object with fallback', () => {
      const diag = collectClientDiagnostics({
        appVersion: '0.9.0',
        platform: 'web',
        route: '/help?tab=faq',
        errorCode: 'NETWORK_TIMEOUT_408',
      });

      expect(diag.appVersion).toBe('0.9.0');
      expect(diag.platform).toBe('web');
      expect(diag.routeTemplate).toBe('/help');
      expect(diag.errorCode).toBe('NETWORK_TIMEOUT_408');
      expect(diag.correlationId).toBeDefined();
    });
  });

  describe('Drafts & Storage Scoping', () => {
    it('creates draft with stable clientReportId and default values', () => {
      const draft = createFeedbackDraft('bug', {
        summary: 'Cannot save recurring task',
        description: 'Clicking save does not persist after offline reload',
      });

      expect(draft.clientReportId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(draft.reportType).toBe('bug');
      expect(draft.category).toBe('ui');
      expect(draft.summary).toBe('Cannot save recurring task');
      expect(draft.state).toBe('draft');
      expect(draft.includeDiagnostics).toBe(false);
      expect(draft.attachments).toEqual([]);
    });

    it('generates storage keys scoped strictly by user, workspace, and report type', () => {
      const keyUserA = getFeedbackStorageKey('user-111', 'ws-aaa', 'bug');
      const keyUserB = getFeedbackStorageKey('user-222', 'ws-aaa', 'bug');
      const keyUserASuggestion = getFeedbackStorageKey('user-111', 'ws-aaa', 'suggestion');

      expect(keyUserA).toBe('daynori:feedback:draft:user-111:ws-aaa:bug');
      expect(keyUserB).toBe('daynori:feedback:draft:user-222:ws-aaa:bug');
      expect(keyUserASuggestion).toBe('daynori:feedback:draft:user-111:ws-aaa:suggestion');

      expect(keyUserA).not.toBe(keyUserB);
    });

    it('quarantines pending drafts on account switch so User B cannot access User A drafts', () => {
      const userAKey = getFeedbackStorageKey('user-a', 'ws-1', 'bug');
      const userBKey = getFeedbackStorageKey('user-b', 'ws-1', 'suggestion');

      const draftA = createFeedbackDraft('bug', { summary: 'User A private draft' });
      const draftB = createFeedbackDraft('suggestion', { summary: 'User B draft' });

      const allDrafts = {
        [userAKey]: draftA,
        [userBKey]: draftB,
      };

      const { allowedDrafts, quarantinedDrafts } = quarantineFeedbackDrafts({
        currentUserId: 'user-a',
        nextUserId: 'user-b',
        allDraftsByStorageKey: allDrafts,
      });

      expect(allowedDrafts[userBKey]).toBeDefined();
      expect(allowedDrafts[userAKey]).toBeUndefined();

      expect(quarantinedDrafts[userAKey]).toBeDefined();
      expect(quarantinedDrafts[userAKey]?.summary).toBe('User A private draft');
    });
  });

  describe('Delivery Configuration & Truthful Messaging', () => {
    it('truthfully reports unconfigured when no webhook, email, or endpoint is provided', () => {
      expect(isExternalDeliveryConfigured({})).toBe(false);
      expect(isExternalDeliveryConfigured({ webhookUrl: '', emailTo: '   ' })).toBe(false);
    });

    it('reports configured when external webhook or email is defined', () => {
      expect(isExternalDeliveryConfigured({ webhookUrl: 'https://support.internal/hook' })).toBe(true);
      expect(isExternalDeliveryConfigured({ emailTo: 'support@example.com' })).toBe(true);
    });

    it('provides truthful delivery notice constant', () => {
      expect(UNCONFIGURED_DELIVERY_NOTICE).toContain('External developer inbox is not configured');
    });
  });

  describe('Contracts Schema Validation', () => {
    it('validates a valid CreateFeedbackReportRequest', () => {
      const validPayload = {
        clientReportId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        reportType: 'bug' as const,
        category: 'sync',
        summary: 'Sync failed with 409',
        description: 'Detailed description of the bug occurring during offline sync reconciliation',
        stepsToReproduce: '1. Go offline\n2. Edit note\n3. Reconnect',
        expectedBehavior: 'Note merges cleanly',
        actualBehavior: 'Conflict dialog appeared',
        frequency: 'often' as const,
        severity: 'medium' as const,
        replyEmail: 'tester@example.com',
        includeDiagnostics: true,
        diagnostics: {
          appVersion: '0.1.0',
          platform: 'web' as const,
          browserOrOs: 'Chrome 120',
          routeTemplate: '/notes',
          locale: 'en',
          timestamp: new Date().toISOString(),
          correlationId: 'corr-12345',
        },
        attachments: [],
      };

      const parsed = CreateFeedbackReportRequestSchema.parse(validPayload);
      expect(parsed.summary).toBe('Sync failed with 409');
      expect(parsed.reportType).toBe('bug');
    });

    it('rejects short summaries (< 3 chars) and short descriptions (< 10 chars)', () => {
      expect(() =>
        CreateFeedbackReportRequestSchema.parse({
          clientReportId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          reportType: 'suggestion',
          summary: 'Hi',
          description: 'Too short',
        })
      ).toThrow();
    });

    it('rejects invalid reply email format', () => {
      expect(() =>
        CreateFeedbackReportRequestSchema.parse({
          clientReportId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          reportType: 'contact',
          summary: 'Inquiry about export format',
          description: 'Can we export data into SQLite format directly?',
          replyEmail: 'not-an-email',
        })
      ).toThrow();
    });

    it('rejects oversized attachment size (> 10MB)', () => {
      expect(() =>
        CreateFeedbackReportRequestSchema.parse({
          clientReportId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          reportType: 'bug',
          summary: 'Oversized attachment test',
          description: 'Testing oversized attachment validation in contract',
          attachments: [
            {
              id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              fileName: 'huge_log.txt',
              mimeType: 'text/plain',
              sizeBytes: 15 * 1024 * 1024, // 15MB
            },
          ],
        })
      ).toThrow();
    });

    it('validates a FeedbackReportReceipt', () => {
      const receipt = {
        id: '11111111-1111-1111-1111-111111111111',
        clientReportId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        workspaceId: '22222222-2222-2222-2222-222222222222',
        reporterId: '33333333-3333-3333-3333-333333333333',
        reportType: 'suggestion' as const,
        category: 'general',
        summary: 'Add dark mode toggle to quick settings',
        description: 'It would be great to have quick toggle directly on the header',
        includeDiagnostics: false,
        attachments: [],
        status: 'received' as const,
        deliveryStatus: 'unconfigured' as const,
        deliveryNotice: UNCONFIGURED_DELIVERY_NOTICE,
        createdAt: '2026-11-05T12:00:00.000Z',
        updatedAt: '2026-11-05T12:00:00.000Z',
      };

      const parsed = FeedbackReportReceiptSchema.parse(receipt);
      expect(parsed.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(parsed.status).toBe('received');
      expect(parsed.deliveryStatus).toBe('unconfigured');
    });
  });
});
