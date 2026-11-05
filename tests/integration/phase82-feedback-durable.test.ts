import crypto from 'node:crypto';
import http from 'node:http';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { UNCONFIGURED_DELIVERY_NOTICE } from '@daynori/domain';
import { DaynoriWorker } from '../../apps/worker/src/worker.js';

describe('Phase 82: Durable feedback, bug, and contact submissions', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase82-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

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

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    // Ensure migration 00075 is applied
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
         VALUES ($1, 'Feedback User A'), ($2, 'Feedback User B')
         ON CONFLICT (id) DO NOTHING`,
        [userAId, userBId]
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
         ON CONFLICT DO NOTHING`,
        [workspaceAId, userAId, workspaceBId, userBId]
      );
    } finally {
      admin.release();
    }

    const tokenA = await createToken(userAId);
    const tokenB = await createToken(userBId);

    clientA = createApiClient({ baseUrl, token: tokenA });
    clientB = createApiClient({ baseUrl, token: tokenB });
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  it('submits bug, suggestion, and contact reports with durable receipts and truthful unconfigured notice', async () => {
    const clientReportId = crypto.randomUUID();

    const response = await clientA.createFeedbackReport(workspaceAId, {
      clientReportId,
      reportType: 'bug',
      category: 'ui',
      summary: 'Task checkbox jumps on mobile web',
      description: 'When tapping a task checkbox while scrolling on Chrome mobile, the scroll position jumps.',
      stepsToReproduce: '1. Open Tasks\n2. Scroll down\n3. Tap checkbox',
      expectedBehavior: 'Checkbox toggles without scroll jump',
      actualBehavior: 'Page scrolls to top',
      frequency: 'often',
      severity: 'medium',
      includeDiagnostics: true,
      diagnostics: {
        appVersion: '0.1.0',
        platform: 'web',
        browserOrOs: 'Chrome 125',
        routeTemplate: '/tasks',
        locale: 'en-US',
        timestamp: new Date().toISOString(),
        correlationId: 'test-corr-82',
      },
      attachments: [],
    });

    expect(response.data.id).toBeDefined();
    expect(response.data.clientReportId).toBe(clientReportId);
    expect(response.data.workspaceId).toBe(workspaceAId);
    expect(response.data.reporterId).toBe(userAId);
    expect(response.data.reportType).toBe('bug');
    expect(response.data.status).toBe('received');
    expect(response.data.deliveryStatus).toBe('unconfigured');
    expect(response.data.deliveryNotice).toBe(UNCONFIGURED_DELIVERY_NOTICE);
    expect(response.data.includeDiagnostics).toBe(true);
    expect(response.data.diagnostics?.routeTemplate).toBe('/tasks');

    // Submit suggestion
    const suggestionRes = await clientA.createFeedbackReport(workspaceAId, {
      clientReportId: crypto.randomUUID(),
      reportType: 'suggestion',
      category: 'general',
      summary: 'Add export to CSV for expenses',
      description: 'Would love an option to export monthly expense summaries to CSV.',
      includeDiagnostics: false,
    });
    expect(suggestionRes.data.reportType).toBe('suggestion');
    expect(suggestionRes.data.status).toBe('received');

    // Submit contact
    const contactRes = await clientA.createFeedbackReport(workspaceAId, {
      clientReportId: crypto.randomUUID(),
      reportType: 'contact',
      category: 'support',
      summary: 'Question about backup encryption key',
      description: 'How can I verify my recovery phrase offline without restoring everything?',
      replyEmail: 'tester@example.com',
      includeDiagnostics: false,
    });
    expect(contactRes.data.reportType).toBe('contact');
    expect(contactRes.data.replyEmail).toBe('tester@example.com');
  });

  it('guarantees idempotency: retrying with identical clientReportId returns original receipt and creates no duplicate', async () => {
    const clientReportId = crypto.randomUUID();

    const first = await clientA.createFeedbackReport(workspaceAId, {
      clientReportId,
      reportType: 'suggestion',
      summary: 'Dark mode AMOLED pitch black option',
      description: 'Please add a pure pitch black OLED background option.',
      includeDiagnostics: false,
    });

    const second = await clientA.createFeedbackReport(workspaceAId, {
      clientReportId,
      reportType: 'suggestion',
      summary: 'Dark mode AMOLED pitch black option (retried)',
      description: 'Please add a pure pitch black OLED background option.',
      includeDiagnostics: false,
    });

    expect(second.data.id).toBe(first.data.id);
    expect(second.data.clientReportId).toBe(clientReportId);
    expect(second.data.isReplay).toBe(true);

    // Verify database row count is exactly 1
    const admin = await adminPool.connect();
    try {
      const res = await admin.query<{ count: string }>(
        `SELECT count(*) AS count FROM app.feedback_reports WHERE reporter_id = $1 AND client_report_id = $2`,
        [userAId, clientReportId]
      );
      expect(res.rows[0]?.count).toBe('1');
    } finally {
      admin.release();
    }
  });

  it('enforces tenant isolation and anti-IDOR: User B cannot access User A reports', async () => {
    const clientReportId = crypto.randomUUID();

    const reportA = await clientA.createFeedbackReport(workspaceAId, {
      clientReportId,
      reportType: 'bug',
      summary: 'User A confidential bug',
      description: 'This is user A private report content.',
      includeDiagnostics: false,
    });

    // 1. User B cannot fetch report A in workspace A
    await expect(clientB.getFeedbackReport(workspaceAId, reportA.data.id)).rejects.toThrow();

    // 2. User B cannot fetch report A by spoofing workspace B
    await expect(clientB.getFeedbackReport(workspaceBId, reportA.data.id)).rejects.toThrow();

    // 3. User B cannot insert report into workspace A
    await expect(
      clientB.createFeedbackReport(workspaceAId, {
        clientReportId: crypto.randomUUID(),
        reportType: 'bug',
        summary: 'Cross tenant attack',
        description: 'Trying to inject report into unauthorized workspace',
      })
    ).rejects.toThrow();

    // 4. User B listing reports only returns their own
    const listB = await clientB.listFeedbackReports(workspaceBId);
    const foundAInB = listB.data.some((r) => r.id === reportA.data.id);
    expect(foundAInB).toBe(false);
  });

  it('worker processes feedback delivery job when webhook destination is configured', async () => {
    // Spin up a temporary local webhook receiver server
    let receivedPayload: Record<string, unknown> | null = null;
    const webhookServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          receivedPayload = JSON.parse(body);
        } catch {
          receivedPayload = {};
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => webhookServer.listen(0, '127.0.0.1', resolve));
    const hookAddr = webhookServer.address();
    if (!hookAddr || typeof hookAddr === 'string') throw new Error('Hook server failed');
    const webhookUrl = `http://127.0.0.1:${hookAddr.port}/webhook`;

    process.env['FEEDBACK_DELIVERY_WEBHOOK_URL'] = webhookUrl;

    const admin = await adminPool.connect();
    try {
      await admin.query("DELETE FROM app.background_jobs WHERE task_type = 'feedback_delivery'");
    } finally {
      admin.release();
    }

    try {
      const clientReportId = crypto.randomUUID();
      const reportRes = await clientA.createFeedbackReport(workspaceAId, {
        clientReportId,
        reportType: 'contact',
        summary: 'Webhook delivery verification report',
        description: 'Verifying worker delivery dispatch to external webhook.',
        replyEmail: 'support-test@daynori.internal',
        includeDiagnostics: false,
      });

      expect(reportRes.data.deliveryStatus).toBe('queued');

      // Now run worker poll to execute the background job
      const worker = new DaynoriWorker(adminPool);
      worker.start(adminPool);

      const jobResult = await worker.pollAndProcessNextJob(adminPool, {
        taskTypes: ['feedback_delivery'],
      });

      expect(jobResult).toBeDefined();
      expect(jobResult?.status).toBe('completed');
      expect(jobResult?.details?.['deliveryStatus']).toBe('delivered');

      expect(receivedPayload).toBeDefined();
      expect(receivedPayload?.['clientReportId']).toBe(clientReportId);
      expect(receivedPayload?.['summary']).toBe('Webhook delivery verification report');

      // Verify report in DB is updated to delivered
      const updated = await clientA.getFeedbackReport(workspaceAId, reportRes.data.id);
      expect(updated.data.deliveryStatus).toBe('delivered');

      await worker.stop();
    } finally {
      delete process.env['FEEDBACK_DELIVERY_WEBHOOK_URL'];
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }
  });
});
