import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import { parseDecimalToMinorUnits, formatMinorUnitsToDecimal } from '@daynori/domain';

describe('Phase 39: Expense Tracking Domain & Exact Money Invariants', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.internal';
  const audience = 'daynori-api';
  const kid = 'expenses-test-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let tokenA: string;
  let tokenB: string;

  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceBId: string;

  async function createToken(userId: string, email: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      email,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    migrator = new Migrator();
    await migrator.migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
      allowedAlgorithms: ['RS256'],
    });

    // Build server with enableExpenses: true for Phase 39 local testing
    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
      allowUnauthenticatedStartup: false,
      enableExpenses: true,
    });

    baseUrl = await server.listen({ port: 0, host: '127.0.0.1' });

    tokenA = await createToken(userAId, 'usera@example.test');
    tokenB = await createToken(userBId, 'userb@example.test');

    clientA = createApiClient({ baseUrl, token: () => tokenA });
    clientB = createApiClient({ baseUrl, token: () => tokenB });

    const admin = await adminPool.connect();
    try {
      await admin.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES ($1, 'User A'), ($2, 'User B')
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;`,
        [userAId, userBId]
      );
    } finally {
      admin.release();
    }

    const provA = await clientA.provisionPersonalWorkspace();
    workspaceAId = provA.data.workspace.id;

    const provB = await clientB.provisionPersonalWorkspace();
    workspaceBId = provB.data.workspace.id;
  });

  afterAll(async () => {
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  // ---------------------------------------------------------------------------
  // 1. Exact Money Invariants & Multi-Currency Decimal Precision
  // ---------------------------------------------------------------------------

  describe('1. Exact Money Representation and Round Trips', () => {
    it('supports 0-decimal currency (JPY) without floating-point conversion', () => {
      const parsed = parseDecimalToMinorUnits('1500', 'JPY');
      expect(parsed).toBe(1500n);
      expect(formatMinorUnitsToDecimal(1500n, 'JPY')).toBe('1500');

      // Rejects fractional digits for 0-decimal currencies
      expect(() => parseDecimalToMinorUnits('1500.5', 'JPY')).toThrow(/at most 0 decimal/);
    });

    it('supports 2-decimal currency (USD, BDT, EUR) with exact padding and bounds', () => {
      expect(parseDecimalToMinorUnits('12.50', 'USD')).toBe(1250n);
      expect(formatMinorUnitsToDecimal(1250n, 'USD')).toBe('12.50');

      expect(parseDecimalToMinorUnits('0.05', 'USD')).toBe(5n);
      expect(formatMinorUnitsToDecimal(5n, 'USD')).toBe('0.05');

      expect(parseDecimalToMinorUnits('0.00', 'USD')).toBe(0n);
      expect(formatMinorUnitsToDecimal(0n, 'USD')).toBe('0.00');

      // Single decimal digit padded
      expect(parseDecimalToMinorUnits('12.5', 'USD')).toBe(1250n);

      // Rejects excess precision
      expect(() => parseDecimalToMinorUnits('12.555', 'USD')).toThrow(/at most 2 decimal/);
    });

    it('supports 3-decimal currency (KWD) with exact thousandths precision', () => {
      expect(parseDecimalToMinorUnits('12.345', 'KWD')).toBe(12345n);
      expect(formatMinorUnitsToDecimal(12345n, 'KWD')).toBe('12.345');

      // Rejects 4 decimals
      expect(() => parseDecimalToMinorUnits('12.3456', 'KWD')).toThrow(/at most 3 decimal/);
    });

    it('handles numbers beyond JavaScript safe-integer range (BigInt precision)', () => {
      // 10 trillion dollars: 10,000,000,000,000.50 -> 1000000000000050n minor units
      const largeDecimal = '10000000000000.50';
      const minor = parseDecimalToMinorUnits(largeDecimal, 'USD');
      expect(minor).toBe(1000000000000050n);
      expect(formatMinorUnitsToDecimal(minor, 'USD')).toBe(largeDecimal);
    });

    it('rejects negative amounts and unsupported currencies', () => {
      expect(() => parseDecimalToMinorUnits('-50.00', 'USD')).toThrow(
        /Negative amounts are prohibited/
      );
      expect(() => parseDecimalToMinorUnits('50.00', 'XYZ')).toThrow(/Unsupported currency code/);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Workspace Categories and Folder Organization
  // ---------------------------------------------------------------------------

  describe('2. User Categories and Folders', () => {
    let categoryGroceriesId: string;

    it('creates, lists, and renames workspace-scoped expense categories', async () => {
      const catRes = await clientA.createExpenseCategory(workspaceAId, {
        name: 'Groceries',
        color: '#4CAF50',
        icon: 'shopping-cart',
      });

      expect(catRes.data.id).toBeDefined();
      expect(catRes.data.name).toBe('Groceries');
      categoryGroceriesId = catRes.data.id;

      // Duplicate category name in same workspace is rejected
      await expect(
        clientA.createExpenseCategory(workspaceAId, { name: 'Groceries' })
      ).rejects.toThrow(/already exists/);

      // Same category name in another workspace is permitted (isolation)
      const catB = await clientB.createExpenseCategory(workspaceBId, { name: 'Groceries' });
      expect(catB.data.id).toBeDefined();

      // Update category
      const updated = await clientA.updateExpenseCategory(workspaceAId, categoryGroceriesId, {
        name: 'Food & Groceries',
        color: '#388E3C',
      });
      expect(updated.data.name).toBe('Food & Groceries');
      expect(updated.data.color).toBe('#388E3C');

      // List categories
      const list = await clientA.listExpenseCategories(workspaceAId);
      expect(list.data.some((c) => c.name === 'Food & Groceries')).toBe(true);
    });

    it('soft-deletes category without breaking existing referencing items', async () => {
      const delCat = await clientA.createExpenseCategory(workspaceAId, { name: 'To Be Deleted' });
      const exp = await clientA.createExpense(workspaceAId, {
        amount: '25.00',
        currency: 'USD',
        transactionDate: '2026-10-15',
        categoryId: delCat.data.id,
      });

      expect(exp.data.categoryId).toBe(delCat.data.id);

      // Delete category
      const delRes = await clientA.deleteExpenseCategory(workspaceAId, delCat.data.id);
      expect(delRes.data.success).toBe(true);

      // Referencing expense still retains categoryId for historical audit
      const fetched = await clientA.getExpense(workspaceAId, exp.data.id);
      expect(fetched.data.categoryId).toBe(delCat.data.id);
    });

    it('allows organizing expenses into canonical folders', async () => {
      const folder = await clientA.createFolder(workspaceAId, { name: 'Tax 2026' });

      const exp = await clientA.createExpense(workspaceAId, {
        amount: '150.00',
        currency: 'USD',
        transactionDate: '2026-10-18',
        folderId: folder.data.id,
      });

      expect(exp.data.folderId).toBe(folder.data.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Receipt File References and Security Scope
  // ---------------------------------------------------------------------------

  describe('3. Receipt File Authorization and Scope', () => {
    let validFileId: string;
    let quarantinedFileId: string;

    beforeAll(async () => {
      const admin = await adminPool.connect();
      try {
        validFileId = crypto.randomUUID();
        quarantinedFileId = crypto.randomUUID();

        const rPath = `files/r_${crypto.randomUUID()}.pdf`;
        const badPath = `files/bad_${crypto.randomUUID()}.pdf`;

        // Seed valid verified file in workspace A
        await admin.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, revision, rank, security_scope)
           VALUES ($1, $2, 'file', $3, $3, 1, '00001000', 'standard');`,
          [validFileId, workspaceAId, userAId]
        );
        await admin.query(
          `INSERT INTO app.file_items (id, workspace_id, file_name, object_path, declared_mime_type, detected_mime_type, byte_size, sha256_checksum, quarantine_status, created_by)
           VALUES ($1, $2, 'receipt.pdf', $4, 'application/pdf', 'application/pdf', 1024, 'abc', 'verified', $3);`,
          [validFileId, workspaceAId, userAId, rPath]
        );

        // Seed quarantined file in workspace A
        await admin.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, revision, rank, security_scope)
           VALUES ($1, $2, 'file', $3, $3, 1, '00001000', 'standard');`,
          [quarantinedFileId, workspaceAId, userAId]
        );
        await admin.query(
          `INSERT INTO app.file_items (id, workspace_id, file_name, object_path, declared_mime_type, detected_mime_type, byte_size, sha256_checksum, quarantine_status, created_by)
           VALUES ($1, $2, 'bad.pdf', $4, 'application/pdf', 'application/pdf', 1024, 'def', 'quarantined', $3);`,
          [quarantinedFileId, workspaceAId, userAId, badPath]
        );
      } finally {
        admin.release();
      }
    });

    it('attaches an active, verified receipt file in the same workspace', async () => {
      const exp = await clientA.createExpense(workspaceAId, {
        amount: '89.99',
        currency: 'USD',
        transactionDate: '2026-10-18',
        receiptFileId: validFileId,
      });

      expect(exp.data.receiptFileId).toBe(validFileId);
    });

    it('rejects attaching quarantined files', async () => {
      await expect(
        clientA.createExpense(workspaceAId, {
          amount: '89.99',
          currency: 'USD',
          transactionDate: '2026-10-18',
          receiptFileId: quarantinedFileId,
        })
      ).rejects.toThrow(/quarantined files cannot be attached/);
    });

    it('rejects cross-workspace receipt references', async () => {
      // User B attempts to attach User A's file to workspace B
      await expect(
        clientB.createExpense(workspaceBId, {
          amount: '50.00',
          currency: 'USD',
          transactionDate: '2026-10-18',
          receiptFileId: validFileId,
        })
      ).rejects.toThrow(/does not exist or has been deleted/);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Concurrently Safe Refunds and Cumulative Bounds
  // ---------------------------------------------------------------------------

  describe('4. Refund Correctness, Bounds, and Concurrency', () => {
    let originalExpenseId: string;

    beforeAll(async () => {
      const exp = await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '100.00',
        currency: 'USD',
        transactionDate: '2026-10-01',
        paymentLabel: 'Credit Card',
        note: 'Office desk',
      });
      originalExpenseId = exp.data.id;
    });

    it('allows partial refunds and tracks cumulative refund amounts', async () => {
      // Refund 1: $40.00
      const ref1 = await clientA.createExpense(workspaceAId, {
        kind: 'refund',
        amount: '40.00',
        currency: 'USD',
        transactionDate: '2026-10-05',
        originalExpenseId,
        note: 'Desk damaged in transit',
      });
      expect(ref1.data.kind).toBe('refund');
      expect(ref1.data.amountFormatted).toBe('40.00');

      // Original expense cumulative refund is now $40.00
      const origAfter1 = await clientA.getExpense(workspaceAId, originalExpenseId);
      expect(origAfter1.data.cumulativeRefundMinorUnits).toBe('4000');

      // Refund 2: $60.00 (reaches full $100.00)
      const ref2 = await clientA.createExpense(workspaceAId, {
        kind: 'refund',
        amount: '60.00',
        currency: 'USD',
        transactionDate: '2026-10-06',
        originalExpenseId,
      });
      expect(ref2.data.amountFormatted).toBe('60.00');

      const origAfter2 = await clientA.getExpense(workspaceAId, originalExpenseId);
      expect(origAfter2.data.cumulativeRefundMinorUnits).toBe('10000');
    });

    it('strictly rejects refunds that exceed the original amount (over-refund prevention)', async () => {
      // Attempting any additional refund beyond $100.00 must fail
      await expect(
        clientA.createExpense(workspaceAId, {
          kind: 'refund',
          amount: '1.00',
          currency: 'USD',
          transactionDate: '2026-10-07',
          originalExpenseId,
        })
      ).rejects.toThrow(/Cumulative refunds.*cannot exceed original expense amount/);
    });

    it('rejects refund with mismatched currency', async () => {
      await expect(
        clientA.createExpense(workspaceAId, {
          kind: 'refund',
          amount: '10.00',
          currency: 'EUR',
          transactionDate: '2026-10-07',
          originalExpenseId,
        })
      ).rejects.toThrow(/Refund currency \(EUR\) does not match original expense currency \(USD\)/);
    });

    it('protects original expense from deletion or reduction while active refunds exist', async () => {
      // Attempting to trash the original expense while active refunds exist must fail
      await expect(clientA.trashExpense(workspaceAId, originalExpenseId)).rejects.toThrow(
        /Cannot delete expense with active refund references/
      );

      // Attempting to reduce the original amount below $100 must fail
      await expect(
        clientA.updateExpense(workspaceAId, originalExpenseId, {
          amount: '80.00',
        })
      ).rejects.toThrow(/Cannot reduce expense amount.*below cumulative active refunds/);
    });

    it('trashing a refund releases refundable headroom, restoring re-claims it', async () => {
      // List active refunds for this original expense
      const refunds = await clientA.listExpenses(workspaceAId, { kind: 'refund' });
      const refToTrash = refunds.data.find(
        (r) => r.originalExpenseId === originalExpenseId && r.amountFormatted === '60.00'
      )!;

      // Trash the $60 refund
      const trashRes = await clientA.trashExpense(workspaceAId, refToTrash.id);
      expect(trashRes.data.success).toBe(true);

      // Cumulative refunds on original expense drops to $40.00
      const origAfterTrash = await clientA.getExpense(workspaceAId, originalExpenseId);
      expect(origAfterTrash.data.cumulativeRefundMinorUnits).toBe('4000');

      // Now a new refund for $50 is allowed!
      const newRef = await clientA.createExpense(workspaceAId, {
        kind: 'refund',
        amount: '50.00',
        currency: 'USD',
        transactionDate: '2026-10-08',
        originalExpenseId,
      });
      expect(newRef.data.amountFormatted).toBe('50.00');

      // Cumulative is now $90.00
      const origAfterNew = await clientA.getExpense(workspaceAId, originalExpenseId);
      expect(origAfterNew.data.cumulativeRefundMinorUnits).toBe('9000');

      // Attempting to restore the original $60 refund would exceed $100 ($90 + $60 = $150) -> must fail!
      await expect(clientA.restoreExpense(workspaceAId, refToTrash.id)).rejects.toThrow(
        /Cumulative refunds.*cannot exceed original expense amount/
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Monthly Summaries and Multi-Currency Separation
  // ---------------------------------------------------------------------------

  describe('5. Monthly Summaries & Multi-Currency Aggregations', () => {
    let catFoodId: string;

    beforeAll(async () => {
      const cat = await clientA.createExpenseCategory(workspaceAId, { name: 'Dining' });
      catFoodId = cat.data.id;

      // September 2026 USD transactions:
      // 1. Income: $500.00 USD
      await clientA.createExpense(workspaceAId, {
        kind: 'income',
        amount: '500.00',
        currency: 'USD',
        transactionDate: '2026-09-02',
      });

      // 2. Expense: $120.00 USD in Dining
      const exp = await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '120.00',
        currency: 'USD',
        transactionDate: '2026-09-10',
        categoryId: catFoodId,
      });

      // 3. Refund: $20.00 USD in Dining
      await clientA.createExpense(workspaceAId, {
        kind: 'refund',
        amount: '20.00',
        currency: 'USD',
        transactionDate: '2026-09-12',
        originalExpenseId: exp.data.id,
      });

      // September 2026 BDT transactions (different currency):
      // 1. Expense: 5000.00 BDT
      await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '5000.00',
        currency: 'BDT',
        transactionDate: '2026-09-15',
      });
    });

    it('groups summaries strictly per currency without coercion', async () => {
      const summary = await clientA.getExpenseMonthlySummary(workspaceAId, {
        year: 2026,
        month: 9,
      });
      expect(summary.data.length).toBe(2);

      const usd = summary.data.find((s) => s.currency === 'USD')!;
      expect(usd).toBeDefined();
      expect(usd.totalIncomeFormatted).toBe('500.00');
      expect(usd.grossExpenseFormatted).toBe('120.00');
      expect(usd.totalRefundFormatted).toBe('20.00');
      // Net expense is gross expense minus refunds: $120 - $20 = $100.00
      expect(usd.netExpenseFormatted).toBe('100.00');
      // Net savings is income minus net expense: $500 - $100 = $400.00
      expect(usd.netSavingsFormatted).toBe('400.00');

      const catDining = usd.categoryBreakdown.find((c) => c.categoryId === catFoodId)!;
      expect(catDining).toBeDefined();
      expect(catDining.spentFormatted).toBe('100.00');

      const bdt = summary.data.find((s) => s.currency === 'BDT')!;
      expect(bdt).toBeDefined();
      expect(bdt.grossExpenseFormatted).toBe('5000.00');
    });

    it('correctly handles cross-month refunds producing truthful negative category spending', async () => {
      // November 2026 refund against October expense:
      // Create expense in Oct: $50.00 in Dining
      const octExp = await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '50.00',
        currency: 'USD',
        transactionDate: '2026-10-25',
        categoryId: catFoodId,
      });

      // Refund in Nov: $50.00 in Dining (no other expenses in Nov)
      await clientA.createExpense(workspaceAId, {
        kind: 'refund',
        amount: '50.00',
        currency: 'USD',
        transactionDate: '2026-11-05',
        originalExpenseId: octExp.data.id,
      });

      const novSummary = await clientA.getExpenseMonthlySummary(workspaceAId, {
        year: 2026,
        month: 11,
      });
      const usdNov = novSummary.data.find((s) => s.currency === 'USD')!;
      expect(usdNov).toBeDefined();
      expect(usdNov.totalRefundFormatted).toBe('50.00');
      // Net expense is 0 - 50 = -50.00
      expect(usdNov.netExpenseFormatted).toBe('-50.00');

      const catNov = usdNov.categoryBreakdown.find((c) => c.categoryId === catFoodId)!;
      expect(catNov.spentFormatted).toBe('-50.00');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Recurring Templates and Deduplicated Generation
  // ---------------------------------------------------------------------------

  describe('6. Recurring Entry Templates and Deduplication', () => {
    it('creates recurring template and generates deduplicated occurrences', async () => {
      const template = await clientA.createExpenseRecurringTemplate(workspaceAId, {
        title: 'Cloud Server Hosting',
        kind: 'expense',
        amount: '45.00',
        currency: 'USD',
        schedule: {
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: 1,
        },
        startDate: '2026-08-01',
      });

      expect(template.data.id).toBeDefined();
      expect(template.data.title).toBe('Cloud Server Hosting');

      // Generate occurrences up to 2026-10-01 (Aug 1, Sep 1, Oct 1 = 3 occurrences)
      const gen1 = await clientA.generateRecurringOccurrences(workspaceAId, {
        untilDate: '2026-10-01',
      });
      expect(gen1.data.generatedCount).toBe(3);
      expect(gen1.data.expenseIds.length).toBe(3);

      // Re-running generation up to same date generates 0 occurrences (deduplication!)
      const gen2 = await clientA.generateRecurringOccurrences(workspaceAId, {
        untilDate: '2026-10-01',
      });
      expect(gen2.data.generatedCount).toBe(0);

      // Running up to November 1 generates exactly 1 new occurrence (Nov 1)
      const gen3 = await clientA.generateRecurringOccurrences(workspaceAId, {
        untilDate: '2026-11-01',
      });
      expect(gen3.data.generatedCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Private Beta Feature Scope Barrier
  // ---------------------------------------------------------------------------

  describe('7. Beta Scope Barrier Enforcement', () => {
    it('strictly returns 403 Forbidden on expenses when enableExpenses is not enabled', async () => {
      // Build a standard beta server where enableExpenses is false
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
        allowedAlgorithms: ['RS256'],
      });

      const betaServer = buildServer({
        runtimePool,
        jwtVerifier: verifier,
        allowUnauthenticatedStartup: false,
        enableExpenses: false, // Beta mode!
      });

      const betaUrl = await betaServer.listen({ port: 0, host: '127.0.0.1' });
      try {
        const res = await fetch(`${betaUrl}/v1/workspaces/${workspaceAId}/expenses`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenA}`,
          },
        });
        expect(res.status).toBe(403);
      } finally {
        await betaServer.close();
      }
    });
  });
});
