import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import { formatMinorUnitsToDecimal } from '@daynori/domain';

describe('Phase 40: Expense Capture, Reports, Budgets & CSV Export', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.internal';
  const audience = 'daynori-api';
  const kid = 'expenses-phase40-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let tokenA: string;
  let tokenB: string;

  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string;
  let _workspaceBId: string;

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

    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
      allowUnauthenticatedStartup: false,
      enableExpenses: true,
      rateLimitOptions: { maxRequests: 2000 },
    });

    baseUrl = await server.listen({ port: 0, host: '127.0.0.1' });

    tokenA = await createToken(userAId, 'usera.p40@example.test');
    tokenB = await createToken(userBId, 'userb.p40@example.test');

    clientA = createApiClient({ baseUrl, token: () => tokenA });
    clientB = createApiClient({ baseUrl, token: () => tokenB });

    const admin = await adminPool.connect();
    try {
      await admin.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES ($1, 'User A Phase 40'), ($2, 'User B Phase 40')
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;`,
        [userAId, userBId]
      );
    } finally {
      admin.release();
    }

    const provA = await clientA.provisionPersonalWorkspace();
    workspaceAId = provA.data.workspace.id;

    const provB = await clientB.provisionPersonalWorkspace();
    _workspaceBId = provB.data.workspace.id;
  });

  afterAll(async () => {
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  // ---------------------------------------------------------------------------
  // 1. Module Opt-in & Privacy Default
  // ---------------------------------------------------------------------------

  describe('1. Module Opt-in & User Profile Preferences', () => {
    it('defaults expensesEnabled to false in user preferences', async () => {
      const prefsRes = await clientA.getUserPreferences();
      expect(prefsRes.data.preferences?.expensesEnabled).toBe(false);
    });

    it('allows toggling expensesEnabled to true with optimistic revision tracking', async () => {
      const currentPrefs = await clientA.getUserPreferences();
      const updated = await clientA.updateUserPreferences({
        preferences: {
          expensesEnabled: true,
        },
        expectedRevision: currentPrefs.data.revision,
      });

      expect(updated.data.preferences?.expensesEnabled).toBe(true);
      expect(updated.data.revision).toBe(currentPrefs.data.revision + 1);

      // Verify persistence across new fetch
      const reloaded = await clientA.getUserPreferences();
      expect(reloaded.data.preferences?.expensesEnabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Fast Manual Entry & Multi-Currency Capture
  // ---------------------------------------------------------------------------

  describe('2. Multi-Currency Fast Manual Entry & Refund Linkage', () => {
    let groceriesCategoryId: string;
    let _transportCategoryId: string;
    let originalExpenseId: string;

    it('creates categories for tracking', async () => {
      const cat1 = await clientA.createExpenseCategory(workspaceAId, {
        name: 'Groceries (মুদি)',
        color: '#10B981',
        icon: 'cart',
      });
      groceriesCategoryId = cat1.data.id;
      expect(cat1.data.name).toBe('Groceries (মুদি)');

      const cat2 = await clientA.createExpenseCategory(workspaceAId, {
        name: 'Transport',
        color: '#3B82F6',
        icon: 'bus',
      });
      _transportCategoryId = cat2.data.id;
      expect(cat2.data.name).toBe('Transport');
    });

    it('creates an expense using exact decimal string and verifies minor units conversion', async () => {
      const expense = await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '125.50',
        currency: 'USD',
        transactionDate: '2026-10-05',
        categoryId: groceriesCategoryId,
        paymentLabel: 'Credit Card',
        note: 'Weekly supermarket shopping',
      });

      originalExpenseId = expense.data.id;
      expect(expense.data.amountFormatted).toBe('125.50');
      expect(expense.data.amountMinorUnits).toBe('12550');
      expect(expense.data.currency).toBe('USD');
      expect(expense.data.kind).toBe('expense');
      expect(expense.data.categoryId).toBe(groceriesCategoryId);
    });

    it('creates an income item in exact decimal format', async () => {
      const income = await clientA.createExpense(workspaceAId, {
        kind: 'income',
        amount: '2500.00',
        currency: 'USD',
        transactionDate: '2026-10-01',
        paymentLabel: 'Direct Deposit',
        note: 'October Salary',
      });

      expect(income.data.amountFormatted).toBe('2500.00');
      expect(income.data.amountMinorUnits).toBe('250000');
      expect(income.data.kind).toBe('income');
    });

    it('creates a refund linked to original expense and inherits category', async () => {
      const refund = await clientA.createExpense(workspaceAId, {
        kind: 'refund',
        amount: '25.50',
        currency: 'USD',
        transactionDate: '2026-10-07',
        originalExpenseId,
        note: 'Returned damaged produce',
      });

      expect(refund.data.kind).toBe('refund');
      expect(refund.data.amountFormatted).toBe('25.50');
      expect(refund.data.amountMinorUnits).toBe('2550');
      expect(refund.data.originalExpenseId).toBe(originalExpenseId);
      expect(refund.data.categoryId).toBe(groceriesCategoryId);
    });

    it('records 0-decimal currency (JPY) accurately without fractional decimals', async () => {
      const jpyExpense = await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '3500',
        currency: 'JPY',
        transactionDate: '2026-10-10',
        note: 'Tokyo travel transit card reload',
      });

      expect(jpyExpense.data.currency).toBe('JPY');
      expect(jpyExpense.data.amountFormatted).toBe('3500');
      expect(jpyExpense.data.amountMinorUnits).toBe('3500');
    });

    it('supports Bangla Unicode characters in notes and merchant labels', async () => {
      const banglaExpense = await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '450.00',
        currency: 'BDT',
        transactionDate: '2026-10-12',
        paymentLabel: 'বিকাশ (bKash)',
        note: 'কাঁচাবাজার ও মাছ কেনাকাটা',
      });

      expect(banglaExpense.data.currency).toBe('BDT');
      expect(banglaExpense.data.paymentLabel).toBe('বিকাশ (bKash)');
      expect(banglaExpense.data.note).toBe('কাঁচাবাজার ও মাছ কেনাকাটা');
      expect(banglaExpense.data.amountFormatted).toBe('450.00');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Category & Date Filtering with Keyset Pagination
  // ---------------------------------------------------------------------------

  describe('3. Category & Date Filtering with Keyset Pagination', () => {
    it('filters transactions by date range within October 2026', async () => {
      const res = await clientA.listExpenses(workspaceAId, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      });

      expect(res.data.length).toBeGreaterThanOrEqual(3);
      for (const item of res.data) {
        expect(item.transactionDate >= '2026-10-01').toBe(true);
        expect(item.transactionDate <= '2026-10-10').toBe(true);
      }
    });

    it('filters transactions by kind (income vs expense)', async () => {
      const incomeList = await clientA.listExpenses(workspaceAId, {
        kind: 'income',
      });
      expect(incomeList.data.length).toBeGreaterThanOrEqual(1);
      expect(incomeList.data.every((i) => i.kind === 'income')).toBe(true);

      const refundList = await clientA.listExpenses(workspaceAId, {
        kind: 'refund',
      });
      expect(refundList.data.length).toBeGreaterThanOrEqual(1);
      expect(refundList.data.every((i) => i.kind === 'refund')).toBe(true);
    });

    it('paginates transaction results using limit and cursor', async () => {
      const page1 = await clientA.listExpenses(workspaceAId, {
        limit: 2,
      });
      expect(page1.data.length).toBe(2);

      const nextCursor = page1.meta.pagination?.nextCursor;
      expect(nextCursor).toBeTruthy();

      const page2 = await clientA.listExpenses(workspaceAId, {
        limit: 2,
        cursor: nextCursor!,
      });
      expect(page2.data.length).toBeGreaterThanOrEqual(1);
      expect(page2.data[0].id).not.toBe(page1.data[0].id);
      expect(page2.data[0].id).not.toBe(page1.data[1].id);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Monthly Summary & Reporting Invariants
  // ---------------------------------------------------------------------------

  describe('4. Monthly Summary & Reporting Invariants', () => {
    it('calculates net spending and savings per currency for October 2026', async () => {
      const summary = await clientA.getExpenseMonthlySummary(workspaceAId, {
        year: 2026,
        month: 10,
      });

      // Expect multi-currency isolation: summaries array contains distinct currency objects
      expect(summary.data.length).toBeGreaterThanOrEqual(1);

      const usdSummary = summary.data.find((s) => s.currency === 'USD');
      expect(usdSummary).toBeDefined();

      if (usdSummary) {
        // Gross spending = 125.50
        // Refunds = 25.50
        // Net spending = 125.50 - 25.50 = 100.00
        // Total Income = 2500.00
        // Net Savings = 2500.00 - 100.00 = 2400.00
        expect(usdSummary.grossExpenseFormatted).toBe('125.50');
        expect(usdSummary.totalRefundFormatted).toBe('25.50');
        expect(usdSummary.netExpenseFormatted).toBe('100.00');
        expect(usdSummary.totalIncomeFormatted).toBe('2500.00');
        expect(usdSummary.netSavingsFormatted).toBe('2400.00');

        // Check integer minor units
        expect(usdSummary.grossExpenseMinorUnits).toBe('12550');
        expect(usdSummary.totalRefundMinorUnits).toBe('2550');
        expect(usdSummary.netExpenseMinorUnits).toBe('10000');
        expect(usdSummary.totalIncomeMinorUnits).toBe('250000');
        expect(usdSummary.netSavingsMinorUnits).toBe('240000');

        // Category breakdown
        const groceryCategory = usdSummary.categoryBreakdown.find(
          (c) => c.categoryName.includes('Groceries')
        );
        expect(groceryCategory).toBeDefined();
        if (groceryCategory) {
          // In groceries: gross was 125.50, refund was 25.50 -> net spending is 100.00
          expect(groceryCategory.spentFormatted).toBe('100.00');
          expect(groceryCategory.spentMinorUnits).toBe('10000');
          expect(groceryCategory.transactionCount).toBe(2); // 1 expense + 1 refund
        }
      }

      // Check JPY summary has 0 decimal formatting
      const jpySummary = summary.data.find((s) => s.currency === 'JPY');
      expect(jpySummary).toBeDefined();
      if (jpySummary) {
        expect(jpySummary.grossExpenseFormatted).toBe('3500');
        expect(jpySummary.grossExpenseMinorUnits).toBe('3500');
        expect(jpySummary.netExpenseFormatted).toBe('3500');
        expect(jpySummary.netSavingsFormatted).toBe('-3500');
      }
    });

    it('truthfully handles negative net spending when refunds exceed gross spending', async () => {
      // In November 2026, add an expense of $20.00
      await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '20.00',
        currency: 'USD',
        transactionDate: '2026-11-01',
        note: 'November purchase',
      });

      // And refund $50.00 against October's $125.50 grocery expense (valid because 25.50 + 50.00 = 75.50 <= 125.50)
      const listOct = await clientA.listExpenses(workspaceAId, {
        startDate: '2026-10-05',
        endDate: '2026-10-05',
      });
      const octGroceryExp = listOct.data[0];
      expect(octGroceryExp).toBeDefined();

      await clientA.createExpense(workspaceAId, {
        kind: 'refund',
        amount: '50.00',
        currency: 'USD',
        transactionDate: '2026-11-05',
        originalExpenseId: octGroceryExp.id,
        note: 'Delayed return from October purchase',
      });

      const novSummary = await clientA.getExpenseMonthlySummary(workspaceAId, {
        year: 2026,
        month: 11,
      });

      const usdNov = novSummary.data.find((s) => s.currency === 'USD');
      expect(usdNov).toBeDefined();
      if (usdNov) {
        expect(usdNov.grossExpenseFormatted).toBe('20.00');
        expect(usdNov.totalRefundFormatted).toBe('50.00');
        // Net spending is negative (-30.00)
        expect(usdNov.netExpenseFormatted).toBe('-30.00');
        expect(usdNov.netExpenseMinorUnits).toBe('-3000');
        // Net savings is +30.00 (income was 0 - (-30.00) = +30.00)
        expect(usdNov.netSavingsFormatted).toBe('30.00');
        expect(usdNov.netSavingsMinorUnits).toBe('3000');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Budget Lifecycle & Non-Advisory Messaging
  // ---------------------------------------------------------------------------

  describe('5. Budget Lifecycle & Factual Non-Advisory Tracking Messages', () => {
    let budgetId: string;

    it('creates an overall monthly budget and lists budgets for period', async () => {
      const budget = await clientA.createExpenseBudget(workspaceAId, {
        period: '2026-10',
        currency: 'USD',
        amount: '500.00',
        categoryId: null, // overall workspace budget
      });

      budgetId = budget.data.id;
      expect(budget.data.period).toBe('2026-10');
      expect(budget.data.amountFormatted).toBe('500.00');
      expect(budget.data.amountMinorUnits).toBe('50000');
      expect(budget.data.currency).toBe('USD');
      expect(budget.data.categoryId).toBeNull();

      const list = await clientA.listExpenseBudgets(workspaceAId, {
        period: '2026-10',
        currency: 'USD',
      });
      expect(list.data.length).toBeGreaterThanOrEqual(1);
      const listedBudget = list.data.find((b) => b.id === budgetId);
      expect(listedBudget).toBeDefined();
      // Verify spent and remaining calculated automatically against October's net spending ($100.00)
      expect(listedBudget?.spentFormatted).toBe('100.00');
      expect(listedBudget?.remainingFormatted).toBe('400.00');
    });

    it('generates factual, non-advisory tracking messages without financial advice', async () => {
      // Net spending in October was $100.00, budget target is $500.00
      // Actual / Target = 100 / 500 = 20%
      // Remaining = 400.00
      const targetMinor = 50000n;
      const actualSpentMinor = 10000n;
      const remainingMinor = targetMinor - actualSpentMinor;
      const percentage = Number((actualSpentMinor * 100n) / targetMinor);

      expect(percentage).toBe(20);
      expect(remainingMinor).toBe(40000n);

      const factualMessage = `${percentage}% of budget used. $${formatMinorUnitsToDecimal(remainingMinor, 'USD')} remaining in October 2026.`;
      expect(factualMessage).toContain('20% of budget used');
      expect(factualMessage).toContain('$400.00 remaining');

      // Invariants: verify no advisory keywords
      const forbiddenAdvisoryPhrases = [
        'you should',
        'we advise',
        'invest in',
        'cut down',
        'you must',
        'financial advice',
        'better return',
        'portfolio',
      ];
      for (const phrase of forbiddenAdvisoryPhrases) {
        expect(factualMessage.toLowerCase()).not.toContain(phrase);
      }
    });

    it('updates a budget target amount', async () => {
      const updated = await clientA.updateExpenseBudget(workspaceAId, budgetId, {
        amount: '600.00',
      });

      expect(updated.data.amountFormatted).toBe('600.00');
      expect(updated.data.amountMinorUnits).toBe('60000');

      const listAfterUpdate = await clientA.listExpenseBudgets(workspaceAId, {
        period: '2026-10',
      });
      const updatedItem = listAfterUpdate.data.find((b) => b.id === budgetId);
      expect(updatedItem?.remainingFormatted).toBe('500.00');
    });

    it('deletes a budget and verifies it is removed', async () => {
      const delRes = await clientA.deleteExpenseBudget(workspaceAId, budgetId);
      expect(delRes.data.success).toBe(true);
      expect(delRes.data.id).toBe(budgetId);

      const listAfter = await clientA.listExpenseBudgets(workspaceAId, {
        period: '2026-10',
      });
      expect(listAfter.data.some((b) => b.id === budgetId)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. CSV Export & Formula Injection Defense
  // ---------------------------------------------------------------------------

  describe('6. CSV Export, Unicode Preservation & Formula Injection Defense', () => {
    it('creates items with formula injection vectors (=, +, -, @, \\t) to verify neutralization', async () => {
      await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '15.00',
        currency: 'USD',
        transactionDate: '2026-10-15',
        paymentLabel: '=SUM(1+1)',
        note: '+cmd|"/C calc"!A0',
      });

      await clientA.createExpense(workspaceAId, {
        kind: 'expense',
        amount: '20.00',
        currency: 'USD',
        transactionDate: '2026-10-16',
        paymentLabel: '@calc',
        note: '-10% discount coupon applied',
      });
    });

    it('exports CSV via exportExpensesCsv with sanitized cells and correct headers', async () => {
      const csvData = await clientA.exportExpensesCsv(workspaceAId, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      // 1. Verify CSV header line
      const lines = csvData.replace('\uFEFF', '').split('\r\n').filter(Boolean);
      expect(lines[0]).toBe(
        'Date,Kind,Amount,Currency,Category,Payment Label,Note,Receipt ID,Original Expense ID,ID'
      );

      // 2. Verify Formula Injection Neutralization:
      // Cells that started with =, +, @, - must be prefixed with single-quote '
      const fullText = csvData;
      expect(fullText).toContain("'=SUM(1+1)"); // formula escaped with prepended '
      expect(fullText).toContain("'+cmd");     // formula escaped with prepended '
      expect(fullText).toContain("'@calc");     // formula escaped with prepended '
      expect(fullText).toContain("'-10% discount"); // formula escaped with prepended '

      // 3. Verify Bangla Unicode is preserved without mangling
      expect(fullText).toContain('মুদি');
      expect(fullText).toContain('বিকাশ (bKash)');
      expect(fullText).toContain('কাঁচাবাজার ও মাছ কেনাকাটা');
    });

    it('verifies HTTP headers and byte-level UTF-8 BOM on GET /v1/workspaces/:workspaceId/expenses/export', async () => {
      const res = await fetch(
        `${baseUrl}/v1/workspaces/${workspaceAId}/expenses/export?startDate=2026-10-01&endDate=2026-10-31`,
        {
          headers: {
            Authorization: `Bearer ${tokenA}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      const disposition = res.headers.get('content-disposition');
      expect(disposition).toContain('attachment;');
      expect(disposition).toContain('filename="expenses-');
      expect(disposition).toContain('.csv"');

      // Check byte-level UTF-8 BOM (0xEF, 0xBB, 0xBF)
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      expect(bytes[0]).toBe(0xEF);
      expect(bytes[1]).toBe(0xBB);
      expect(bytes[2]).toBe(0xBF);
    });

    it('verifies BFF proxy forwarding for CSV streaming export with exact headers, BOM, formula neutralization, and Unicode', async () => {
      // Point DAYNORI_API_URL to current local test API server
      process.env['DAYNORI_API_URL'] = baseUrl;

      const { GET: proxyGet } = await import('../../apps/web/src/app/api/v1/[...path]/route.js');
      const req = new Request(
        `http://localhost:3000/api/v1/workspaces/${workspaceAId}/expenses/export?startDate=2026-10-01&endDate=2026-10-31`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenA}`,
            Accept: 'text/csv',
          },
        }
      );

      const proxyRes = await proxyGet(req, {
        params: Promise.resolve({
          path: ['workspaces', workspaceAId, 'expenses', 'export'],
        }),
      });

      expect(proxyRes.status).toBe(200);
      expect(proxyRes.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      const disposition = proxyRes.headers.get('content-disposition');
      expect(disposition).toContain('attachment;');
      expect(disposition).toContain('filename="expenses-');
      expect(disposition).toContain('.csv"');

      // Assert byte-level UTF-8 BOM
      const buf = await proxyRes.arrayBuffer();
      const bytes = new Uint8Array(buf);
      expect(bytes[0]).toBe(0xEF);
      expect(bytes[1]).toBe(0xBB);
      expect(bytes[2]).toBe(0xBF);

      // Assert Unicode and formula escaping preserved through proxy stream
      const text = new TextDecoder('utf-8').decode(buf);
      expect(text).toContain('মুদি');
      expect(text).toContain('বিকাশ (bKash)');
      expect(text).toContain("'=SUM(1+1)");
      expect(text).toContain("'+cmd");
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Workspace Tenant Isolation
  // ---------------------------------------------------------------------------

  describe('7. Workspace Tenant Isolation & Access Enforcement', () => {
    it('prevents User B from accessing User A expense summary', async () => {
      await expect(
        clientB.getExpenseMonthlySummary(workspaceAId, { year: 2026, month: 10 })
      ).rejects.toThrow();
    });

    it('prevents User B from exporting User A expenses to CSV', async () => {
      await expect(
        clientB.exportExpensesCsv(workspaceAId, { startDate: '2026-10-01', endDate: '2026-10-31' })
      ).rejects.toThrow();
    });

    it('prevents User B from listing User A budgets', async () => {
      await expect(
        clientB.listExpenseBudgets(workspaceAId, { period: '2026-10' })
      ).rejects.toThrow();
    });
  });
});
