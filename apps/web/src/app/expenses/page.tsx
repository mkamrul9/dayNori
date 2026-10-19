'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import {
  Button,
  Card,
  Feedback,
  EmptyState,
  ExpenseCaptureDialog,
  ExpenseReportView,
  ExpenseBudgetView,
  type FeedbackSeverity,
} from '@daynori/ui-web';
import type {
  ExpenseCategory,
  ExpenseItem,
  ExpenseBudget,
  CurrencyMonthlySummary,
} from '@daynori/contracts';
import { useAuth } from '../../components/AuthContext';
import { useShell } from '../../components/ShellContext';
import { createWebApiClient } from '../../data/webApiClient';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function ExpensesPage() {
  const { workspaceId, isAuthenticated, preferences, savePreferences, loadPreferences } = useAuth();
  const { themeMode } = useShell();
  const palette = colors[themeMode] || colors.light;

  const now = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(now.getMonth() + 1);

  const periodString = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const [activeTab, setActiveTab] = useState<'transactions' | 'report' | 'budgets'>('transactions');
  const [isCaptureOpen, setIsCaptureOpen] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);

  const [transactions, setTransactions] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [budgets, setBudgets] = useState<ExpenseBudget[]>([]);
  const [monthlySummaries, setMonthlySummaries] = useState<CurrencyMonthlySummary[]>([]);

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('');
  const [selectedKindFilter, setSelectedKindFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(null);

  const apiClient = useMemo(() => {
    return createWebApiClient();
  }, []);

  const isModuleEnabled = Boolean(preferences?.expensesEnabled);

  // Load all expense data for current month & workspace
  const loadExpenseData = useCallback(async () => {
    if (!workspaceId || !isAuthenticated || !isModuleEnabled) return;
    setIsLoading(true);
    setFeedback(null);

    try {
      // 1. Categories
      const catRes = await apiClient.listExpenseCategories(workspaceId);
      setCategories(catRes.data);

      // 2. Transactions for current month
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
      const endOfMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      const txRes = await apiClient.listExpenses(workspaceId, {
        startDate: startOfMonth,
        endDate: endOfMonth,
        limit: 100,
      });
      setTransactions(txRes.data);

      // 3. Budgets for period
      const budgetRes = await apiClient.listExpenseBudgets(workspaceId, {
        period: periodString,
      });
      setBudgets(budgetRes.data);

      // 4. Monthly summaries
      const summaryRes = await apiClient.getExpenseMonthlySummary(workspaceId, {
        year: currentYear,
        month: currentMonth,
      });
      setMonthlySummaries(summaryRes.data);
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to load expense records.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, isAuthenticated, isModuleEnabled, apiClient, currentYear, currentMonth, periodString]);

  useEffect(() => {
    loadExpenseData();
  }, [loadExpenseData]);

  // Handle opt-in enablement
  const handleEnableModule = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      await savePreferences({
        expensesEnabled: true,
      });
      await loadPreferences();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to enable expenses module.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Transaction submission
  const handleCreateOrUpdateExpense = async (data: {
    kind: 'expense' | 'income' | 'refund';
    amount: string;
    currency: string;
    transactionDate: string;
    categoryId?: string | null;
    paymentLabel?: string | null;
    note?: string | null;
    receiptFileId?: string | null;
    originalExpenseId?: string | null;
    timezone?: string;
  }) => {
    if (!workspaceId) return;

    if (editingExpense) {
      await apiClient.updateExpense(workspaceId, editingExpense.id, {
        amount: data.amount,
        currency: data.currency,
        transactionDate: data.transactionDate,
        categoryId: data.categoryId,
        paymentLabel: data.paymentLabel,
        note: data.note,
        receiptFileId: data.receiptFileId,
        timezone: data.timezone,
      });
      setEditingExpense(null);
    } else {
      await apiClient.createExpense(workspaceId, {
        kind: data.kind,
        amount: data.amount,
        currency: data.currency,
        transactionDate: data.transactionDate,
        categoryId: data.categoryId,
        paymentLabel: data.paymentLabel,
        note: data.note,
        receiptFileId: data.receiptFileId,
        originalExpenseId: data.originalExpenseId,
        timezone: data.timezone,
      });
    }

    await loadExpenseData();
  };

  // Transaction trash / delete
  const handleDeleteExpense = async (expenseId: string) => {
    if (!workspaceId || !confirm('Are you sure you want to delete this expense record?')) return;
    try {
      await apiClient.trashExpense(workspaceId, expenseId);
      await loadExpenseData();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to delete transaction.',
      });
    }
  };

  // Budget management
  const handleCreateBudget = async (data: { period: string; currency: string; categoryId?: string | null; amount: string }) => {
    if (!workspaceId) return;
    await apiClient.createExpenseBudget(workspaceId, data);
    await loadExpenseData();
  };

  const handleUpdateBudget = async (budgetId: string, amount: string) => {
    if (!workspaceId) return;
    await apiClient.updateExpenseBudget(workspaceId, budgetId, { amount });
    await loadExpenseData();
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (!workspaceId || !confirm('Are you sure you want to delete this budget?')) return;
    await apiClient.deleteExpenseBudget(workspaceId, budgetId);
    await loadExpenseData();
  };

  // CSV Export
  const handleExportCsv = async (currencyFilter?: string) => {
    if (!workspaceId) return;
    try {
      const csvData = await apiClient.exportExpensesCsv(workspaceId, {
        currency: currencyFilter,
      });

      // Browser download trigger
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `expenses-${periodString}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to export CSV.',
      });
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selectedCategoryFilter && tx.categoryId !== selectedCategoryFilter) return false;
      if (selectedKindFilter && tx.kind !== selectedKindFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesNote = tx.note?.toLowerCase().includes(q);
        const matchesLabel = tx.paymentLabel?.toLowerCase().includes(q);
        const matchesCat = tx.categoryName?.toLowerCase().includes(q);
        if (!matchesNote && !matchesLabel && !matchesCat) return false;
      }
      return true;
    });
  }, [transactions, selectedCategoryFilter, selectedKindFilter, searchQuery]);

  // Opt-in gate: If user has not enabled the module, keep it strictly off default views
  if (!isModuleEnabled) {
    return (
      <main style={{ padding: spacing.xl, maxWidth: '800px', margin: '0 auto', fontFamily: typography.fontFamily.sans }}>
        <Card>
          <div style={{ padding: spacing.xxl, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.md }}>
            <span style={{ fontSize: '3rem' }}>📊</span>
            <h1 style={{ fontSize: typography.webScale.pageTitle, fontWeight: 'bold', margin: 0, color: palette.text.primary }}>
              Personal Expenses & Budgets
            </h1>
            <p style={{ fontSize: typography.webScale.body, color: palette.text.secondary, maxWidth: '520px', lineHeight: typography.lineHeight.relaxed, margin: 0 }}>
              Track personal expenses, income, and refunds with exact minor-unit arithmetic, multi-currency isolation, category summaries, and monthly budgets.
            </p>
            <p style={{ fontSize: typography.webScale.supporting, color: palette.text.secondary, margin: 0 }}>
              This module is optional and kept separate from your default workspace home.
            </p>

            {feedback && <Feedback severity={feedback.severity} message={feedback.message} />}

            <div style={{ marginTop: spacing.md }}>
              <Button variant="primary" onClick={handleEnableModule} disabled={isLoading}>
                {isLoading ? 'Enabling...' : 'Enable Expenses & Budgets for this Workspace'}
              </Button>
            </div>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: spacing.lg,
        maxWidth: '1100px',
        margin: '0 auto',
        fontFamily: typography.fontFamily.sans,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.lg,
      }}
    >
      {/* Top Header & Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: spacing.md,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: typography.webScale.welcomeTitle,
              fontWeight: 'bold',
              margin: 0,
              color: palette.text.primary,
            }}
          >
            Expenses & Budgets
          </h1>
          <p style={{ fontSize: typography.webScale.supporting, color: palette.text.secondary, margin: `${spacing.xs}px 0 0 0` }}>
            Manage expenses, review monthly reports, and track budgets.
          </p>
        </div>

        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          {/* Month selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: radii.sm,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              style={{
                border: 'none',
                background: 'transparent',
                padding: `${spacing.xs}px ${spacing.sm}px`,
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              ◀
            </button>
            <span
              style={{
                fontSize: typography.webScale.supporting,
                fontWeight: 'bold',
                padding: `0 ${spacing.sm}px`,
                color: palette.text.primary,
              }}
            >
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              style={{
                border: 'none',
                background: 'transparent',
                padding: `${spacing.xs}px ${spacing.sm}px`,
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              ▶
            </button>
          </div>

          <Button variant="primary" onClick={() => setIsCaptureOpen(true)}>
            ➕ Record Transaction
          </Button>

          <Button variant="secondary" onClick={() => handleExportCsv()}>
            📥 Export CSV
          </Button>
        </div>
      </div>

      {feedback && <Feedback severity={feedback.severity} message={feedback.message} />}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E2E8F0', gap: spacing.md }}>
        {(
          [
            { id: 'transactions', label: `Transactions (${filteredTransactions.length})` },
            { id: 'report', label: 'Monthly Report' },
            { id: 'budgets', label: `Budgets (${budgets.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: `${spacing.sm}px ${spacing.md}px`,
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #2563EB' : '2px solid transparent',
              marginBottom: '-2px',
              backgroundColor: 'transparent',
              color: activeTab === tab.id ? '#1D4ED8' : palette.text.secondary,
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              fontSize: typography.webScale.body,
              cursor: 'pointer',
              minHeight: touchTargets.webMin,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              gap: spacing.sm,
              flexWrap: 'wrap',
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              padding: spacing.md,
              borderRadius: radii.card,
              border: '1px solid #E2E8F0',
            }}
          >
            <input
              type="text"
              placeholder="Search notes, payment labels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 2,
                minWidth: '200px',
                padding: `${spacing.xs}px ${spacing.sm}px`,
                border: '1px solid #CBD5E1',
                borderRadius: radii.sm,
                fontSize: typography.webScale.supporting,
                height: '36px',
              }}
            />

            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              style={{
                flex: 1,
                minWidth: '150px',
                padding: `${spacing.xs}px ${spacing.sm}px`,
                border: '1px solid #CBD5E1',
                borderRadius: radii.sm,
                fontSize: typography.webScale.supporting,
                height: '36px',
              }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={selectedKindFilter}
              onChange={(e) => setSelectedKindFilter(e.target.value)}
              style={{
                flex: 1,
                minWidth: '120px',
                padding: `${spacing.xs}px ${spacing.sm}px`,
                border: '1px solid #CBD5E1',
                borderRadius: radii.sm,
                fontSize: typography.webScale.supporting,
                height: '36px',
              }}
            >
              <option value="">All Types</option>
              <option value="expense">Expenses Only</option>
              <option value="income">Income Only</option>
              <option value="refund">Refunds Only</option>
            </select>
          </div>

          {/* Transactions List */}
          {filteredTransactions.length === 0 ? (
            <Card>
              <EmptyState
                title="No transactions found"
                description={`No transactions recorded in ${MONTH_NAMES[currentMonth - 1]} ${currentYear} matching your filters.`}
                actionLabel="Record Transaction"
                onAction={() => setIsCaptureOpen(true)}
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {filteredTransactions.map((tx) => {
                const isExpense = tx.kind === 'expense';
                const isIncome = tx.kind === 'income';

                const sign = isExpense ? '-' : '+';
                const color = isExpense ? '#B91C1C' : isIncome ? '#15803D' : '#1D4ED8';

                return (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#FFFFFF',
                      padding: `${spacing.md}px ${spacing.lg}px`,
                      borderRadius: radii.card,
                      border: '1px solid #E2E8F0',
                      flexWrap: 'wrap',
                      gap: spacing.sm,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                      <span style={{ fontSize: '1.5rem' }}>
                        {isExpense ? '💸' : isIncome ? '💰' : '↩️'}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                          <span style={{ fontWeight: 'bold', color: palette.text.primary, fontSize: typography.webScale.body }}>
                            {tx.note || tx.paymentLabel || (isExpense ? 'Expense' : isIncome ? 'Income' : 'Refund')}
                          </span>
                          {tx.categoryName && (
                            <span
                              style={{
                                fontSize: typography.webScale.metadata,
                                padding: `2px ${spacing.xs}px`,
                                borderRadius: radii.sm,
                                backgroundColor: '#F1F5F9',
                                color: '#475569',
                              }}
                            >
                              {tx.categoryName}
                            </span>
                          )}
                          {tx.receiptFileId && (
                            <span title="Receipt attached" style={{ fontSize: typography.webScale.metadata }}>
                              📎
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: typography.webScale.metadata, color: palette.text.secondary }}>
                          {tx.transactionDate} {tx.paymentLabel ? `• ${tx.paymentLabel}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: typography.webScale.sectionHeading, fontWeight: 'bold', color }}>
                          {sign}
                          {tx.amountFormatted} {tx.currency}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: spacing.xs }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpense(tx);
                            setIsCaptureOpen(true);
                          }}
                          aria-label={`Edit transaction ${tx.id}`}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#2563EB',
                            fontSize: typography.webScale.supporting,
                            padding: spacing.xs,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(tx.id)}
                          aria-label={`Delete transaction ${tx.id}`}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#DC2626',
                            fontSize: typography.webScale.supporting,
                            padding: spacing.xs,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'report' && (
        <ExpenseReportView
          summaries={monthlySummaries}
          year={currentYear}
          month={currentMonth}
          onExportCsv={(currency) => handleExportCsv(currency)}
          isLoading={isLoading}
        />
      )}

      {activeTab === 'budgets' && (
        <ExpenseBudgetView
          budgets={budgets}
          period={periodString}
          categories={categories}
          onCreateBudget={handleCreateBudget}
          onUpdateBudget={handleUpdateBudget}
          onDeleteBudget={handleDeleteBudget}
          isLoading={isLoading}
        />
      )}

      {/* Capture Dialog */}
      <ExpenseCaptureDialog
        isOpen={isCaptureOpen}
        onClose={() => {
          setIsCaptureOpen(false);
          setEditingExpense(null);
        }}
        onSubmit={handleCreateOrUpdateExpense}
        categories={categories}
        availableOriginalExpenses={transactions.filter((t) => t.kind === 'expense')}
        initialValues={
          editingExpense
            ? {
                kind: editingExpense.kind,
                amount: editingExpense.amountFormatted,
                currency: editingExpense.currency,
                transactionDate: editingExpense.transactionDate,
                categoryId: editingExpense.categoryId,
                paymentLabel: editingExpense.paymentLabel,
                note: editingExpense.note,
                receiptFileId: editingExpense.receiptFileId,
                originalExpenseId: editingExpense.originalExpenseId,
              }
            : undefined
        }
        mode={editingExpense ? 'edit' : 'create'}
      />
    </main>
  );
}
