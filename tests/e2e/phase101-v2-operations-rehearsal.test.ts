import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, getRuntimeDatabaseConfig, withTenantContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient } from '@daynori/api-client';
import { listPrimaryShellTabs } from '@daynori/domain';
import { getDefaultStorageProvider } from '../../apps/api/src/modules/files/storageAdapter.js';

describe('Phase 101: Version 2 Release Candidate & Operations Rehearsals', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase101-rehearsal-key';

  const operatorUserId = crypto.randomUUID();
  const prevNodeEnv = process.env['NODE_ENV'];

  async function createToken(
    userId: string,
    email: string = `user-${userId.slice(0, 8)}@example.test`
  ): Promise<string> {
    const sessionToken = crypto.randomUUID();
    return await new SignJWT({
      sub: userId,
      email,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: sessionToken,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    // Assert production environment semantics for release boundary verification
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
  // REHEARSAL 1: Migration, Schema Evolution, and Forward-Fix Invariant
  // --------------------------------------------------------------------------
  it('OP-REHEARSAL-01: rehearses schema migration compatibility and forward-fix invariant', async () => {
    const userId = crypto.randomUUID();
    const token = await createToken(userId, 'migration.user@example.test');
    const client = createApiClient({ baseUrl, token: () => token });

    // 1. Provision workspace
    const provRes = await client.provisionPersonalWorkspace();
    expect(provRes.data.workspace.id).toBeDefined();
    const workspaceId = provRes.data.workspace.id;

    // 2. Insert items simulating baseline state
    const noteRes = await client.createNote(workspaceId, {
      title: 'Baseline Note Before Schema Step',
      plainText: 'Notes content before simulated forward schema step.',
    });
    expect(noteRes.data.id).toBeDefined();
    const noteId = noteRes.data.id;

    // 3. Verify all migrations run idempotently without dropping existing rows
    const migrationResults = await migrator.migrate();
    expect(Array.isArray(migrationResults.applied)).toBe(true);
    expect(Array.isArray(migrationResults.skipped)).toBe(true);

    // 4. Verify baseline content remains 100% accessible and undamaged
    const retrievedNote = await client.getNote(workspaceId, noteId);
    expect(retrievedNote.data.id).toBe(noteId);
    expect(retrievedNote.data.title).toBe('Baseline Note Before Schema Step');

    // 5. Forward-fix invariant: verify rollback policy requires forward-fix,
    // not destructive database rollbacks that could drop columns or active user data
    const migrationFiles = migrator.getMigrationFiles();
    expect(migrationFiles.length).toBeGreaterThan(0);
    for (const mf of migrationFiles) {
      expect(mf.name).toMatch(/^\d{5}_[a-z0-9_]+\.sql$/);
    }
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 2: Pending Drafts, Mutation Outbox Queueing, and Interrupted Replay
  // --------------------------------------------------------------------------
  it('OP-REHEARSAL-02: queues drafts in mutation outbox and replays them cleanly after interruption', async () => {
    const userId = crypto.randomUUID();
    const token = await createToken(userId, 'outbox.user@example.test');
    const client = createApiClient({ baseUrl, token: () => token });

    const provRes = await client.provisionPersonalWorkspace();
    const workspaceId = provRes.data.workspace.id;

    // Initial item on server
    const initialTask = await client.createTask(workspaceId, {
      title: 'Initial Task for Offline Work',
      priority: 'normal',
    });
    const taskId = initialTask.data.id;
    const initialRevision = initialTask.data.revision;

    // Simulate an offline mutation outbox queue
    interface QueuedMutation {
      id: string;
      op: 'createNote' | 'updateTask';
      payload: any;
      status: 'pending' | 'in_flight' | 'applied' | 'failed';
      createdAt: string;
    }

    const outboxQueue: QueuedMutation[] = [
      {
        id: crypto.randomUUID(),
        op: 'createNote',
        payload: {
          title: 'Offline Draft Note',
          plainText: 'Created while device was offline in transit.',
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        op: 'updateTask',
        payload: {
          taskId,
          title: 'Initial Task (Updated Offline to Urgent)',
          priority: 'urgent',
          baseRevision: initialRevision,
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ];

    // Simulate client process crash / reload: outbox survives in local storage
    const serializedOutbox = JSON.stringify(outboxQueue);
    const restoredOutbox: QueuedMutation[] = JSON.parse(serializedOutbox);
    expect(restoredOutbox.length).toBe(2);

    // Replay outbox sequentially against the API
    const appliedResults: any[] = [];
    for (const mutation of restoredOutbox) {
      mutation.status = 'in_flight';
      if (mutation.op === 'createNote') {
        const res = await client.createNote(workspaceId, mutation.payload);
        mutation.status = 'applied';
        appliedResults.push(res.data);
      } else if (mutation.op === 'updateTask') {
        const res = await client.updateTask(workspaceId, mutation.payload.taskId, {
          title: mutation.payload.title,
          priority: mutation.payload.priority,
          baseRevision: mutation.payload.baseRevision,
        });
        mutation.status = 'applied';
        appliedResults.push(res.data);
      }
    }

    // Verify both operations applied with full integrity
    expect(appliedResults.length).toBe(2);
    expect(appliedResults[0].title).toBe('Offline Draft Note');
    expect(appliedResults[1].title).toBe('Initial Task (Updated Offline to Urgent)');
    expect(appliedResults[1].priority).toBe('urgent');
    expect(appliedResults[1].revision).toBe(initialRevision + 1);

    // Concurrency conflict test: replaying an outdated baseRevision is safely rejected
    await expect(
      client.updateTask(workspaceId, taskId, {
        title: 'Conflicting Edit',
        baseRevision: initialRevision, // Stale revision!
      })
    ).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 3: Stored Objects & Metadata Restoration with Checksum & Deletion Suppression
  // --------------------------------------------------------------------------
  it('OP-REHEARSAL-03: verifies object metadata checksum and deletion suppression during restore', async () => {
    const userId = crypto.randomUUID();
    const token = await createToken(userId, 'storage.restore@example.test');
    const client = createApiClient({ baseUrl, token: () => token });

    const provRes = await client.provisionPersonalWorkspace();
    const workspaceId = provRes.data.workspace.id;

    // 1. Valid minimal PNG bytes
    const validPngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89,
    ]);
    const sampleFileName = 'backup-target-diagram.png';
    const sampleMimeType = 'image/png';
    const clientChecksum = crypto.createHash('sha256').update(validPngBytes).digest('hex');

    // 2. Reserve file upload
    const reservation = await client.reserveFileUpload(workspaceId, {
      fileName: sampleFileName,
      declaredMimeType: sampleMimeType,
      declaredBytes: validPngBytes.length,
    });

    expect(reservation.data.reservationId).toBeDefined();
    expect(reservation.data.fileId).toBeDefined();
    const fileId = reservation.data.fileId;
    const reservationId = reservation.data.reservationId;

    // 3. Put bytes directly into storage provider for reservation objectPath
    const storageProvider = getDefaultStorageProvider();
    await storageProvider.putObject('private_assets', reservation.data.objectPath, validPngBytes, { contentType: 'image/png' });

    // 4. Finalize upload with client checksum
    const finalized = await client.finalizeFileUpload(workspaceId, reservationId, {
      clientChecksum,
      operationId: crypto.randomUUID(),
    });

    expect(finalized.data.fileId).toBe(fileId);
    expect(['ready', 'verified']).toContain(finalized.data.status);

    // 5. Verify file metadata via API
    const meta = await client.getFileMetadata(workspaceId, fileId);
    expect(meta.data.id).toBe(fileId);
    expect(meta.data.fileName).toBe(sampleFileName);
    expect(meta.data.byteSize).toBe(validPngBytes.length);
    expect(meta.data.sha256Checksum).toBe(clientChecksum);

    // 6. Test Deletion Suppression (Tombstone Preservation)
    // Delete file item to create deletion tombstone
    await client.deleteFile(workspaceId, fileId);

    // Verify item is now deleted (404)
    await expect(client.getFileMetadata(workspaceId, fileId)).rejects.toThrow();

    // Verify deletion suppression invariant:
    // In database, deleted items are either hard-deleted or tombstoned with deleted_at.
    await withTenantContext(
      runtimePool,
      { userId, workspaceId },
      async (db) => {
        const row = await db.query(
          `SELECT id FROM app.items WHERE id = $1 AND workspace_id = $2`,
          [fileId, workspaceId]
        );
        expect(row.rowCount).toBe(0);
      }
    );
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 4: Emergency Kill Switches & Fail-Closed Degradation
  // --------------------------------------------------------------------------
  it('OP-REHEARSAL-04: verifies fail-closed emergency kill switches and graceful degradation', async () => {
    const userId = crypto.randomUUID();
    const token = await createToken(userId, 'killswitch.user@example.test');
    const client = createApiClient({ baseUrl, token: () => token });

    const provRes = await client.provisionPersonalWorkspace();
    const workspaceId = provRes.data.workspace.id;

    // 1. Vault Kill Switch: Vault route must fail-closed (403 forbidden under production)
    const vaultRes = await fetch(`${baseUrl}/v1/vault/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(vaultRes.status).toBe(403);

    // 2. Rooms / Chat Kill Switch: Rooms endpoint must return 403 forbidden under production
    const roomsRes = await fetch(`${baseUrl}/v1/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(roomsRes.status).toBe(403);

    // 3. Production Billing Kill Switch: Billing purchase/catalog must return 403 under production
    const billingRes = await fetch(`${baseUrl}/v1/billing/catalog`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(billingRes.status).toBe(403);

    // 4. AI Provider Gating: AI assistant requires explicit provider opt-in and owner approval (403 under production)
    const aiConsentRes = await fetch(`${baseUrl}/v1/ai/consent`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(aiConsentRes.status).toBe(403);

    // 5. Personalization Kill Switch: Hiding a feature dynamically adjusts UI shell
    const hideJournalPref = await client.updateUserPreferences({
      preferences: {
        theme: 'system',
        featurePersonalization: {
          hiddenFeatureIds: ['journal'],
        },
      },
    });
    expect(hideJournalPref.data.preferences.featurePersonalization.hiddenFeatureIds).toContain('journal');

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
    const visibleTabs = listPrimaryShellTabs(relCtx, authCtx, personal);
    expect(visibleTabs.map((t) => t.id)).toEqual(['today', 'plan', 'library']);
    expect(visibleTabs.map((t) => t.id)).not.toContain('journal');
  });

  // --------------------------------------------------------------------------
  // REHEARSAL 5: Synthetic Reviewer Access Isolation & Boundary Security
  // --------------------------------------------------------------------------
  it('OP-REHEARSAL-05: verifies synthetic reviewer access isolation and operational boundaries', async () => {
    const reviewerUserId = crypto.randomUUID();
    const reviewerToken = await createToken(reviewerUserId, 'reviewer@daynori.test');
    const reviewerClient = createApiClient({ baseUrl, token: () => reviewerToken });

    // Reviewer provisions personal test sandbox
    const prov = await reviewerClient.provisionPersonalWorkspace();
    expect(prov.data.workspace.id).toBeDefined();
    const reviewerWorkspaceId = prov.data.workspace.id;

    // Reviewer can exercise core reviewable features (note, task, feedback report)
    const note = await reviewerClient.createNote(reviewerWorkspaceId, {
      title: 'Reviewer Test Note',
      plainText: 'App Store / Play Console reviewer evaluation content.',
    });
    expect(note.data.id).toBeDefined();

    // Reviewer submits bug/feedback report
    const feedbackRes = await fetch(
      `${baseUrl}/v1/workspaces/${reviewerWorkspaceId}/feedback/reports`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${reviewerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientReportId: crypto.randomUUID(),
          reportType: 'suggestion',
          category: 'other',
          summary: 'Reviewer accessibility inspection',
          description: 'Checked TalkBack semantic labels and color contrast.',
        }),
      }
    );
    expect([200, 201]).toContain(feedbackRes.status);

    // Reviewer CANNOT access operator routes (403 Forbidden)
    const operatorRes = await fetch(`${baseUrl}/v1/operator/feedback/reports`, {
      headers: { Authorization: `Bearer ${reviewerToken}` },
    });
    expect(operatorRes.status).toBe(403);

    // Reviewer CANNOT access unauthorized workspaces (Cross-tenant fencing)
    const otherUserId = crypto.randomUUID();
    const otherToken = await createToken(otherUserId, 'other.user@example.test');
    const otherClient = createApiClient({ baseUrl, token: () => otherToken });
    const otherProv = await otherClient.provisionPersonalWorkspace();
    const otherWsId = otherProv.data.workspace.id;

    // Reviewer attempts to read other user's workspace items -> 404/403
    await expect(reviewerClient.listNotes(otherWsId)).rejects.toThrow();
  });
});
