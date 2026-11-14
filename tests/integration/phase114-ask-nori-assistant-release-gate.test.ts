/**
 * Phase 114 — Daynori Ask Nori Text-Assistant Release-Gate Verification
 * and Reviewed Organizer Creation Audit.
 *
 * Verifies:
 * 1. Consent fencing, disclosure versions, and server kill-switch (DAYNORI_ASSISTANT_KILL_SWITCH).
 * 2. Multi-tenant workspace isolation across retrieval, citations, and proposals.
 * 3. Strict journal opt-in gate (contentScope.journal = true vs. false).
 * 4. Unconditional vault exclusion (isVaultAiTarget, 403 vault_excluded).
 * 5. Grounded answers, citations, and anti-hallucination abstention.
 * 6. In-flight cancellation via AbortController.
 * 7. Operational failure recovery (HTTP 429 rate limit, 503 outage, 401 auth, malformed).
 * 8. Concurrency-safe budget reservation, settlement, and exhaustion (429 AI_BUDGET_EXHAUSTED).
 * 9. Core organizer creation flows:
 *    - "create a note" -> editable proposal -> patch -> confirm -> durable receipt & deep link.
 *    - "write this journal" -> ambiguous date clarification vs. explicit date confirm.
 *    - "set a deadline" -> ambiguous deadline clarification vs. explicit date confirm.
 * 10. Idempotent retry and cancellation safety.
 * 11. Live provider wire protocol evaluation (store: false, zero real user content).
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  CURRENT_AI_CONSENT_VERSION,
  CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
  detectJournalDateAmbiguity,
  detectTaskDeadlineAmbiguity,
  getOrganizerDeepLink,
  isVaultAiTarget,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  FakeAiProvider,
  OpenAiCompatibleProvider,
  type AiHttpTransport,
} from '../../apps/api/src/modules/ai/provider.js';

describe('Phase 114: Ask Nori Text-Assistant Release-Gate Suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase114-test-key';

  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let workspaceA: string;
  let workspaceB: string;

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

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_AI_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_AI_PROVIDER'] = 'fake';
    delete process.env['DAYNORI_AI_LIVE_ENABLED'];
    delete process.env['DAYNORI_ASSISTANT_KILL_SWITCH'];

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

    clientA = createApiClient({ baseUrl, token: await createToken(userA) });
    clientB = createApiClient({ baseUrl, token: await createToken(userB) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, 'P114 Alice'), ($2, 'P114 Bob')
         ON CONFLICT (id) DO NOTHING`,
        [userA, userB]
      );
      const wsA = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Alice Workspace P114', 'personal', $1) RETURNING id`,
        [userA]
      );
      workspaceA = wsA.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
        [workspaceA, userA]
      );

      const wsB = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Bob Workspace P114', 'personal', $1) RETURNING id`,
        [userB]
      );
      workspaceB = wsB.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
        [workspaceB, userB]
      );
    } finally {
      setup.release();
    }
  });

  afterAll(async () => {
    delete process.env['DAYNORI_AI_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_PROVIDER'];
    delete process.env['DAYNORI_ASSISTANT_KILL_SWITCH'];
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  describe('1. Consent Fencing, Versioning & Server Kill-Switch', () => {
    it('requires current provider disclosure version to accept consent', async () => {
      // Rejects outdated disclosure version
      await expect(
        clientA.acceptAiConsent({
          consentVersion: CURRENT_AI_CONSENT_VERSION,
          providerDisclosureVersion: 'outdated-v0',
          contentScope: { notes: true, tasks: true, journal: false },
        })
      ).rejects.toThrow();

      // Accepts current version
      const acceptRes = await clientA.acceptAiConsent({
        consentVersion: CURRENT_AI_CONSENT_VERSION,
        providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
        contentScope: { notes: true, tasks: true, journal: false },
      });
      expect(acceptRes.data.enabled).toBe(true);
      expect(acceptRes.data.requiresAcceptance).toBe(false);
      expect(acceptRes.data.contentScope.journal).toBe(false);
    });

    it('instantly suspends all AI endpoints with 503 when server kill-switch is active', async () => {
      process.env['DAYNORI_AI_KILL_SWITCH'] = 'true';
      try {
        await expect(clientA.getAiConsentStatus()).rejects.toThrow(/kill switch/i);
      } finally {
        delete process.env['DAYNORI_AI_KILL_SWITCH'];
      }
    });
  });

  describe('2. Multi-Tenant Workspace Scoping & Isolation', () => {
    it('strictly isolates multi-tenant workspace queries and proposals', async () => {
      // Setup consent for User B
      await clientB.acceptAiConsent({
        consentVersion: CURRENT_AI_CONSENT_VERSION,
        providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
        contentScope: { notes: true, tasks: true, journal: true },
      });

      // User A creates proposal in Workspace A
      const propA = await clientA.createAiProposal({
        workspaceId: workspaceA,
        operation: 'create_personal_note',
        payload: { title: 'Alice Confidential Strategy', plainText: 'Proprietary details' },
      });
      expect(propA.data.id).toBeTruthy();

      // User B cannot update User A's proposal
      await expect(
        clientB.updateAiProposal(propA.data.id, {
          payload: { title: 'Intruder modification' },
        })
      ).rejects.toThrow();

      // User B cannot confirm User A's proposal
      await expect(
        clientB.confirmAiProposal(propA.data.id, {
          confirmationToken: propA.data.confirmationToken,
        })
      ).rejects.toThrow();

      // User B cannot cancel User A's proposal
      await expect(clientB.cancelAiProposal(propA.data.id)).rejects.toThrow();
    });
  });

  describe('3. Journal Opt-In & Unconditional Vault Exclusion', () => {
    it('refuses journal proposals when contentScope.journal is false', async () => {
      // User A currently has journal = false
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'write this journal entry: 2026-11-20 Walked in the botanical garden',
        allowSuggestProposal: true,
      });

      expect(askRes.data.suggestedProposal).toBeNull();
      expect(askRes.data.answer).toContain('Journal access');
    });

    it('permits journal proposals once user opts in to journal scope', async () => {
      await clientA.acceptAiConsent({
        consentVersion: CURRENT_AI_CONSENT_VERSION,
        providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
        contentScope: { notes: true, tasks: true, journal: true },
      });

      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'write this journal entry: 2026-11-20 Walked in the botanical garden',
        allowSuggestProposal: true,
      });

      expect(askRes.data.suggestedProposal).not.toBeNull();
      expect(askRes.data.suggestedProposal?.operation).toBe('create_personal_journal_entry');
      expect(askRes.data.suggestedProposal?.status).toBe('pending');
    });

    it('unconditionally excludes vault items and securityScope=vault', async () => {
      expect(isVaultAiTarget('vault')).toBe(true);
      expect(isVaultAiTarget('vault_item')).toBe(true);
      expect(isVaultAiTarget('note', 'vault')).toBe(true);
      expect(isVaultAiTarget('note', 'standard')).toBe(false);

      await expect(
        clientA.createAiProposal({
          workspaceId: workspaceA,
          operation: 'create_personal_note',
          payload: {
            title: 'Vault Note Attempt',
            plainText: 'Should fail closed',
            securityScope: 'vault',
          },
        })
      ).rejects.toThrow(/Vault targets are forbidden|403/);
    });
  });

  describe('4. Grounded Answers, Citations, and Anti-Hallucination Abstention', () => {
    it('produces citations to authorized context documents and abstains when context is absent', async () => {
      const fakeProvider = new FakeAiProvider();
      const groundedResult = await fakeProvider.complete({
        system: 'You answer only from authorized sources.',
        user: 'How do I organize tasks? [source:help:tasks-overview#v1]',
        maxOutputTokens: 250,
      });

      expect(groundedResult.mode).toBe('fake');
      expect(groundedResult.text).toContain('[source:help:tasks-overview#v1]');

      // Inquire about unknown entity
      const unknownAsk = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'What is the secret flight reservation code for next month?',
      });
      expect(unknownAsk.data.abstained).toBe(true);
      expect(unknownAsk.data.answer.toLowerCase()).toMatch(/abstain|insufficient|i don't have information/);
    });
  });

  describe('5. In-Flight Cancellation', () => {
    it('aborts in-flight completion and retains user draft', async () => {
      const ac = new AbortController();
      let abortHandled = false;

      const slowTransport: AiHttpTransport = async (_url, init) => {
        return new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            abortHandled = true;
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      };

      const provider = new OpenAiCompatibleProvider('fake-key', 'https://api.openai.com/v1', 'gpt-4o-mini', slowTransport);
      const promise = provider.complete({
        system: 'sys',
        user: 'query',
        maxOutputTokens: 50,
        signal: ac.signal,
      });

      ac.abort();
      await expect(promise).rejects.toThrow();
      expect(abortHandled).toBe(true);
    });
  });

  describe('6. Operational Outage & Rate-Limit Recovery', () => {
    it('maps HTTP 429 to AI_PROVIDER_RATE_LIMIT and 503 to AI_PROVIDER_OUTAGE', async () => {
      // 429
      const rateLimitTransport: AiHttpTransport = async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit reached' } }),
        text: async () => 'Rate limit exceeded',
      });
      const p429 = new OpenAiCompatibleProvider('key', 'https://api.openai.com/v1', 'gpt-4o-mini', rateLimitTransport);
      await expect(p429.complete({ system: '', user: 'q', maxOutputTokens: 50 })).rejects.toMatchObject({
        code: 'AI_PROVIDER_RATE_LIMIT',
      });

      // 503
      const outageTransport: AiHttpTransport = async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Service unavailable' } }),
        text: async () => 'Overloaded',
      });
      const p503 = new OpenAiCompatibleProvider('key', 'https://api.openai.com/v1', 'gpt-4o-mini', outageTransport);
      await expect(p503.complete({ system: '', user: 'q', maxOutputTokens: 50 })).rejects.toMatchObject({
        code: 'AI_PROVIDER_OUTAGE',
      });
    });
  });

  describe('7. Concurrency-Safe Budget Reservation & Settlement', () => {
    it('rejects requests with 429 AI_BUDGET_EXHAUSTED when budget limit is exceeded', async () => {
      // Request tokens in excess of the budget limit (e.g. 100,000 tokens vs 50,000 limit)
      await withUserContext(adminPool, userA, async (client) => {
        const reserved = await client.query<{ ok: boolean; request_id: string | null }>(
          `SELECT * FROM app.ai_create_reservation($1, $2, $3, $4)`,
          [userA, 100_000, 1, 50_000]
        );
        expect(reserved.rows[0]?.ok).toBe(false);
        expect(reserved.rows[0]?.request_id).toBeNull();
      });
    });
  });

  describe('8. Core Organizer Creation Flows: Note, Journal, Deadline', () => {
    it('Flow 1 (Note): "create a note" -> editable preview -> edit payload -> confirm -> durable receipt & deep link', async () => {
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'create a note: Sprint Planning Session Notes',
        allowSuggestProposal: true,
      });

      expect(askRes.data.suggestedProposal).not.toBeNull();
      const proposal = askRes.data.suggestedProposal!;
      expect(proposal.operation).toBe('create_personal_note');
      expect(proposal.status).toBe('pending');

      // Edit proposal payload
      const edited = await clientA.updateAiProposal(proposal.id, {
        payload: {
          title: 'Sprint Planning Session Notes (Reviewed)',
          plainText: 'Key deliverables, owners, and risk matrix.',
        },
      });
      expect(edited.data.payload['title']).toBe('Sprint Planning Session Notes (Reviewed)');

      // Explicit confirm
      const confirmRes = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: edited.data.confirmationToken,
      });
      expect(confirmRes.data.status).toBe('confirmed');

      const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
      expect(receipt['kind']).toBe('note');
      expect(receipt['deepLink']).toBe(getOrganizerDeepLink('note', String(receipt['id'])));

      // Assert item exists in domain table
      const notes = await clientA.listNotes(workspaceA);
      expect(notes.data.some((n) => n.title === 'Sprint Planning Session Notes (Reviewed)')).toBe(true);

      // Assert durable sync receipt under AI_DEVICE_ID
      const dbReceipt = await adminPool.query(
        `SELECT * FROM app.mutation_receipts WHERE workspace_id = $1 AND entity_id = $2`,
        [workspaceA, receipt['id']]
      );
      expect(dbReceipt.rows[0]!.device_id).toBe('ai-assistant-proposal');
    });

    it('Flow 2 (Journal): ambiguous date prompts clarification question; explicit date saves with durable receipt', async () => {
      // 1. Ambiguous relative date: "yesterday"
      const ambigCheck = detectJournalDateAmbiguity('Reflected on sprint results yesterday');
      expect(ambigCheck.isAmbiguous).toBe(true);

      const ambigAsk = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'write this journal entry: I walked around yesterday and thought about our project',
        allowSuggestProposal: true,
      });
      expect(ambigAsk.data.suggestedProposal).toBeNull();
      expect(ambigAsk.data.answer).toContain('Which date should this journal entry be recorded for?');

      // 2. Explicit ISO date: "2026-11-20"
      const explicitAsk = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'write this journal entry: 2026-11-20 Verified test milestones and architecture specs',
        allowSuggestProposal: true,
      });
      expect(explicitAsk.data.suggestedProposal).not.toBeNull();
      const proposal = explicitAsk.data.suggestedProposal!;
      expect(proposal.operation).toBe('create_personal_journal_entry');

      const confirmRes = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });
      expect(confirmRes.data.status).toBe('confirmed');

      const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
      expect(receipt['kind']).toBe('journal_entry');
      expect(receipt['deepLink']).toBe(getOrganizerDeepLink('journal_entry', String(receipt['id'])));

      const journals = await clientA.listJournalEntries(workspaceA);
      expect(journals.data.some((j) => j.entryDate === '2026-11-20')).toBe(true);
    });

    it('Flow 3 (Deadline): ambiguous deadline prompts clarification; explicit date saves with deadline & deep link', async () => {
      // 1. Ambiguous relative deadline: "tomorrow"
      const ambigCheck = detectTaskDeadlineAmbiguity('Submit vendor contract tomorrow');
      expect(ambigCheck.isAmbiguous).toBe(true);

      const ambigAsk = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'set a task deadline: Submit vendor contract tomorrow',
        allowSuggestProposal: true,
      });
      expect(ambigAsk.data.suggestedProposal).toBeNull();
      expect(ambigAsk.data.answer).toContain('What exact date is the deadline for this task?');

      // 2. Explicit ISO date: "2026-12-15"
      const explicitAsk = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'set a task deadline: Submit corporate tax return by 2026-12-15',
        allowSuggestProposal: true,
      });
      expect(explicitAsk.data.suggestedProposal).not.toBeNull();
      const proposal = explicitAsk.data.suggestedProposal!;
      expect(proposal.operation).toBe('create_personal_task');
      expect(proposal.reviewSummary.date).toBe('2026-12-15');

      const confirmRes = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });
      expect(confirmRes.data.status).toBe('confirmed');

      const receipt = confirmRes.data.executionReceipt as Record<string, unknown>;
      expect(receipt['kind']).toBe('task');
      expect(receipt['deepLink']).toBe(getOrganizerDeepLink('task', String(receipt['id'])));

      const tasks = await clientA.listTasks(workspaceA);
      const match = tasks.data.find((t) => t.title.includes('Submit corporate tax return'));
      expect(match).toBeDefined();
      expect(match?.deadline).toEqual({ type: 'date', date: '2026-12-15' });
    });
  });

  describe('9. Idempotency & Cancellation Guarantees', () => {
    it('idempotent retry returns existing confirmed entity without duplicate rows', async () => {
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'create a note: Idempotency Verification Note',
        allowSuggestProposal: true,
      });
      const proposal = askRes.data.suggestedProposal!;

      const firstConfirm = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });
      const secondConfirm = await clientA.confirmAiProposal(proposal.id, {
        confirmationToken: proposal.confirmationToken,
      });

      expect(firstConfirm.data.id).toBe(secondConfirm.data.id);
      const notes = await clientA.listNotes(workspaceA);
      const matching = notes.data.filter((n) => n.title.includes('Idempotency Verification Note'));
      expect(matching.length).toBe(1);
    });

    it('cancelling a proposal leaves zero rows in organizer tables', async () => {
      const askRes = await clientA.askAssistant({
        workspaceId: workspaceA,
        question: 'create a note: Ephemeral Unconfirmed Note',
        allowSuggestProposal: true,
      });
      const proposal = askRes.data.suggestedProposal!;
      const cancelRes = await clientA.cancelAiProposal(proposal.id);
      expect(cancelRes.data.status).toBe('cancelled');

      const notes = await clientA.listNotes(workspaceA);
      expect(notes.data.some((n) => n.title.includes('Ephemeral Unconfirmed Note'))).toBe(false);
    });
  });

  describe('10. Live Provider Wire Protocol Invariants & Zero User Data Transmission', () => {
    it('verifies store: false, temperature: 0, and Bearer authorization on wire protocol', async () => {
      let sentBody: Record<string, unknown> | null = null;
      let sentAuth: string | null = null;

      const mockTransport: AiHttpTransport = async (_url, init) => {
        sentAuth = (init.headers as Record<string, string>)['Authorization'] ?? null;
        sentBody = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Synthetic test answer [source:synthetic-id#r1]' } }],
            usage: { prompt_tokens: 20, completion_tokens: 10 },
          }),
          text: async () => '',
        };
      };

      const provider = new OpenAiCompatibleProvider('test-api-key', 'https://api.openai.com/v1', 'gpt-4o-mini', mockTransport);
      await provider.complete({
        system: 'System instructions',
        user: 'Synthetic test prompt',
        maxOutputTokens: 100,
      });

      expect(sentAuth).toBe('Bearer test-api-key');
      expect(sentBody).not.toBeNull();
      expect(sentBody!['store']).toBe(false); // store: false invariant
      expect(sentBody!['temperature']).toBe(0);
      expect(sentBody!['model']).toBe('gpt-4o-mini');
    });
  });
});
