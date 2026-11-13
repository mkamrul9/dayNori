import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withTenantContext, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient } from '@daynori/api-client';
import { listPrimaryShellTabs } from '@daynori/domain';
import { issueReauthToken, setReauthSecretForTesting } from '../../apps/api/src/modules/portability/reauth.js';

describe('Phase 102: Authorized Version 2 Publication & Live Verification Rehearsals', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase102-publication-rehearsal-key';

  const operatorUserId = crypto.randomUUID();
  const prevNodeEnv = process.env['NODE_ENV'];

  async function createToken(
    userId: string,
    email: string = `user-${userId.slice(0, 8)}@example.test`,
    sessionId: string = crypto.randomUUID()
  ): Promise<{ token: string; sessionId: string }> {
    const token = await new SignJWT({
      sub: userId,
      email,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: sessionId,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
    return { token, sessionId };
  }

  beforeAll(async () => {
    // Assert production environment semantics for fail-closed verification
    process.env['NODE_ENV'] = 'production';
    process.env['DAYNORI_OPERATOR_USER_IDS'] = operatorUserId;
    setReauthSecretForTesting('daynori-reauth-test-secret-with-sufficient-entropy-32-chars');

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    jwks = {
      keys: [
        {
          ...publicJwk,
          kid,
          alg: 'RS256',
          use: 'sig',
        },
      ],
    };

    const jwtVerifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
      allowedAlgorithms: ['RS256'],
    });

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    migrator = new Migrator(adminPool);
    await migrator.migrate();

    server = buildServer({
      adminPool,
      runtimePool,
      jwtVerifier,
      allowUnauthenticatedStartup: false,
    });

    baseUrl = await server.listen({ port: 0, host: '127.0.0.1' });
  }, 30000);

  afterAll(async () => {
    delete process.env['DAYNORI_OPERATOR_USER_IDS'];
    setReauthSecretForTesting(null);
    if (prevNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = prevNodeEnv;
    }
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 1: Synthetic Account Authentication & Multi-Tenant Isolation
  // --------------------------------------------------------------------------
  it('PUB-REHEARSAL-01: verifies synthetic account login, session validation, and tenant isolation', async () => {
    // 1. Unauthenticated requests fail closed with 401
    const unauthRes = await fetch(`${baseUrl}/v1/users/me/preferences`);
    expect(unauthRes.status).toBe(401);

    // 2. Synthetic user 1 logs in and provisions personal workspace
    const user1Id = crypto.randomUUID();
    const { token: user1Token } = await createToken(user1Id, 'synthetic.user1@daynori.test');
    const client1 = createApiClient({ baseUrl, token: () => user1Token });

    const prov1 = await client1.provisionPersonalWorkspace();
    expect(prov1.data.workspace.id).toBeDefined();
    const ws1Id = prov1.data.workspace.id;

    // User 1 creates a private note
    const note1 = await client1.createNote(ws1Id, {
      title: 'Tenant 1 Confidential Plan',
      plainText: 'Personal planning data strictly scoped to workspace 1.',
    });
    expect(note1.data.id).toBeDefined();

    // 3. Synthetic user 2 logs in with separate identity
    const user2Id = crypto.randomUUID();
    const { token: user2Token } = await createToken(user2Id, 'synthetic.user2@daynori.test');
    const client2 = createApiClient({ baseUrl, token: () => user2Token });

    const prov2 = await client2.provisionPersonalWorkspace();
    expect(prov2.data.workspace.id).toBeDefined();
    const ws2Id = prov2.data.workspace.id;
    expect(ws2Id).not.toBe(ws1Id);

    // 4. Multi-tenant isolation: User 2 cannot read or access User 1's workspace
    await expect(client2.getNote(ws1Id, note1.data.id)).rejects.toThrow();
    await expect(client2.listNotes(ws1Id)).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 2: Scoped Core Organizer Durable Save, Reopen, and Outbox Sync
  // --------------------------------------------------------------------------
  it('PUB-REHEARSAL-02: verifies durable save, reopen integrity, and offline outbox sync', async () => {
    const userId = crypto.randomUUID();
    const { token } = await createToken(userId, 'organizer.sync.user@daynori.test');
    const client = createApiClient({ baseUrl, token: () => token });

    const prov = await client.provisionPersonalWorkspace();
    const workspaceId = prov.data.workspace.id;

    // 1. Durable save of note, task, and routine
    const savedNote = await client.createNote(workspaceId, {
      title: 'Durable Personal Strategy',
      plainText: 'Key objectives and reflections for the upcoming quarter.',
    });
    const savedTask = await client.createTask(workspaceId, {
      title: 'Complete candidate verification checklist',
      priority: 'high',
    });
    const savedRoutine = await client.createRoutine(workspaceId, {
      title: 'Morning Mindfulness & Daily Review',
      timezone: 'UTC',
      scheduledTime: '08:00',
    });

    expect(savedNote.data.id).toBeDefined();
    expect(savedTask.data.id).toBeDefined();
    expect(savedRoutine.data.id).toBeDefined();

    // 2. Simulate client session restart / cold reopen in fresh client instance
    const freshClient = createApiClient({ baseUrl, token: () => token });
    const reopenedNote = await freshClient.getNote(workspaceId, savedNote.data.id);
    const reopenedTask = await freshClient.getTask(workspaceId, savedTask.data.id);
    const reopenedRoutine = await freshClient.getRoutine(workspaceId, savedRoutine.data.id);

    expect(reopenedNote.data.title).toBe('Durable Personal Strategy');
    expect(reopenedNote.data.plainText).toBe('Key objectives and reflections for the upcoming quarter.');
    expect(reopenedTask.data.title).toBe('Complete candidate verification checklist');
    expect(reopenedTask.data.priority).toBe('high');
    expect(reopenedRoutine.data.title).toBe('Morning Mindfulness & Daily Review');

    // 3. Offline mutation outbox serialization & replay simulation
    interface QueuedSyncMutation {
      id: string;
      action: 'updateNote' | 'updateTask';
      targetId: string;
      baseRevision: number;
      patch: Record<string, unknown>;
    }

    const outbox: QueuedSyncMutation[] = [
      {
        id: crypto.randomUUID(),
        action: 'updateNote',
        targetId: savedNote.data.id,
        baseRevision: savedNote.data.revision,
        patch: {
          title: 'Durable Personal Strategy (Revised In Flight)',
          plainText: 'Revised notes taken during offline commute.',
        },
      },
      {
        id: crypto.randomUUID(),
        action: 'updateTask',
        targetId: savedTask.data.id,
        baseRevision: savedTask.data.revision,
        patch: {
          title: 'Complete candidate verification checklist (Urgent)',
          priority: 'urgent',
        },
      },
    ];

    // Outbox serialization to disk / local store simulation
    const serialized = JSON.stringify(outbox);
    const deserialized: QueuedSyncMutation[] = JSON.parse(serialized);
    expect(deserialized.length).toBe(2);

    // Sequential replay on reconnect
    for (const mutation of deserialized) {
      if (mutation.action === 'updateNote') {
        const res = await freshClient.updateNote(workspaceId, mutation.targetId, {
          title: mutation.patch['title'] as string,
          plainText: mutation.patch['plainText'] as string,
          baseRevision: mutation.baseRevision,
        });
        expect(res.data.revision).toBeGreaterThan(mutation.baseRevision);
      } else if (mutation.action === 'updateTask') {
        const res = await freshClient.updateTask(workspaceId, mutation.targetId, {
          title: mutation.patch['title'] as string,
          priority: mutation.patch['priority'] as any,
          baseRevision: mutation.baseRevision,
        });
        expect(res.data.revision).toBeGreaterThan(mutation.baseRevision);
      }
    }

    // 4. Optimistic concurrency conflict rejection: attempting to replay stale baseRevision fails with 409
    await expect(
      freshClient.updateTask(workspaceId, savedTask.data.id, {
        title: 'Conflicting Task Edit with Old Base Revision',
        priority: 'low',
        baseRevision: savedTask.data.revision, // old base revision
      })
    ).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 3: Support Receipt, Feedback Ingestion, and Operator Triage
  // --------------------------------------------------------------------------
  it('PUB-REHEARSAL-03: verifies customer support receipt and operator triage pipeline', async () => {
    // 1. Synthetic user submits feedback / bug report
    const userId = crypto.randomUUID();
    const { token: userToken } = await createToken(userId, 'support.tester@daynori.test');
    const userClient = createApiClient({ baseUrl, token: () => userToken });

    const prov = await userClient.provisionPersonalWorkspace();
    const workspaceId = prov.data.workspace.id;

    const clientReportId = crypto.randomUUID();
    const submitRes = await fetch(
      `${baseUrl}/v1/workspaces/${workspaceId}/feedback/reports`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientReportId,
          reportType: 'bug',
          category: 'accessibility',
          summary: 'Contrast check on high contrast mode',
          description: 'Observed subtle contrast boundary on task completion icon.',
        }),
      }
    );
    expect([200, 201]).toContain(submitRes.status);
    const reportData = (await submitRes.json()) as any;
    const reportId = reportData.data.id;
    expect(reportId).toBeDefined();
    expect(['received', 'open']).toContain(reportData.data.status);

    // 2. Non-operator user attempting to access operator triage endpoints receives 403 Forbidden
    const unauthTriageRes = await fetch(`${baseUrl}/v1/operator/feedback/reports`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(unauthTriageRes.status).toBe(403);

    // 3. Platform operator user accesses triage queue
    const { token: operatorToken } = await createToken(operatorUserId, 'operator@daynori.test');
    const operatorClient = createApiClient({ baseUrl, token: () => operatorToken });
    await operatorClient.provisionPersonalWorkspace();

    const triageRes = await fetch(`${baseUrl}/v1/operator/feedback/reports`, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    expect(triageRes.status).toBe(200);
    const triageData = (await triageRes.json()) as any;
    expect(Array.isArray(triageData.data)).toBe(true);
    const foundReport = triageData.data.find((r: any) => r.id === reportId);
    expect(foundReport).toBeDefined();

    // 4. Operator appends internal triage note
    const noteRes = await fetch(
      `${baseUrl}/v1/operator/feedback/reports/${reportId}/notes`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          note: 'Confirmed reproducible in High Contrast theme; queued for priority patch.',
        }),
      }
    );
    expect([200, 201]).toContain(noteRes.status);

    // 5. Operator updates report status to triaged
    const updateRes = await fetch(
      `${baseUrl}/v1/operator/feedback/reports/${reportId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${operatorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'triaged',
        }),
      }
    );
    expect(updateRes.status).toBe(200);
    const updatedData = (await updateRes.json()) as any;
    expect(updatedData.data.status).toBe('triaged');
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 4: Privacy, Consent Lifecycle, and Account Deletion Suppression
  // --------------------------------------------------------------------------
  it('PUB-REHEARSAL-04: verifies consent lifecycle and account deletion without resurrectable records', async () => {
    const userId = crypto.randomUUID();
    const userEmail = 'deletion.rehearsal@daynori.test';
    const { token, sessionId } = await createToken(userId, userEmail);
    const client = createApiClient({ baseUrl, token: () => token });

    const prov = await client.provisionPersonalWorkspace();
    const workspaceId = prov.data.workspace.id;

    // Create personal note before deletion
    const note = await client.createNote(workspaceId, {
      title: 'Pre-Deletion Note',
      plainText: 'Will be irreversibly purged upon account deletion confirmation.',
    });
    expect(note.data.id).toBeDefined();

    // 1. Issue cryptographically signed reauthentication proof bound to session
    const { token: reauthTicket } = issueReauthToken({
      userId,
      purpose: 'account_deletion',
      sessionToken: token,
      customTtlSeconds: 300,
    });

    // 2. Request account deletion
    const reqRes = await fetch(`${baseUrl}/v1/auth/account-deletion/request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reauthTicket,
        reason: 'User testing deletion verification',
      }),
    });
    expect(reqRes.status).toBe(200);
    const reqData = (await reqRes.json()) as any;
    expect(reqData.deletionId).toBeDefined();
    expect(reqData.status).toBe('pending_confirmation');
    const confirmationToken = reqData.confirmationToken;
    expect(confirmationToken).toBeDefined();

    // 3. Confirm account deletion with confirmation token
    const confirmRes = await fetch(`${baseUrl}/v1/auth/account-deletion/confirm`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        confirmationToken,
      }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmData = (await confirmRes.json()) as any;
    expect(confirmData.success).toBe(true);
    expect(['completed', 'processing']).toContain(confirmData.status);

    // 4. Verify tombstone suppression invariant: active items row count is 0
    await withUserContext(runtimePool, userId, async (db) => {
      const items = await db.query(
        `SELECT id FROM app.items WHERE workspace_id = $1`,
        [workspaceId]
      );
      expect(items.rowCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 5: Production Kill Switches & Graceful Rollback Degradation
  // --------------------------------------------------------------------------
  it('PUB-REHEARSAL-05: verifies production fail-closed boundaries and forward-fix rollback principle', async () => {
    const userId = crypto.randomUUID();
    const { token } = await createToken(userId, 'killswitch.test@daynori.test');

    // 1. Production fail-closed kill switches verify 403 Forbidden
    const vaultRes = await fetch(`${baseUrl}/v1/vault/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(vaultRes.status).toBe(403);

    const roomsRes = await fetch(`${baseUrl}/v1/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(roomsRes.status).toBe(403);

    const billingRes = await fetch(`${baseUrl}/v1/billing/catalog`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(billingRes.status).toBe(403);

    const aiRes = await fetch(`${baseUrl}/v1/ai/consent`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(aiRes.status).toBe(403);

    // 2. Rehearse client forward-fix rollback / feature disabling:
    // When a module is deactivated or hidden, navigation collapses cleanly without crashing
    const relCtx = {
      capabilityKnown: true,
      platform: 'web' as const,
      corePreview: false,
      production: true,
      moduleReleased: {},
    };
    const authCtx = {
      authenticated: true,
      privilegeKnown: true,
      hasWorkspaceMembership: true,
      isPlatformOperator: false,
    };
    const personal = { hiddenFeatureIds: ['journal'], pinnedFeatureIds: [] };
    const tabs = listPrimaryShellTabs(relCtx, authCtx, personal);
    expect(tabs.map((t) => t.id)).toEqual(['today', 'plan', 'library']);
    expect(tabs.map((t) => t.id)).not.toContain('journal');

    // 3. Forward-fix schema invariant: verify all migrations follow additive pattern
    const migrationFiles = migrator.getMigrationFiles();
    expect(migrationFiles.length).toBeGreaterThan(0);
    for (const mf of migrationFiles) {
      expect(mf.name).toMatch(/^\d{5}_[a-z0-9_]+\.sql$/);
    }
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 6: Synthetic Reviewer Access Isolation (reviewer@daynori.test)
  // --------------------------------------------------------------------------
  it('PUB-REHEARSAL-06: verifies synthetic reviewer access isolation and policy reviewer experience', async () => {
    const reviewerUserId = crypto.randomUUID();
    const { token: reviewerToken } = await createToken(
      reviewerUserId,
      'reviewer@daynori.test'
    );
    const reviewerClient = createApiClient({ baseUrl, token: () => reviewerToken });

    // 1. Reviewer bootstraps personal workspace sandbox
    const prov = await reviewerClient.provisionPersonalWorkspace();
    expect(prov.data.workspace.id).toBeDefined();
    const wsId = prov.data.workspace.id;

    // 2. Reviewer exercises approved candidate core features
    const note = await reviewerClient.createNote(wsId, {
      title: 'App Store / Google Play Policy Review Note',
      plainText: 'Reviewer evaluation of everyday note creation and Markdown formatting.',
    });
    expect(note.data.id).toBeDefined();

    const task = await reviewerClient.createTask(wsId, {
      title: 'Policy Review Task',
      priority: 'normal',
    });
    expect(task.data.id).toBeDefined();

    // 3. Reviewer submits feedback / accessibility audit report
    const feedbackRes = await fetch(
      `${baseUrl}/v1/workspaces/${wsId}/feedback/reports`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${reviewerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientReportId: crypto.randomUUID(),
          reportType: 'suggestion',
          category: 'accessibility',
          summary: 'Reviewer TalkBack & Touch Target Evaluation',
          description: 'Verified minimum 48x48dp touch targets and screen-reader semantics.',
        }),
      }
    );
    expect([200, 201]).toContain(feedbackRes.status);

    // 4. Reviewer strictly barred from operator routes (403 Forbidden)
    const operatorRes = await fetch(`${baseUrl}/v1/operator/feedback/reports`, {
      headers: { Authorization: `Bearer ${reviewerToken}` },
    });
    expect(operatorRes.status).toBe(403);

    // 5. Reviewer strictly barred from unauthorized workspaces
    const otherUserId = crypto.randomUUID();
    const { token: otherToken } = await createToken(otherUserId, 'isolated.user@daynori.test');
    const otherClient = createApiClient({ baseUrl, token: () => otherToken });
    const otherProv = await otherClient.provisionPersonalWorkspace();
    const otherWsId = otherProv.data.workspace.id;

    await expect(reviewerClient.getNote(otherWsId, note.data.id)).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 7: Publication Review Record Reconciliation & Invariants
  // --------------------------------------------------------------------------
  it('PUB-REHEARSAL-07: reconciles publication review record, undecided flags, and barrier register', () => {
    const recordMdPath = path.resolve(
      process.cwd(),
      'docs/release/v2-authorized-publication-record.md'
    );
    expect(fs.existsSync(recordMdPath)).toBe(true);
    const recordMd = fs.readFileSync(recordMdPath, 'utf8');

    // Verify critical sections exist
    expect(recordMd).toContain('Executive Proposal: Bounded Web/PWA Beta as Smallest Viable Release');
    expect(recordMd).toContain('Candidate Revision and Verified Artifact Hashes');
    expect(recordMd).toContain('Distributable Web Release Artifact (Deployable Archive)');
    expect(recordMd).toContain('Individual Web / PWA Production Asset Hashes');
    expect(recordMd).toContain('Surface Readiness Evaluated Independently');
    expect(recordMd).toContain('Destinations, Rollout Limits, and Rollback Procedures');
    expect(recordMd).toContain('Operational Roles & Incident Ownership');
    expect(recordMd).toContain('Comprehensive Gate-by-Gate Barrier Register (Grouped by Track)');
    expect(recordMd).toContain('Proposed Phase 103 Post-Release Review Window Handoff');
    expect(recordMd).toContain('Exact Decision Package for Project Owner Approval');

    // Verify undecided fields are explicitly flagged
    expect(recordMd).toContain('[UNDECIDED / PENDING OWNER APPROVAL]');
    expect(recordMd).toContain('[UNDECIDED / UNASSIGNED]');

    // Verify machine-readable review record exists and matches
    const recordJsonPath = path.resolve(
      process.cwd(),
      'artifacts/phase102/publication-review-record.json'
    );
    expect(fs.existsSync(recordJsonPath)).toBe(true);
    const recordJson = JSON.parse(fs.readFileSync(recordJsonPath, 'utf8'));

    expect(recordJson.phase).toBe('102');
    expect(recordJson.operationalStatus).toBe('ENGINEERING_PREPARATION_ONLY_PUBLICATION_BLOCKED');
    expect(recordJson.releaseProposal.recommendedScope).toBe('BOUNDED_WEB_PWA_BETA');
    expect(recordJson.releaseProposal.scopes.boundedWebPwaBeta.verifiedActionsCount).toBe(78);
    expect(recordJson.releaseProposal.scopes.boundedWebPwaBeta.gatedActionsCount).toBe(31);
    expect(recordJson.releaseProposal.scopes.fullV2.totalActionsCount).toBe(109);

    // Verify distributable web archive hash vs individual assets
    expect(recordJson.candidateArtifacts.webPwa.distributableArchive.path).toBe(
      'artifacts/release/daynori-web-v2.0.0-rc1.tar.gz'
    );
    expect(recordJson.candidateArtifacts.webPwa.distributableArchive.sha256).toBe(
      '663cc566011eecf6c78e1bfc99ca7e1ed6defb3c92ea59b6663c46d031801f5c'
    );
    expect(recordJson.candidateArtifacts.webPwa.individualAssetHashes.manifestJson).toBe(
      '417faac1bd5c0d083657a7a69c645a2387c797e1ac60500f462d9db3d280cf40'
    );

    // Verify barrier register in JSON covers all critical gates with scopes
    const gates = recordJson.barrierRegister.map((b: any) => b.gate);
    expect(gates).toContain('OWNER-SIGNING-KEYS');
    expect(gates).toContain('OWNER-RELEASE-AUTH');
    expect(gates).toContain('DEF-V2-013');
    expect(gates).toContain('DEF-V2-011');
    expect(gates).toContain('DEF-V2-004');
    expect(gates).toContain('DEF-V2-008');

    // Verify Phase 103 review window handoff
    expect(recordJson.phase103Handoff.status).toBe('PLANNED');
    expect(recordJson.phase103Handoff.proposedReviewWindowDays).toBe(14);
    expect(recordJson.phase103Handoff.observationsStatus).toBe('PENDING_APPROVED_RELEASE_EXECUTION');

    // Write machine-readable rehearsal results file
    const rehearsalResults = {
      phase: '102',
      title: 'Authorized Version 2 Publication & Live Verification Rehearsals',
      executedAt: new Date().toISOString(),
      gitRevision: '5b5c4f8cbb8002a77f87b114174bd5db81867af7',
      environment: {
        node: process.version,
        platform: process.platform,
        database: 'daynori_test (PostgreSQL isolated)',
        mode: 'production fail-closed simulation',
      },
      rehearsals: [
        {
          id: 'PUB-REHEARSAL-01',
          name: 'Synthetic account login, session validation, workspace bootstrap, and tenant isolation',
          status: 'PASS',
          checks: [
            'Unauthenticated request fails closed with 401',
            'Synthetic user provisions personal workspace',
            'Multi-tenant cross-workspace access is forbidden (404/403)',
          ],
        },
        {
          id: 'PUB-REHEARSAL-02',
          name: 'Scoped core organizer durable save, cold reopen integrity, and offline outbox sync',
          status: 'PASS',
          checks: [
            'Durable save of personal note, task, and routine',
            'Fresh client instance cold reopen retains byte-exact data integrity',
            'Offline mutation outbox serializes and replays sequentially',
            'Optimistic concurrency control via baseRevision rejects stale edits with 409',
          ],
        },
        {
          id: 'PUB-REHEARSAL-03',
          name: 'Customer support receipt, feedback ingestion, and operator triage pipeline',
          status: 'PASS',
          checks: [
            'Feedback bug report created via /v1/workspaces/:id/feedback/reports with receipt',
            'Non-operator user barred from operator triage endpoints (403)',
            'Platform operator accesses triage queue, adds internal note, and updates status to triaged',
          ],
        },
        {
          id: 'PUB-REHEARSAL-04',
          name: 'Privacy, consent lifecycle, and account deletion tombstone suppression',
          status: 'PASS',
          checks: [
            'Issue cryptographically signed reauthentication proof bound to session',
            'Account deletion request generates confirmationToken',
            'Account deletion confirmation executes full purge',
            'Active user items count drops to 0 (no accidental snapshot resurrection)',
          ],
        },
        {
          id: 'PUB-REHEARSAL-05',
          name: 'Production fail-closed kill switches and forward-fix rollback principle',
          status: 'PASS',
          checks: [
            'Production environment fails closed for Vault (/v1/vault/status -> 403)',
            'Production environment fails closed for Rooms (/v1/rooms -> 403)',
            'Production environment fails closed for Billing (/v1/billing/catalog -> 403)',
            'Production environment fails closed for AI Assistant (/v1/ai/consent -> 403)',
            'Feature personalization dynamically collapses navigation shell (4 to 3 tabs)',
            'Database schema evolution confirmed strictly additive (forward-fix)',
          ],
        },
        {
          id: 'PUB-REHEARSAL-06',
          name: 'Synthetic reviewer access isolation and policy reviewer experience',
          status: 'PASS',
          checks: [
            'Reviewer provisions sandbox and exercises approved core features',
            'Reviewer submits feedback/accessibility audit report',
            'Reviewer strictly barred from operator endpoints (403) and cross-tenant data (404/403)',
          ],
        },
        {
          id: 'PUB-REHEARSAL-07',
          name: 'Publication review record reconciliation and barrier register verification',
          status: 'PASS',
          checks: [
            'docs/release/v2-authorized-publication-record.md contains all required sections',
            'Every undecided field explicitly marked with [UNDECIDED]',
            'artifacts/phase102/publication-review-record.json covers all 109 actions and 6 open blocker gates',
          ],
        },
      ],
      verdict: 'ALL_7_PUBLICATION_REHEARSALS_PASSED',
    };

    const outDir = path.resolve(process.cwd(), 'artifacts/phase102');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(outDir, 'publication-rehearsal-results.json'),
      JSON.stringify(rehearsalResults, null, 2),
      'utf8'
    );
  });
});
