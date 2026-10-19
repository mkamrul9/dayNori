'use client';

import React, { useState } from 'react';
import { colors, radii, spacing, typography, touchTargets } from '@daynori/design-tokens';
import type { ExpenseBudget } from '@daynori/contracts';
import { formatMinorUnitsToDecimal } from '@daynori/domain';
import { Button } from './Button.js';
import { Card } from './Card.js';
import { TextField } from './TextField.js';
import { Feedback, type FeedbackSeverity } from './Feedback.js';

export interface ExpenseBudgetViewProps {
  budgets: ExpenseBudget[];
  period: string; // YYYY-MM
  categories: Array<{ id: string; name: string }>;
  onCreateBudget: (data: { period: string; currency: string; categoryId?: string | null; amount: string }) => Promise<void>;
  onUpdateBudget: (budgetId: string, amount: string) => Promise<void>;
  onDeleteBudget: (budgetId: string) => Promise<void>;
  isLoading?: boolean;
}

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'JPY', 'CAD', 'AUD'];

export const ExpenseBudgetView: React.FC<ExpenseBudgetViewProps> = ({
  budgets,
  period,
  categories,
  onCreateBudget,
  onUpdateBudget,
  onDeleteBudget,
  isLoading = false,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [editingBudget, setEditingBudget] = useState<ExpenseBudget | null>(null);

  const [formCurrency, setFormCurrency] = useState<string>('USD');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formFeedback, setFormFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const palette = colors.light;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    const trimmed = formAmount.trim();
    if (!trimmed || !/^\d+(\.\d{1,4})?$/.test(trimmed)) {
      setFormFeedback({
        severity: 'danger',
        message: 'Budget amount must be an exact non-negative decimal string (e.g. 500.00 or 0).',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateBudget({
        period,
        currency: formCurrency,
        categoryId: formCategoryId || null,
        amount: trimmed,
      });
      setIsCreateOpen(false);
      setFormAmount('');
      setFormCategoryId('');
    } catch (err: unknown) {
      setFormFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to create budget.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBudget) return;
    setFormFeedback(null);

    const trimmed = formAmount.trim();
    if (!trimmed || !/^\d+(\.\d{1,4})?$/.test(trimmed)) {
      setFormFeedback({
        severity: 'danger',
        message: 'Budget amount must be an exact non-negative decimal string.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdateBudget(editingBudget.id, trimmed);
      setEditingBudget(null);
      setFormAmount('');
    } catch (err: unknown) {
      setFormFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to update budget.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ padding: spacing.xl, textAlign: 'center', color: palette.text.secondary }}>
          Loading budgets for {period}...
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      {/* Header & Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <div>
          <h3 style={{ fontSize: typography.webScale.sectionHeading, fontWeight: 'bold', margin: 0, color: palette.text.primary }}>
            Monthly Budgets ({period})
          </h3>
          <p style={{ fontSize: typography.webScale.supporting, color: palette.text.secondary, margin: `${spacing.xs}px 0 0 0` }}>
            Track planned targets against actual net spending. Information is presented neutrally without financial advice.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
          ➕ Set New Budget
        </Button>
      </div>

      {/* Budget List */}
      {budgets.length === 0 ? (
        <Card>
          <div style={{ padding: spacing.xl, textAlign: 'center', color: palette.text.secondary }}>
            <p style={{ fontSize: typography.webScale.body, margin: 0 }}>No budgets configured for {period}.</p>
            <p style={{ fontSize: typography.webScale.supporting, marginTop: spacing.xs }}>
              Create an overall or category-specific budget to track monthly spending progress.
            </p>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: spacing.md }}>
          {budgets.map((b) => {
            const budgetMinor = BigInt(b.amountMinorUnits || '0');
            const spentMinor = BigInt(b.spentMinorUnits || '0');
            const isExceeded = spentMinor > budgetMinor;
            const diffMinor = isExceeded ? spentMinor - budgetMinor : budgetMinor - spentMinor;

            // Approximate percentage for progress width only (derived ratio, bounded [0, 100])
            const percent = budgetMinor > 0n ? Number((spentMinor * 10000n) / budgetMinor) / 100 : (spentMinor > 0n ? 100 : 0);
            const isNear = percent >= 80 && !isExceeded;
            const progressWidth = Math.min(Math.max(percent, 0), 100);

            // Neutral, factual tracking messages using exact integer minor units
            let trackingMessage = '';
            if (isExceeded) {
              const diff = formatMinorUnitsToDecimal(diffMinor, b.currency);
              trackingMessage = `${percent.toFixed(1)}% of budget used. Exceeded planned budget by ${diff} ${b.currency}.`;
            } else if (spentMinor < 0n) {
              const diff = formatMinorUnitsToDecimal(-spentMinor, b.currency);
              trackingMessage = `Net refunds exceed expenses in this period by ${diff} ${b.currency}.`;
            } else {
              const remaining = formatMinorUnitsToDecimal(diffMinor, b.currency);
              trackingMessage = `${percent.toFixed(1)}% of budget used. ${remaining} ${b.currency} remaining in ${period}.`;
            }

            return (
              <Card key={b.id}>
                <div style={{ padding: spacing.lg, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: typography.webScale.metadata,
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          padding: `${spacing.xs}px ${spacing.sm}px`,
                          borderRadius: radii.sm,
                          backgroundColor: b.categoryId ? '#EFF6FF' : '#F1F5F9',
                          color: b.categoryId ? '#1D4ED8' : '#475569',
                          marginBottom: spacing.xs,
                        }}
                      >
                        {b.categoryName ? `Category: ${b.categoryName}` : 'Overall Workspace Budget'}
                      </span>
                      <h4
                        style={{
                          fontSize: typography.webScale.body,
                          fontWeight: 'bold',
                          margin: 0,
                          color: palette.text.primary,
                        }}
                      >
                        Target: {b.amountFormatted} {b.currency}
                      </h4>
                    </div>

                    <div style={{ display: 'flex', gap: spacing.xs }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBudget(b);
                          setFormAmount(b.amountFormatted);
                          setFormFeedback(null);
                        }}
                        aria-label={`Edit budget for ${b.categoryName || 'overall'}`}
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
                        onClick={() => onDeleteBudget(b.id)}
                        aria-label={`Delete budget for ${b.categoryName || 'overall'}`}
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

                  {/* Progress Bar */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: typography.webScale.metadata,
                        color: palette.text.secondary,
                        marginBottom: spacing.xs,
                      }}
                    >
                      <span>Spent: {b.spentFormatted || '0.00'} {b.currency}</span>
                      <span>{percent.toFixed(0)}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={Math.round(percent)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Budget usage: ${trackingMessage}`}
                      style={{
                        width: '100%',
                        height: '10px',
                        backgroundColor: '#E2E8F0',
                        borderRadius: radii.pill,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${progressWidth}%`,
                          height: '100%',
                          backgroundColor: isExceeded ? '#EF4444' : isNear ? '#F59E0B' : '#10B981',
                          borderRadius: radii.pill,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Factual Tracking Message */}
                  <div
                    style={{
                      fontSize: typography.webScale.metadata,
                      color: isExceeded ? '#B91C1C' : isNear ? '#B45309' : '#047857',
                      backgroundColor: isExceeded ? '#FEF2F2' : isNear ? '#FFFBEB' : '#ECFDF5',
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      borderRadius: radii.sm,
                    }}
                  >
                    {trackingMessage}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Budget Modal */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: spacing.md,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: radii.sheet,
              width: '100%',
              maxWidth: '460px',
              padding: spacing.xl,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.md,
              fontFamily: typography.fontFamily.sans,
            }}
          >
            <h3 style={{ margin: 0, fontSize: typography.webScale.sectionHeading, fontWeight: 'bold' }}>
              Set Monthly Budget ({period})
            </h3>
            {formFeedback && <Feedback severity={formFeedback.severity} message={formFeedback.message} />}

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <div style={{ display: 'flex', gap: spacing.sm }}>
                <div style={{ flex: 2 }}>
                  <TextField
                    label="Budget Amount"
                    name="amount"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="500.00"
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: typography.webScale.supporting, marginBottom: spacing.xs }}>Currency</label>
                  <select
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                    style={{
                      width: '100%',
                      padding: `${spacing.sm}px ${spacing.md}px`,
                      borderRadius: radii.sm,
                      border: '1px solid #CBD5E1',
                      height: touchTargets.webMin,
                      fontSize: typography.webScale.body,
                    }}
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: typography.webScale.supporting, marginBottom: spacing.xs }}>
                  Scope / Category
                </label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    borderRadius: radii.sm,
                    border: '1px solid #CBD5E1',
                    height: touchTargets.webMin,
                    fontSize: typography.webScale.body,
                  }}
                >
                  <option value="">Overall Workspace Budget (All Categories)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      Category: {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm }}>
                <Button variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Budget'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Budget Modal */}
      {editingBudget && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: spacing.md,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingBudget(null);
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: radii.sheet,
              width: '100%',
              maxWidth: '460px',
              padding: spacing.xl,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.md,
              fontFamily: typography.fontFamily.sans,
            }}
          >
            <h3 style={{ margin: 0, fontSize: typography.webScale.sectionHeading, fontWeight: 'bold' }}>
              Edit Budget: {editingBudget.categoryName || 'Overall'} ({editingBudget.currency})
            </h3>
            {formFeedback && <Feedback severity={formFeedback.severity} message={formFeedback.message} />}

            <form onSubmit={handleUpdateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <TextField
                label={`Budget Amount (${editingBudget.currency})`}
                name="amount"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="500.00"
                required
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm }}>
                <Button variant="secondary" onClick={() => setEditingBudget(null)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Updating...' : 'Update Budget'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
