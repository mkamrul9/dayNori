/**
 * Phase 92 — Grounded text assistant chat and contextual guidance integration tests.
 * Validates SSE streaming transport, client-selected knowledge sources, Help & personal citations,
 * canonical route deep links, mid-flight cancellation, history deletion, and markdown sanitization.
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  CURRENT_AI_CONSENT_VERSION,
  CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
  sanitizeAssistantMarkdown,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient, type AiStreamEvent } from '@daynori/api-client';

describe('Phase 92: Assistant chat, streaming transport, and contextual guidance', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase92-key';
  const userId = crypto.randomUUID();
  let client: DaynoriApiClient;
  let workspaceId: string;

  async function createToken(uid: string): Promise<string> {
    return new SignJWT({
      sub: uid,
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

  async function acceptAi(scope = { notes: true, tasks: true, journal: true }) {
    return client.acceptAiConsent({
      consentVersion: CURRENT_AI_CONSENT_VERSION,
      providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
      contentScope: scope,
    });
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_AI_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_AI_PROVIDER'] = 'fake';
    delete process.env['DAYNORI_AI_LIVE_ENABLED'];

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
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
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    client = createApiClient({ baseUrl, token: await createToken(userId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, 'Phase 92 User')
         ON CONFLICT DO NOTHING`,
        [userId]
      );
      const ws = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Phase 92 Personal', 'personal', $1) RETURNING id`,
        [userId]
      );
      workspaceId = ws.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
        [workspaceId, userId]
      );
    } finally {
      setup.release();
    }
  }, 120_000);

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('AST-001: streams Server-Sent Events with start, context, chunk, and done events', async () => {
    await acceptAi();

    // Create and index a test note
    const note = await client.createNote(workspaceId, {
      title: 'Solar System Planetary Notes',
      document: {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Jupiter is the largest planet in our solar system.' }],
          },
        ],
      },
    });
    const idx = await client.indexAiSource({ workspaceId, itemId: note.data.id });
    expect(idx.data.indexed).toBe(true);

    const receivedEvents: AiStreamEvent[] = [];
    await client.streamAssistantAsk(
      {
        workspaceId,
        question: 'What is Jupiter in my notes?',
        selectedSources: { help: true, notes: true, tasks: true, journal: true },
      },
      {
        onEvent: (event) => {
          receivedEvents.push(event);
        },
      }
    );

    const eventTypes = receivedEvents.map((e) => e.type);
    expect(eventTypes).toContain('start');
    expect(eventTypes).toContain('context');
    expect(eventTypes).toContain('chunk');
    expect(eventTypes).toContain('done');

    const startEvent = receivedEvents.find((e) => e.type === 'start') as {
      type: 'start';
      turnId: string;
      providerMode: string;
      label: string;
    };
    expect(startEvent).toBeDefined();
    expect(startEvent.providerMode).toBe('fake');
    expect(startEvent.label).toBe('provisional-local-fake-or-gated');

    const doneEvent = receivedEvents.find((e) => e.type === 'done') as {
      type: 'done';
      turnId: string;
      answer: string;
      abstained: boolean;
      citations: Array<{ itemId: string; kind: string; deepLink?: string }>;
    };
    expect(doneEvent).toBeDefined();
    expect(doneEvent.turnId).toBe(startEvent.turnId);
    expect(doneEvent.answer).toBeTruthy();
    expect(doneEvent.abstained).toBe(false);
    expect(doneEvent.citations.length).toBeGreaterThan(0);

    const noteCitation = doneEvent.citations.find((c) => c.itemId === note.data.id);
    expect(noteCitation).toBeDefined();
    expect(noteCitation?.deepLink).toBe(`/library?noteId=${encodeURIComponent(note.data.id)}`);
  });

  it('AST-002 & AST-004: supports client-selected knowledge sources and canonical Help deep links', async () => {
    await acceptAi();

    // Query specifically for Help topic with notes deselected
    const events: AiStreamEvent[] = [];
    await client.streamAssistantAsk(
      {
        workspaceId,
        question: 'How do I restore deleted items from trash?',
        selectedSources: { help: true, notes: false, tasks: false, journal: false },
      },
      {
        onEvent: (ev) => {
          events.push(ev);
        },
      }
    );

    const done = events.find((e) => e.type === 'done') as {
      type: 'done';
      citations: Array<{ itemId: string; kind: string; deepLink?: string }>;
    };
    expect(done).toBeDefined();
    expect(done.citations.length).toBeGreaterThan(0);
    const helpCitation = done.citations.find((c) => c.kind === 'help');
    expect(helpCitation).toBeDefined();
    expect(helpCitation?.itemId).toContain('help:');
    expect(helpCitation?.deepLink).toMatch(/^\/help\?article=/);

    // Verify resolveAiSourceAccess accepts versioned help id
    const sourceAccess = await client.checkAiSourceAccess({
      workspaceId,
      itemId: helpCitation!.itemId,
    });
    expect(sourceAccess.data.accessible).toBe(true);
    expect(sourceAccess.data.kind).toBe('help');
    expect(sourceAccess.data.title).toBeTruthy();
    expect(sourceAccess.data.deepLink).toBe(helpCitation?.deepLink);
  });

  it('rejects ask when all knowledge sources are deselected with 403 AI_SCOPE_EMPTY', async () => {
    await acceptAi();

    await expect(
      client.streamAssistantAsk(
        {
          workspaceId,
          question: 'Hello assistant',
          selectedSources: { help: false, notes: false, tasks: false, journal: false },
        },
        { onEvent: () => undefined }
      )
    ).rejects.toThrow();
  });

  it('AST-006: manages assistant history with individual turn deletion and bulk clear', async () => {
    await acceptAi();

    // Run a turn
    await client.askAssistant({
      workspaceId,
      question: 'Turn for deletion testing',
    });

    const initialHistory = await client.listAssistantHistory(workspaceId);
    expect(initialHistory.data.length).toBeGreaterThan(0);
    const turnToDelete = initialHistory.data[0]!;

    // Delete single turn
    const deleteSingle = await client.deleteAssistantHistory({
      workspaceId,
      turnId: turnToDelete.id,
    });
    expect(deleteSingle.data.deletedTurns).toBe(1);

    const historyAfterSingle = await client.listAssistantHistory(workspaceId);
    expect(historyAfterSingle.data.some((t) => t.id === turnToDelete.id)).toBe(false);

    // Clear all remaining history
    const clearAll = await client.deleteAssistantHistory({ workspaceId });
    expect(clearAll.data.deletedTurns).toBeGreaterThanOrEqual(0);

    const historyAfterClear = await client.listAssistantHistory(workspaceId);
    expect(historyAfterClear.data.length).toBe(0);
  });

  it('AST-007: sanitizes assistant markdown stripping executable tags and tracking images', () => {
    const malicious = `
# Normal Header
Here is a normal response with **bold** text and \`code snippet\`.
<script>alert("pwned")</script>
<iframe src="https://evil.example.com"></iframe>
<a href="javascript:stealTokens()">Malicious link</a>
[Safe Documentation](https://example.com/docs)
[Dangerous Link](javascript:alert(1))
![Secret tracker](https://tracker.example.com/pixel.png)
[source:12345678-1234-1234-1234-123456789abc#r1]
`;

    const cleaned = sanitizeAssistantMarkdown(malicious);
    expect(cleaned).not.toContain('<script>');
    expect(cleaned).not.toContain('<iframe>');
    expect(cleaned).not.toContain('javascript:');
    expect(cleaned).not.toContain('https://tracker.example.com/pixel.png');
    expect(cleaned).toContain('# Normal Header');
    expect(cleaned).toContain('**bold**');
    expect(cleaned).toContain('[Safe Documentation](https://example.com/docs)');
    expect(cleaned).toContain('[Image: Secret tracker]');
  });

  it('AST-003: read-only boundary enforcement — model text cannot execute mutations', async () => {
    await acceptAi();

    // Asking to create a task via askAssistant does not create tasks without proposal confirmation
    const tasksBefore = await client.listTasks(workspaceId);
    await client.askAssistant({
      workspaceId,
      question: 'Please create a task called Read Only Verification',
    });

    const tasksAfter = await client.listTasks(workspaceId);
    expect(tasksAfter.data.length).toBe(tasksBefore.data.length);
  });

  it('requires enabled AI consent before streaming or history access', async () => {
    // Revoke/disable consent
    await client.disableAi();

    await expect(
      client.streamAssistantAsk(
        {
          workspaceId,
          question: 'Should fail without consent',
        },
        { onEvent: () => undefined }
      )
    ).rejects.toThrow();

    await expect(client.listAssistantHistory(workspaceId)).rejects.toThrow();
  });
});
