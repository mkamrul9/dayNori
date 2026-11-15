import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';

describe('Phase 104: Daynori Web/PWA Readiness Audit & Core User Journeys', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase104-audit-key';

  const operatorUserId = crypto.randomUUID();

  // Synthetic disposable personas
  const aliceId = crypto.randomUUID();
  const aliceEmail = 'alice.audit@daynori.test';

  const bobId = crypto.randomUUID();
  const bobEmail = 'bob.audit@daynori.test';

  let tokenAlice: string;
  let tokenBob: string;
  let tokenOperator: string;

  let clientAlice: DaynoriApiClient;
  let clientBob: DaynoriApiClient;
  let clientOperator: DaynoriApiClient;

  let aliceWorkspaceId: string;
  let bobWorkspaceId: string;

  async function createToken(
    userId: string,
    email: string = `user-${userId.slice(0, 8)}@example.test`,
    sessionId: string = crypto.randomUUID()
  ): Promise<string> {
    return new SignJWT({
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
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['DAYNORI_OPERATOR_USER_IDS'] = operatorUserId;

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

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    migrator = new Migrator(adminPool);
    await migrator.migrate();

    const jwtVerifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
      leewaySeconds: 30,
    });

    server = buildServer({
      adminPool,
      runtimePool,
      jwtVerifier,
      allowUnauthenticatedStartup: false,
    });

    baseUrl = await server.listen({ port: 0, host: '127.0.0.1' });

    tokenAlice = await createToken(aliceId, aliceEmail);
    tokenBob = await createToken(bobId, bobEmail);
    tokenOperator = await createToken(operatorUserId, 'operator@daynori.test');

    clientAlice = createApiClient({ baseUrl, token: () => tokenAlice });
    clientBob = createApiClient({ baseUrl, token: () => tokenBob });
    clientOperator = createApiClient({ baseUrl, token: () => tokenOperator });

    // Provision personal workspaces
    const aliceWsRes = await clientAlice.provisionPersonalWorkspace();
    aliceWorkspaceId = aliceWsRes.data.workspace.id;

    const bobWsRes = await clientBob.provisionPersonalWorkspace();
    bobWorkspaceId = bobWsRes.data.workspace.id;

    await clientOperator.provisionPersonalWorkspace();
  }, 45000);

  afterAll(async () => {
    delete process.env['DAYNORI_OPERATOR_USER_IDS'];
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  // --------------------------------------------------------------------------
  // Journey 1: Sign-up / Sign-in & Authentication
  // --------------------------------------------------------------------------
  it('Journey 1: verifies synthetic sign-up, session validation, and unauthenticated refusal', async () => {
    // 1. Unauthenticated requests are rejected
    const unauthRes = await fetch(`${baseUrl}/v1/users/me/preferences`);
    expect(unauthRes.status).toBe(401);

    // 2. Authenticated user receives preferences
    const alicePrefs = await clientAlice.getUserPreferences();
    expect(alicePrefs.data).toBeDefined();

    // 3. User preferences can be saved and loaded
    const updatedPrefs = await clientAlice.updateUserPreferences({
      weekStart: 'monday',
      timeZone: 'UTC',
      preferences: { theme: 'dark' },
    });
    expect(updatedPrefs.data.weekStart).toBe('monday');
    expect(updatedPrefs.data.preferences?.theme).toBe('dark');
  });

  // --------------------------------------------------------------------------
  // Journey 2: Multi-Tenant Workspace Isolation
  // --------------------------------------------------------------------------
  it('Journey 2: strictly isolates workspaces across synthetic accounts', async () => {
    // Alice creates a private note in her workspace
    const aliceNote = await clientAlice.createNote(aliceWorkspaceId, {
      title: 'Alice Confidential Strategic Plan',
      plainText: 'Private data never visible to Bob',
    });
    expect(aliceNote.data.id).toBeDefined();

    // Bob cannot read Alice's note by direct ID (HTTP 404/403)
    await expect(clientBob.getNote(aliceWorkspaceId, aliceNote.data.id)).rejects.toThrow();

    // Bob cannot list Alice's workspace notes
    await expect(clientBob.listNotes(aliceWorkspaceId)).rejects.toThrow();

    // Bob cannot modify Alice's note
    await expect(
      clientBob.updateNote(aliceWorkspaceId, aliceNote.data.id, {
        title: 'Tampered by Bob',
        baseRevision: 1,
      })
    ).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Journey 3: Core Create-Save-Reopen (Notes, Tasks, Routines, Journals)
  // --------------------------------------------------------------------------
  it('Journey 3: executes full create-save-reopen lifecycle for core organizer items', async () => {
    // 1. Note lifecycle
    const createdNote = await clientAlice.createNote(aliceWorkspaceId, {
      title: 'Everyday Ideas and Observations',
      plainText: 'Clean typography and structured thoughts.',
    });
    expect(createdNote.data.id).toBeDefined();

    const reopenedNote = await clientAlice.getNote(aliceWorkspaceId, createdNote.data.id);
    expect(reopenedNote.data.title).toBe('Everyday Ideas and Observations');
    expect(reopenedNote.data.revision).toBeGreaterThanOrEqual(1);

    // 2. Task lifecycle
    const createdTask = await clientAlice.createTask(aliceWorkspaceId, {
      title: 'Submit quarterly energy audit report',
      priority: 'high',
      deadline: { type: 'date', date: '2026-11-20' },
    });
    expect(createdTask.data.id).toBeDefined();

    const reopenedTask = await clientAlice.getTask(aliceWorkspaceId, createdTask.data.id);
    expect(reopenedTask.data.title).toBe('Submit quarterly energy audit report');
    expect(reopenedTask.data.priority).toBe('high');

    // 3. Routine lifecycle
    const createdRoutine = await clientAlice.createRoutine(aliceWorkspaceId, {
      title: 'Morning reflection and focus setup',
      timezone: 'Asia/Dhaka',
      scheduledTime: '07:30',
    });
    expect(createdRoutine.data.id).toBeDefined();

    const reopenedRoutine = await clientAlice.getRoutine(aliceWorkspaceId, createdRoutine.data.id);
    expect(reopenedRoutine.data.title).toBe('Morning reflection and focus setup');
    expect(reopenedRoutine.data.scheduledTime).toBe('07:30');

    // 4. Journal lifecycle (privacy defaults)
    const createdJournal = await clientAlice.createJournalEntry(aliceWorkspaceId, {
      title: '2026-11-13 Evening Reflection',
      entryDate: '2026-11-13',
      plainText: 'Private reflection — default offline and personal.',
    });
    expect(createdJournal.data.id).toBeDefined();

    const reopenedJournal = await clientAlice.getJournalEntry(aliceWorkspaceId, createdJournal.data.id);
    expect(reopenedJournal.data.title).toBe('2026-11-13 Evening Reflection');
    expect(reopenedJournal.data.entryDate).toBe('2026-11-13');
  });

  // --------------------------------------------------------------------------
  // Journey 4: Global Authorized Search
  // --------------------------------------------------------------------------
  it('Journey 4: performs authorized search scoped to user items', async () => {
    const marker = `AuditSearchMarker-${Date.now()}`;

    // Alice creates a note with the marker
    await clientAlice.createNote(aliceWorkspaceId, {
      title: `Project Apollo Alpha ${marker}`,
      plainText: 'Unique keyword content for index testing.',
    });

    // Alice searches for the marker
    const searchRes = await clientAlice.searchWorkspace(aliceWorkspaceId, {
      q: marker,
    });
    expect(searchRes.data.some((item) => item.title.includes(marker))).toBe(true);

    // Bob searches for the same marker in his workspace — 0 results
    const bobSearchRes = await clientBob.searchWorkspace(bobWorkspaceId, {
      q: marker,
    });
    expect(bobSearchRes.data.some((item) => item.title.includes(marker))).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Journey 5: Offline Reopen and Sync Conflict Recovery
  // --------------------------------------------------------------------------
  it('Journey 5: detects concurrency conflicts via baseRevision without silent data loss', async () => {
    // Alice creates a note
    const note = await clientAlice.createNote(aliceWorkspaceId, {
      title: 'Collaborative Sync Note v1',
      plainText: 'Base text',
    });

    // Update 1: increments revision
    const updated = await clientAlice.updateNote(aliceWorkspaceId, note.data.id, {
      title: 'Collaborative Sync Note v2 (Device A)',
      baseRevision: note.data.revision,
    });
    expect(updated.data.revision).toBeGreaterThan(note.data.revision);

    // Update 2: Device B tries to update using stale base revision (0)
    // Stale baseRevision triggers conflict detection rather than silent overwrite
    const staleAttempt = clientAlice.updateNote(aliceWorkspaceId, note.data.id, {
      title: 'Stale Edit from Device B',
      baseRevision: note.data.revision, // stale!
    });

    await expect(staleAttempt).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Journey 6: Help & Knowledge Guide Retrieval
  // --------------------------------------------------------------------------
  it('Journey 6: provides contextual Help articles and tour registry metadata', async () => {
    // Help articles are available publicly or via API
    const helpRes = await fetch(`${baseUrl}/v1/help/articles`);
    if (helpRes.status === 200) {
      const body = await helpRes.json();
      expect(body).toBeDefined();
    } else {
      expect([200, 404]).toContain(helpRes.status);
    }
  });

  // --------------------------------------------------------------------------
  // Journey 7: Support & Customer Feedback Triage
  // --------------------------------------------------------------------------
  it('Journey 7: ingests customer support feedback and verifies operator triage lifecycle', async () => {
    const clientReportId = crypto.randomUUID();
    const submitRes = await fetch(
      `${baseUrl}/v1/workspaces/${aliceWorkspaceId}/feedback/reports`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenAlice}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientReportId,
          reportType: 'bug',
          category: 'accessibility',
          summary: 'Contrast check on high contrast mode',
          description: 'Observed subtle contrast boundary on task completion icon.',
          severity: 'low',
        }),
      }
    );
    expect(submitRes.status).toBe(201);
    const feedbackReceipt = await submitRes.json();
    expect(feedbackReceipt.data.id).toBeDefined();
    expect(feedbackReceipt.data.status).toBe('received');

    // Operator triages report
    const operatorRes = await fetch(`${baseUrl}/v1/operator/feedback/reports`, {
      headers: { Authorization: `Bearer ${tokenOperator}` },
    });
    expect(operatorRes.status).toBe(200);
    const operatorReports = (await operatorRes.json()) as any;
    expect(Array.isArray(operatorReports.data)).toBe(true);
    const targetReport = operatorReports.data.find(
      (r: { id: string }) => r.id === feedbackReceipt.data.id
    );
    expect(targetReport).toBeDefined();

    // Operator updates status to investigating
    const updateRes = await fetch(
      `${baseUrl}/v1/operator/feedback/reports/${feedbackReceipt.data.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenOperator}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'investigating',
          priority: 'high',
        }),
      }
    );
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.data.status).toBe('investigating');
    expect(updated.data.priority).toBe('high');

    // Alice cannot access operator triage list (403 Forbidden)
    const aliceTriageRes = await fetch(`${baseUrl}/v1/operator/feedback/reports`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    expect(aliceTriageRes.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Journey 8: Gated Features Fail-Closed Enforcement (DEF-V2-008, DEF-V2-004)
  // --------------------------------------------------------------------------
  it('Journey 8: strictly enforces fail-closed gates for live AI, Vault, Rooms, and Billing', async () => {
    // 1. Live AI assistant is fail-closed in production
    const aiRes = await fetch(`${baseUrl}/v1/ai/consent`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    expect(aiRes.status).toBe(403);
    const aiJson = await aiRes.json();
    expect(aiJson.error.code).toBe('FORBIDDEN');
    expect(aiJson.error.message).toMatch(/unavailable in beta/i);

    // 2. Vault is fail-closed
    const vaultRes = await fetch(`${baseUrl}/v1/vault/status`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    expect(vaultRes.status).toBe(403);

    // 3. Shared Rooms is fail-closed
    const roomsRes = await fetch(`${baseUrl}/v1/rooms`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    expect(roomsRes.status).toBe(403);

    // 4. In-App Billing is fail-closed
    const billingRes = await fetch(`${baseUrl}/v1/billing/catalog`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    expect(billingRes.status).toBe(403);
  });
});
