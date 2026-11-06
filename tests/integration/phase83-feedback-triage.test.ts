import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { DaynoriWorker } from '../../apps/worker/src/worker.js';

describe('Phase 83: Developer feedback triage and verified support contact', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase83-key';

  const operatorUserId = crypto.randomUUID();
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let operatorClient: DaynoriApiClient;
  let userAClient: DaynoriApiClient;
  let userBClient: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceBId: string;

  async function createToken(userId: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_OPERATOR_USER_IDS'] = operatorUserId;

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    // Ensure migrations up to 00076 are applied
    await new Migrator().migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const jwks: JSONWebKeySet = { keys: [publicJwk] };

    server = buildServer({
      jwtVerifier: new JwtVerifier({ issuer, audience, localJwks: jwks }),
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind server');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const admin = await adminPool.connect();
    try {
      // Seed profiles
      await admin.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES ($1, 'Operator User'), ($2, 'Reporter User A'), ($3, 'Reporter User B')
         ON CONFLICT (id) DO NOTHING`,
        [operatorUserId, userAId, userBId]
      );

      // Seed personal workspaces
      const wsARes = await admin.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, owner_id, kind) VALUES ('Workspace A', $1, 'personal') RETURNING id`,
        [userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;

      const wsBRes = await admin.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, owner_id, kind) VALUES ('Workspace B', $1, 'personal') RETURNING id`,
        [userBId]
      );
      workspaceBId = wsBRes.rows[0]!.id;

      // Seed memberships
      await admin.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner'), ($3, $4, 'owner')
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [workspaceAId, userAId, workspaceBId, userBId]
      );
    } finally {
      admin.release();
    }

    const operatorToken = await createToken(operatorUserId);
    const tokenA = await createToken(userAId);
    const tokenB = await createToken(userBId);

    operatorClient = createApiClient({ baseUrl, token: () => operatorToken });
    userAClient = createApiClient({ baseUrl, token: () => tokenA });
    userBClient = createApiClient({ baseUrl, token: () => tokenB });
  });

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('restricts triage routes to platform operators: ordinary users receive 403 Forbidden', async () => {
    // Ordinary User A attempts to list triage reports
    await expect(userAClient.listFeedbackTriage()).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('Platform operator access required'),
    });

    // Ordinary User B attempts to trigger retention purge
    await expect(userBClient.purgeExpiredFeedback({ retentionDays: 90 })).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('Platform operator access required'),
    });

    // Authorized Operator succeeds
    const triageList = await operatorClient.listFeedbackTriage();
    expect(triageList.data).toBeDefined();
    expect(triageList.pagination).toBeDefined();
  });

  it('supports cross-workspace triage and filtering across distinct accounts', async () => {
    const clientReportA = crypto.randomUUID();
    const clientReportB = crypto.randomUUID();

    // User A submits Bug in Workspace A
    const resA = await userAClient.createFeedbackReport(workspaceAId, {
      clientReportId: clientReportA,
      reportType: 'bug',
      category: 'ui',
      summary: 'Theme toggle contrast defect',
      description: 'The theme switch does not properly update dark mode tokens on Android.',
      stepsToReproduce: '1. Open Settings 2. Tap dark mode',
      expectedBehavior: 'Dark paper palette applied',
      actualBehavior: 'Background remains bright',
      severity: 'high',
      includeDiagnostics: true,
      diagnostics: {
        platform: 'android',
        appVersion: '1.4.0',
        browserOrOs: 'Android 15',
        routeTemplate: '/settings',
        locale: 'en-US',
        timestamp: new Date().toISOString(),
        correlationId: 'corr-83-a',
      },
      attachments: [],
    });
    expect(resA.data.id).toBeDefined();
    const reportAId = resA.data.id;

    // User B submits Suggestion in Workspace B
    const resB = await userBClient.createFeedbackReport(workspaceBId, {
      clientReportId: clientReportB,
      reportType: 'suggestion',
      category: 'feature',
      summary: 'Add export to markdown shortcut',
      description: 'Would love a keyboard shortcut (Cmd+Shift+E) to export notes directly to markdown.',
      includeDiagnostics: false,
      attachments: [],
    });
    expect(resB.data.id).toBeDefined();
    const reportBId = resB.data.id;

    // Operator lists triage reports across workspaces
    const allReports = await operatorClient.listFeedbackTriage({ pageSize: 50 });
    const ids = allReports.data.map((r) => r.id);
    expect(ids).toContain(reportAId);
    expect(ids).toContain(reportBId);

    // Operator filters by reportType = 'bug'
    const bugReports = await operatorClient.listFeedbackTriage({ reportType: 'bug' });
    expect(bugReports.data.some((r) => r.id === reportAId)).toBe(true);
    expect(bugReports.data.some((r) => r.id === reportBId)).toBe(false);

    // Operator filters by reportType = 'suggestion'
    const suggestionReports = await operatorClient.listFeedbackTriage({ reportType: 'suggestion' });
    expect(suggestionReports.data.some((r) => r.id === reportAId)).toBe(false);
    expect(suggestionReports.data.some((r) => r.id === reportBId)).toBe(true);

    // Operator filters by search query
    const searchRes = await operatorClient.listFeedbackTriage({ search: 'contrast defect' });
    expect(searchRes.data.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.data[0]?.id).toBe(reportAId);
  });

  it('enforces status machine transitions and tracks audit events', async () => {
    const clientReportId = crypto.randomUUID();
    const submitRes = await userAClient.createFeedbackReport(workspaceAId, {
      clientReportId,
      reportType: 'bug',
      summary: 'Calendar sync latency bug',
      description: 'Events created on web take several minutes to appear in Android calendar.',
      includeDiagnostics: false,
      attachments: [],
    });
    const reportId = submitRes.data.id;

    // Initial status is received
    expect(submitRes.data.status).toBe('received');

    // Operator updates status to acknowledged
    const ackRes = await operatorClient.updateFeedbackTriageReport(reportId, {
      status: 'acknowledged',
      priority: 'high',
    });
    expect(ackRes.data.status).toBe('acknowledged');
    expect(ackRes.data.priority).toBe('high');
    expect(ackRes.data.acknowledgedAt).not.toBeNull();

    // Operator updates status to investigating
    const invRes = await operatorClient.updateFeedbackTriageReport(reportId, {
      status: 'investigating',
    });
    expect(invRes.data.status).toBe('investigating');

    // Close the report
    await operatorClient.updateFeedbackTriageReport(reportId, {
      status: 'closed',
    });

    // Disallowed transition: closed cannot transition directly to acknowledged (can only be reopened to investigating)
    await expect(
      operatorClient.updateFeedbackTriageReport(reportId, {
        status: 'acknowledged',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Invalid status transition'),
    });

    // Check audit trail
    const auditRes = await operatorClient.listFeedbackTriageAudit(reportId);
    expect(auditRes.data.length).toBeGreaterThanOrEqual(2);

    const statusChanges = auditRes.data.filter((ev) => ev.action === 'status_change');
    expect(statusChanges.length).toBeGreaterThanOrEqual(2);
    expect(statusChanges[0]?.details).toHaveProperty('newStatus');
    // Audit never logs full description or secrets
    expect(statusChanges[0]?.details).not.toHaveProperty('description');
  });

  it('maintains strict confidentiality of internal notes: never leaked to reporters or direct queries', async () => {
    const clientReportId = crypto.randomUUID();
    const submitRes = await userAClient.createFeedbackReport(workspaceAId, {
      clientReportId,
      reportType: 'contact',
      category: 'privacy',
      summary: 'Data export clarification inquiry',
      description: 'Does the JSON export include deleted notes metadata?',
      includeDiagnostics: false,
      attachments: [],
    });
    const reportId = submitRes.data.id;

    // Operator adds confidential internal note
    const noteRes = await operatorClient.createFeedbackInternalNote(reportId, {
      note: 'Engineering note: verify tombstone serialization in portability worker.',
    });
    expect(noteRes.data.id).toBeDefined();
    expect(noteRes.data.note).toBe('Engineering note: verify tombstone serialization in portability worker.');

    // Operator can read internal notes
    const operatorNotes = await operatorClient.listFeedbackInternalNotes(reportId);
    expect(operatorNotes.data.length).toBe(1);
    expect(operatorNotes.data[0]?.note).toContain('Engineering note');

    // Reporter User A inspects their own report receipt
    const userReceipt = await userAClient.getFeedbackReport(workspaceAId, reportId);
    expect(userReceipt.data.id).toBe(reportId);
    // Reporter receipt schema does not contain internal notes field
    expect(userReceipt.data).not.toHaveProperty('internalNotes');
    expect(userReceipt.data).not.toHaveProperty('internalNotesCount');

    // Verify direct SQL query under User A context is blocked by PostgreSQL RLS
    const userCanReadNotes = await withUserContext(runtimePool, userAId, async (client) => {
      const q = await client.query('SELECT * FROM app.feedback_internal_notes WHERE report_id = $1', [reportId]);
      return q.rows;
    });
    expect(userCanReadNotes).toEqual([]); // 0 rows returned by RLS
  });

  it('delivers verified developer response to reporter while preserving anti-IDOR', async () => {
    const clientReportId = crypto.randomUUID();
    const submitRes = await userAClient.createFeedbackReport(workspaceAId, {
      clientReportId,
      reportType: 'bug',
      summary: 'Push notification timeout',
      description: 'Web push token registration timed out on Firefox.',
      includeDiagnostics: false,
      attachments: [],
    });
    const reportId = submitRes.data.id;

    const responseMsg =
      'Thank you for reporting this. We adjusted the VAPID handshake timeout to 10s and verified resolution.';

    // Operator sends response to reporter
    const updateRes = await operatorClient.updateFeedbackTriageReport(reportId, {
      status: 'resolved',
      responseText: responseMsg,
    });
    expect(updateRes.data.status).toBe('resolved');
    expect(updateRes.data.resolvedAt).not.toBeNull();
    expect(updateRes.data.responseText).toBe(responseMsg);
    expect(updateRes.data.respondedAt).not.toBeNull();

    // Reporter User A retrieves their report status and sees the verified response
    const reporterView = await userAClient.getFeedbackReport(workspaceAId, reportId);
    expect(reporterView.data.status).toBe('resolved');
    expect(reporterView.data.responseText).toBe(responseMsg);
    expect(reporterView.data.respondedAt).not.toBeNull();
    // Does NOT leak operator internal ID or email to reporter
    expect(reporterView.data).not.toHaveProperty('respondedBy');

    // Anti-IDOR: User B attempts to access User A report -> 404
    await expect(userBClient.getFeedbackReport(workspaceBId, reportId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('supports duplicate report linking and rejects self-duplicate links', async () => {
    const clientReport1 = crypto.randomUUID();
    const clientReport2 = crypto.randomUUID();

    const rep1 = await userAClient.createFeedbackReport(workspaceAId, {
      clientReportId: clientReport1,
      reportType: 'bug',
      summary: 'Search index missing tags',
      description: 'Tags are not indexed in full text search.',
      includeDiagnostics: false,
      attachments: [],
    });

    const rep2 = await userAClient.createFeedbackReport(workspaceAId, {
      clientReportId: clientReport2,
      reportType: 'bug',
      summary: 'Search does not find tags',
      description: 'Duplicate inquiry about tag search.',
      includeDiagnostics: false,
      attachments: [],
    });

    // Linking rep2 as duplicate of rep1
    const dupRes = await operatorClient.updateFeedbackTriageReport(rep2.data.id, {
      status: 'duplicate',
      duplicateOfId: rep1.data.id,
    });
    expect(dupRes.data.status).toBe('duplicate');
    expect(dupRes.data.duplicateOfId).toBe(rep1.data.id);

    // Reject self-duplicate
    await expect(
      operatorClient.updateFeedbackTriageReport(rep1.data.id, {
        duplicateOfId: rep1.data.id,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('cannot be marked as a duplicate of itself'),
    });
  });

  it('purges expired terminal reports according to bounded retention policy without touching active reports', async () => {
    const admin = await adminPool.connect();
    const oldReportId = crypto.randomUUID();
    const oldClientReportId = crypto.randomUUID();
    const activeReportId = crypto.randomUUID();
    const activeClientReportId = crypto.randomUUID();

    try {
      // Insert an expired resolved report (120 days old)
      await admin.query(
        `
        INSERT INTO app.feedback_reports (
          id, client_report_id, workspace_id, reporter_id, report_type,
          summary, description, status, resolved_at, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, 'bug',
          'Expired historical bug', 'Ancient resolved bug report', 'resolved',
          now() - interval '120 days', now() - interval '120 days', now() - interval '120 days'
        )
        `,
        [oldReportId, oldClientReportId, workspaceAId, userAId]
      );

      // Insert an active investigating report (also created 120 days ago, but NOT terminal)
      await admin.query(
        `
        INSERT INTO app.feedback_reports (
          id, client_report_id, workspace_id, reporter_id, report_type,
          summary, description, status, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, 'bug',
          'Active investigation ticket', 'Should NOT be purged', 'investigating',
          now() - interval '120 days', now() - interval '120 days'
        )
        `,
        [activeReportId, activeClientReportId, workspaceAId, userAId]
      );
    } finally {
      admin.release();
    }

    // Run 90-day retention purge
    const purgeRes = await operatorClient.purgeExpiredFeedback({ retentionDays: 90 });
    expect(purgeRes.data.purgedCount).toBeGreaterThanOrEqual(1);

    // Verify expired resolved report was deleted
    const adminCheck = await adminPool.connect();
    try {
      const oldCheck = await adminCheck.query(`SELECT 1 FROM app.feedback_reports WHERE id = $1`, [oldReportId]);
      expect(oldCheck.rowCount).toBe(0);

      // Verify active investigating report was PRESERVED
      const activeCheck = await adminCheck.query(`SELECT 1 FROM app.feedback_reports WHERE id = $1`, [activeReportId]);
      expect(activeCheck.rowCount).toBe(1);
    } finally {
      adminCheck.release();
    }
  });

  it('worker processes feedback_retention_cleanup job', async () => {
    const admin = await adminPool.connect();
    try {
      await admin.query("DELETE FROM app.background_jobs WHERE task_type = 'feedback_retention_cleanup'");
      await admin.query(
        `INSERT INTO app.background_jobs (task_type, payload, status)
         VALUES ('feedback_retention_cleanup', '{"retentionDays": 90}'::jsonb, 'pending')`
      );
    } finally {
      admin.release();
    }

    const worker = new DaynoriWorker(adminPool);
    worker.start(adminPool);

    const jobResult = await worker.pollAndProcessNextJob(adminPool, {
      taskTypes: ['feedback_retention_cleanup'],
    });

    expect(jobResult).toBeDefined();
    expect(jobResult?.status).toBe('completed');
    expect(jobResult?.details?.['taskType']).toBe('feedback_retention_cleanup');

    await worker.stop();
  });
});
