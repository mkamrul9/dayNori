import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native';
import {
  colors,
  radii,
  spacing,
  touchTargets,
  type ThemeMode
} from '@daynori/design-tokens';
import {
  Icon,
  MobileButton,
  MobileCard,
  MobileEmptyState,
  MobileFeedback,
  MobileExpenseCaptureSheet,
  MobileExpenseReportView,
  MobileModalSheet,
  MobileTextField
} from '@daynori/ui-mobile';
import type {
  ExpenseCategory,
  ExpenseItem,
  ExpenseBudget,
  CurrencyMonthlySummary
} from '@daynori/contracts';
import type { DaynoriApiClient } from '@daynori/api-client';
import { defaultSecureStorage } from '../auth/secureStorage.js';
import { isCorePreview } from '../config/runtime.js';

export interface ExpensesViewProps {
  themeMode: ThemeMode;
  onClose: () => void;
  workspaceId: string | null;
  apiClient?: DaynoriApiClient;
  isOnline?: boolean;
  testID?: string;
}

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

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  themeMode,
  onClose,
  workspaceId,
  apiClient,
  isOnline = true,
  testID = 'expenses-view',
}) => {
  const palette = colors[themeMode];

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
  const [availableReceipts, setAvailableReceipts] = useState<
    Array<{ id: string; fileName?: string }>
  >([]);
  const [eligibleOriginalExpenses, setEligibleOriginalExpenses] = useState<ExpenseItem[]>([]);

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('');
  const [selectedKindFilter, setSelectedKindFilter] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    severity: 'success' | 'warning' | 'danger' | 'info';
    message: string;
  } | null>(null);

  // Pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Budget management state
  const [isBudgetSheetOpen, setIsBudgetSheetOpen] = useState<boolean>(false);
  const [editingBudget, setEditingBudget] = useState<ExpenseBudget | null>(null);
  const [budgetAmount, setBudgetAmount] = useState<string>('');
  const [budgetCurrency, setBudgetCurrency] = useState<string>('USD');
  const [budgetCategoryId, setBudgetCategoryId] = useState<string>('');

  const draftStorageKey = workspaceId ? `daynori_mobile_expense_draft_${workspaceId}` : null;
  const [createDraft, setCreateDraft] = useState<Record<string, unknown> | null>(null);

  // Restore cached draft from secure storage
  useEffect(() => {
    if (!draftStorageKey) return;
    defaultSecureStorage
      .getItemAsync(draftStorageKey)
      .then((saved) => {
        if (saved) {
          try {
            setCreateDraft(JSON.parse(saved));
          } catch {
            // ignore JSON parse error
          }
        }
      })
      .catch(() => {});
  }, [draftStorageKey]);

  // Load expense data from API
  const loadData = useCallback(async () => {
    if (!workspaceId || !apiClient || !isOnline) return;
    setIsLoading(true);
    setFeedback(null);

    try {
      // 1. Categories
      const catRes = await apiClient.listExpenseCategories(workspaceId);
      setCategories(catRes.data);

      // 2. Transactions for current month with pagination
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const endOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const txRes = await apiClient.listExpenses(workspaceId, {
        startDate: startOfMonth,
        endDate: endOfMonth,
        categoryId: selectedCategoryFilter || undefined,
        kind: (selectedKindFilter as 'expense' | 'income' | 'refund') || undefined,
        limit: 50,
      });
      setTransactions(txRes.data);
      setNextCursor(txRes.meta?.pagination?.nextCursor ?? null);
      setHasMore(Boolean(txRes.meta?.pagination?.hasMore));

      // 3. Budgets
      const budgetRes = await apiClient.listExpenseBudgets(workspaceId, {
        period: periodString,
      });
      setBudgets(budgetRes.data);

      // 4. Summaries
      const summaryRes = await apiClient.getExpenseMonthlySummary(workspaceId, {
        year: currentYear,
        month: currentMonth,
      });
      setMonthlySummaries(summaryRes.data);

      // 5. Eligible original expenses for refund
      try {
        const origRes = await apiClient.listExpenses(workspaceId, {
          kind: 'expense',
          limit: 100,
        });
        setEligibleOriginalExpenses(origRes.data);
      } catch {
        // fallback
      }

      // 6. Candidate receipt files (server still enforces verified same-workspace ownership)
      if (!isCorePreview) {
        try {
          const itemsRes = await apiClient.listItems(workspaceId, { kind: 'file' });
          if (itemsRes && Array.isArray(itemsRes.data)) {
            setAvailableReceipts(
              itemsRes.data.map((item) => ({ id: item.id, fileName: item.name || item.id }))
            );
          }
        } catch {
          setAvailableReceipts([]);
        }
      } else {
        setAvailableReceipts([]);
      }
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to load expense records.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    workspaceId,
    apiClient,
    isOnline,
    currentYear,
    currentMonth,
    selectedCategoryFilter,
    selectedKindFilter,
    periodString,
  ]);

  const handleLoadMore = async () => {
    if (!workspaceId || !apiClient || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const endOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      const moreRes = await apiClient.listExpenses(workspaceId, {
        startDate: startOfMonth,
        endDate: endOfMonth,
        categoryId: selectedCategoryFilter || undefined,
        kind: (selectedKindFilter as 'expense' | 'income' | 'refund') || undefined,
        limit: 50,
        cursor: nextCursor,
      });

      setTransactions((prev) => [...prev, ...moreRes.data]);
      setNextCursor(moreRes.meta?.pagination?.nextCursor ?? null);
      setHasMore(Boolean(moreRes.meta?.pagination?.hasMore));
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to load more transactions.',
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleOpenCreateBudget = () => {
    setEditingBudget(null);
    setBudgetAmount('');
    setBudgetCurrency('USD');
    setBudgetCategoryId('');
    setIsBudgetSheetOpen(true);
  };

  const handleEditBudget = (budget: ExpenseBudget) => {
    setEditingBudget(budget);
    setBudgetAmount(budget.amountFormatted);
    setBudgetCurrency(budget.currency);
    setBudgetCategoryId(budget.categoryId || '');
    setIsBudgetSheetOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!workspaceId || !apiClient) return;
    if (!budgetAmount || !/^\d+(\.\d+)?$/.test(budgetAmount)) {
      setFeedback({ severity: 'danger', message: 'Please enter a valid budget amount.' });
      return;
    }
    try {
      if (editingBudget) {
        await apiClient.updateExpenseBudget(workspaceId, editingBudget.id, {
          amount: budgetAmount,
        });
      } else {
        await apiClient.createExpenseBudget(workspaceId, {
          period: periodString,
          currency: budgetCurrency,
          categoryId: budgetCategoryId || null,
          amount: budgetAmount,
        });
      }
      setIsBudgetSheetOpen(false);
      setEditingBudget(null);
      await loadData();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to save budget.',
      });
    }
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (!workspaceId || !apiClient) return;
    try {
      await apiClient.deleteExpenseBudget(workspaceId, budgetId);
      await loadData();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to delete budget.',
      });
    }
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
  }) => {
    if (!workspaceId || !apiClient) return;

    try {
      if (editingExpense) {
        await apiClient.updateExpense(workspaceId, editingExpense.id, {
          amount: data.amount,
          currency: data.currency,
          transactionDate: data.transactionDate,
          categoryId: data.categoryId,
          paymentLabel: data.paymentLabel,
          note: data.note,
          receiptFileId: data.receiptFileId,
          expectedRevision: editingExpense.revision,
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
        });
        // Clear cached draft
        if (draftStorageKey) {
          try {
            await defaultSecureStorage.deleteItemAsync(draftStorageKey);
            setCreateDraft(null);
          } catch {
            // ignore
          }
        }
      }
      setIsCaptureOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConflict =
        msg.toLowerCase().includes('conflict') ||
        msg.toLowerCase().includes('revision') ||
        msg.includes('409');
      if (isConflict) {
        setFeedback({
          severity: 'warning',
          message:
            'This transaction was modified elsewhere. Your view has been refreshed with the latest data. Please review and re-apply your changes.',
        });
        await loadData();
      } else {
        setFeedback({
          severity: 'danger',
          message: msg || 'Failed to save transaction.',
        });
      }
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!workspaceId || !apiClient) return;
    try {
      await apiClient.trashExpense(workspaceId, id);
      await loadData();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to delete transaction.',
      });
    }
  };

  const handleExportCsv = async () => {
    if (!workspaceId || !apiClient) return;
    try {
      const csvData = await apiClient.exportExpensesCsv(workspaceId, {
        startDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
        endDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(
          new Date(currentYear, currentMonth, 0).getDate()
        ).padStart(2, '0')}`,
        categoryId: selectedCategoryFilter || undefined,
        kind: (selectedKindFilter as 'expense' | 'income' | 'refund') || undefined,
      });

      await Share.share({
        title: `Expenses-${periodString}.csv`,
        message: csvData,
      });
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to export CSV.',
      });
    }
  };

  const handleEditExpense = async (tx: ExpenseItem) => {
    setEditingExpense(tx);
    if (tx.receiptFileId && workspaceId && apiClient) {
      try {
        const fileRes = await apiClient.getFileMetadata(workspaceId, tx.receiptFileId);
        if (fileRes?.data) {
          setAvailableReceipts([{ id: fileRes.data.id, fileName: fileRes.data.fileName }]);
        }
      } catch {
        setAvailableReceipts([]);
      }
    } else {
      setAvailableReceipts([]);
    }
    setIsCaptureOpen(true);
  };

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: palette.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border.subtle }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: palette.text.primary }]}>Expenses & Budgets</Text>
          <Text style={[styles.subtitle, { color: palette.text.secondary }]}>
            Exact currency accounting & spending controls
          </Text>
        </View>
        <MobileButton
          testID="btn-close-expenses"
          variant="subtle"
          themeMode={themeMode}
          onPress={onClose}
          accessibilityLabel="Close expenses"
        >
          <Icon name="x" /> Done
        </MobileButton>
      </View>

      {/* Month Navigator */}
      <View style={[styles.monthNav, { backgroundColor: palette.surfaceRaised }]}>
        <Pressable
          testID="btn-prev-month"
          onPress={handlePrevMonth}
          style={styles.navArrow}
          accessibilityLabel="Previous month"
        >
          <Text style={{ fontSize: 18, color: palette.text.primary }}>
            <Icon name="chevron-left" />
          </Text>
        </Pressable>
        <Text style={[styles.monthText, { color: palette.text.primary }]}>
          {MONTH_NAMES[currentMonth - 1]} {currentYear}
        </Text>
        <Pressable
          testID="btn-next-month"
          onPress={handleNextMonth}
          style={styles.navArrow}
          accessibilityLabel="Next month"
        >
          <Text style={{ fontSize: 18, color: palette.text.primary }}>
            <Icon name="play" />
          </Text>
        </Pressable>
      </View>

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <View style={{ flex: 1 }}>
          <MobileButton
            testID="btn-record-transaction"
            variant="primary"
            themeMode={themeMode}
            onPress={() => {
              setEditingExpense(null);
              setAvailableReceipts([]);
              setIsCaptureOpen(true);
            }}
            accessibilityLabel="Record new transaction"
          >
            <Icon name="plus" /> Record Transaction
          </MobileButton>
        </View>
        <View style={{ flex: 1 }}>
          <MobileButton
            testID="btn-export-csv"
            variant="secondary"
            themeMode={themeMode}
            onPress={handleExportCsv}
            accessibilityLabel="Export CSV"
          >
            <Icon name="download" /> Export CSV
          </MobileButton>
        </View>
      </View>

      {/* Feedback Banner */}
      {feedback && (
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
          <MobileFeedback severity={feedback.severity} message={feedback.message} />
        </View>
      )}
      {isLoading && (
        <View style={{ paddingHorizontal: spacing.md, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, color: palette.text.secondary, textAlign: 'center' }}>
            Updating expenses...
          </Text>
        </View>
      )}

      {/* Navigation Sub-Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: palette.border.subtle }]}>
        {(
          [
            { id: 'transactions', label: `Transactions (${transactions.length})` },
            { id: 'report', label: 'Monthly Report' },
            { id: 'budgets', label: `Budgets (${budgets.length})` },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              testID={`tab-${tab.id}`}
              onPress={() => setActiveTab(tab.id)}
              style={[
                styles.tabItem,
                isActive && { borderBottomColor: palette.action.primary, borderBottomWidth: 2 },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? palette.action.primary : palette.text.secondary,
                    fontWeight: isActive ? 'bold' : 'normal',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tab Contents */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'transactions' && (
          <View style={{ gap: spacing.sm }}>
            {/* Kind Filters */}
            <View style={styles.filterRow}>
              {(['', 'expense', 'income', 'refund'] as const).map((kind) => {
                const isSelected = selectedKindFilter === kind;
                return (
                  <Pressable
                    key={kind}
                    onPress={() => setSelectedKindFilter(kind)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isSelected
                          ? palette.action.primary
                          : palette.surfaceRaised,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: isSelected ? '#FFFFFF' : palette.text.primary },
                      ]}
                    >
                      {kind === '' ? 'All Types' : kind.charAt(0).toUpperCase() + kind.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Category Filters */}
            {categories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: spacing.xs }}
              >
                <View style={styles.filterRow}>
                  <Pressable
                    onPress={() => setSelectedCategoryFilter('')}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor:
                          selectedCategoryFilter === ''
                            ? palette.action.primary
                            : palette.surfaceRaised,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: selectedCategoryFilter === '' ? '#FFFFFF' : palette.text.primary },
                      ]}
                    >
                      All Categories
                    </Text>
                  </Pressable>
                  {categories.map((c) => {
                    const isSelected = selectedCategoryFilter === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setSelectedCategoryFilter(isSelected ? '' : c.id)}
                        style={[
                          styles.filterChip,
                          {
                            backgroundColor: isSelected
                              ? palette.action.primary
                              : palette.surfaceRaised,
                            borderColor: palette.border.subtle,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            { color: isSelected ? '#FFFFFF' : palette.text.primary },
                          ]}
                        >
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {transactions.length === 0 ? (
              <MobileEmptyState
                title="No Transactions"
                description="No transactions found for this month and filter. Record one to get started."
                themeMode={themeMode}
              />
            ) : (
              transactions.map((tx) => {
                const sign = tx.kind === 'income' ? '+' : tx.kind === 'refund' ? '+' : '-';
                const color =
                  tx.kind === 'income'
                    ? palette.status.success
                    : tx.kind === 'refund'
                      ? palette.action.primary
                      : palette.status.danger;
                const cat = categories.find((c) => c.id === tx.categoryId);

                return (
                  <MobileCard key={tx.id} themeMode={themeMode}>
                    <View style={styles.txRow}>
                      <View style={{ flex: 1, paddingRight: spacing.sm }}>
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
                        >
                          <Text style={[styles.txDate, { color: palette.text.secondary }]}>
                            {tx.transactionDate}
                          </Text>
                          {cat && (
                            <View
                              style={[
                                styles.catBadge,
                                { backgroundColor: cat.color ? `${cat.color}20` : '#F1F5F9' },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.catBadgeText,
                                  { color: cat.color || palette.text.primary },
                                ]}
                              >
                                {cat.name}
                              </Text>
                            </View>
                          )}
                          {tx.receiptFileId && (
                            <Text style={{ fontSize: 12 }} accessibilityLabel="Receipt attached">
                              <Icon name="attachment" />
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.txTitle, { color: palette.text.primary }]}>
                          {tx.note || tx.paymentLabel || 'Untitled transaction'}
                        </Text>
                        {tx.paymentLabel && tx.note && (
                          <Text style={[styles.txMeta, { color: palette.text.secondary }]}>
                            Via: {tx.paymentLabel}
                          </Text>
                        )}
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                        <Text style={[styles.txAmount, { color }]}>
                          {sign}
                          {tx.amountFormatted} {tx.currency}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                          <Pressable
                            onPress={() => handleEditExpense(tx)}
                            hitSlop={8}
                            accessibilityLabel={`Edit transaction ${tx.id}`}
                          >
                            <Text style={[styles.txAction, { color: palette.action.primary }]}>
                              Edit
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteExpense(tx.id)}
                            hitSlop={8}
                            accessibilityLabel={`Delete transaction ${tx.id}`}
                          >
                            <Text style={[styles.txAction, { color: palette.status.danger }]}>
                              Delete
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </MobileCard>
                );
              })
            )}
            {hasMore && (
              <View style={{ marginTop: spacing.sm, alignItems: 'center' }}>
                <MobileButton
                  variant="secondary"
                  themeMode={themeMode}
                  onPress={handleLoadMore}
                  disabled={isLoadingMore}
                  accessibilityLabel="Load more transactions"
                >
                  {isLoadingMore ? (<Icon name='Loading More...' />) : (<><Icon name='arrow-down' /> {'Load More Transactions'}</>)}
                </MobileButton>
              </View>
            )}
          </View>
        )}

        {activeTab === 'report' && (
          <View>
            {monthlySummaries.length === 0 ? (
              <MobileEmptyState
                title="No Spending Report"
                description="No summary data available for this month."
                themeMode={themeMode}
              />
            ) : (
              monthlySummaries.map((summary) => (
                <MobileExpenseReportView
                  key={summary.currency}
                  summary={summary}
                  themeMode={themeMode}
                />
              ))
            )}
          </View>
        )}

        {activeTab === 'budgets' && (
          <View style={{ gap: spacing.sm }}>
            <View style={{ marginBottom: spacing.xs }}>
              <MobileButton
                variant="primary"
                themeMode={themeMode}
                onPress={handleOpenCreateBudget}
                accessibilityLabel="Set monthly budget"
              >
                + Set Monthly Budget
              </MobileButton>
            </View>
            {budgets.length === 0 ? (
              <MobileEmptyState
                title="No Budgets Defined"
                description="Set monthly spending limits for categories or workspace currency."
                themeMode={themeMode}
              />
            ) : (
              budgets.map((b) => {
                const cat = categories.find((c) => c.id === b.categoryId);
                return (
                  <MobileCard key={b.id} themeMode={themeMode}>
                    <View style={styles.budgetRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.budgetCategory, { color: palette.text.primary }]}>
                          {cat ? cat.name : 'Overall Workspace Budget'}
                        </Text>
                        <Text style={[styles.budgetPeriod, { color: palette.text.secondary }]}>
                          Period: {b.period}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                        <Text style={[styles.budgetLimit, { color: palette.text.primary }]}>
                          Limit: {b.amountFormatted} {b.currency}
                        </Text>
                        {b.spentFormatted && (
                          <Text style={[styles.budgetSpent, { color: palette.text.secondary }]}>
                            Spent: {b.spentFormatted} {b.currency}
                          </Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                          <Pressable
                            onPress={() => handleEditBudget(b)}
                            hitSlop={8}
                            accessibilityLabel={`Edit budget for ${cat ? cat.name : 'workspace'}`}
                          >
                            <Text style={[styles.txAction, { color: palette.action.primary }]}>
                              Edit
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteBudget(b.id)}
                            hitSlop={8}
                            accessibilityLabel={`Delete budget for ${cat ? cat.name : 'workspace'}`}
                          >
                            <Text style={[styles.txAction, { color: palette.status.danger }]}>
                              Delete
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </MobileCard>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Capture / Edit Sheet */}
      <MobileExpenseCaptureSheet
        visible={isCaptureOpen}
        onClose={() => {
          setIsCaptureOpen(false);
          setEditingExpense(null);
        }}
        onSubmit={handleCreateOrUpdateExpense}
        categories={categories}
        availableReceipts={availableReceipts}
        receiptsEnabled={!isCorePreview}
        receiptsUnavailableMessage={
          isCorePreview
            ? 'Receipt uploads are off in this free testing preview. Save without a new receipt; existing links stay preserved.'
            : 'No receipt files are available to attach yet. You can still save the transaction.'
        }
        availableOriginalExpenses={eligibleOriginalExpenses}
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
            : createDraft || undefined
        }
        themeMode={themeMode}
      />

      {/* Budget Create / Edit Modal Sheet */}
      <MobileModalSheet
        visible={isBudgetSheetOpen}
        onClose={() => {
          setIsBudgetSheetOpen(false);
          setEditingBudget(null);
        }}
        title={editingBudget ? 'Edit Monthly Budget' : 'Set Monthly Budget'}
        themeMode={themeMode}
        testID="mobile-budget-sheet"
      >
        <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
          <MobileTextField
            label="Budget Amount"
            placeholder="e.g. 500.00"
            value={budgetAmount}
            onChangeText={setBudgetAmount}
            keyboardType="decimal-pad"
            themeMode={themeMode}
          />
          <MobileTextField
            label="Currency"
            placeholder="USD"
            value={budgetCurrency}
            onChangeText={(t) => setBudgetCurrency(t.toUpperCase())}
            themeMode={themeMode}
          />
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: palette.text.secondary }}>
              Target Category (Optional)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Pressable
                  onPress={() => setBudgetCategoryId('')}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        budgetCategoryId === '' ? palette.action.primary : palette.surfaceRaised,
                      borderColor:
                        budgetCategoryId === '' ? palette.action.primary : palette.border.subtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color:
                          budgetCategoryId === '' ? palette.action.label : palette.text.primary,
                      },
                    ]}
                  >
                    All Categories
                  </Text>
                </Pressable>
                {categories.map((c) => {
                  const isSelected = budgetCategoryId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setBudgetCategoryId(c.id)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected
                            ? palette.action.primary
                            : palette.surfaceRaised,
                          borderColor: isSelected ? palette.action.primary : palette.border.subtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          {
                            color: isSelected ? palette.action.label : palette.text.primary,
                          },
                        ]}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            <MobileButton
              variant="primary"
              themeMode={themeMode}
              onPress={handleSaveBudget}
              accessibilityLabel="Save budget"
            >
              Save Budget
            </MobileButton>
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={() => {
                setIsBudgetSheetOpen(false);
                setEditingBudget(null);
              }}
              accessibilityLabel="Cancel budget"
            >
              Cancel
            </MobileButton>
          </View>
        </View>
      </MobileModalSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  navArrow: {
    minWidth: touchTargets.mobileMin,
    minHeight: touchTargets.mobileMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  tabItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 14,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txDate: {
    fontSize: 11,
    fontWeight: '500',
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  txTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  txMeta: {
    fontSize: 12,
    marginTop: 1,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  txAction: {
    fontSize: 12,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetCategory: {
    fontSize: 15,
    fontWeight: '600',
  },
  budgetPeriod: {
    fontSize: 12,
    marginTop: 2,
  },
  budgetLimit: {
    fontSize: 14,
    fontWeight: '600',
  },
  budgetSpent: {
    fontSize: 12,
    marginTop: 2,
  },
});
