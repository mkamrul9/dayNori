'use client';

import { Icon } from './Icon.js';
import React, { useState, useEffect, useId } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button } from './Button.js';
import { TextField } from './TextField.js';
import { Feedback, type FeedbackSeverity } from './Feedback.js';

export interface ExpenseCaptureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
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
  }) => Promise<void> | void;
  categories: Array<{ id: string; name: string; color?: string | null }>;
  availableReceipts?: Array<{ id: string; fileName: string }>;
  availableOriginalExpenses?: Array<{
    id: string;
    amountFormatted?: string;
    amount?: string;
    currency: string;
    transactionDate: string;
    categoryId?: string | null;
    paymentLabel?: string | null;
    note?: string | null;
  }>;
  initialValues?: {
    kind?: 'expense' | 'income' | 'refund';
    amount?: string;
    currency?: string;
    transactionDate?: string;
    categoryId?: string | null;
    paymentLabel?: string | null;
    note?: string | null;
    receiptFileId?: string | null;
    originalExpenseId?: string | null;
    timezone?: string;
  };
  mode?: 'create' | 'edit';
}

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'JPY', 'CAD', 'AUD', 'INR', 'SGD'];

function getLocalCalendarDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const ExpenseCaptureDialog: React.FC<ExpenseCaptureDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  categories,
  availableReceipts = [],
  availableOriginalExpenses = [],
  initialValues,
  mode = 'create',
}) => {
  const titleId = useId();
  const descId = useId();

  const [kind, setKind] = useState<'expense' | 'income' | 'refund'>(
    initialValues?.kind || 'expense'
  );
  const [amount, setAmount] = useState<string>(initialValues?.amount || '');
  const [currency, setCurrency] = useState<string>(initialValues?.currency || 'USD');
  const [transactionDate, setTransactionDate] = useState<string>(
    initialValues?.transactionDate || getLocalCalendarDate()
  );
  const [categoryId, setCategoryId] = useState<string | null>(initialValues?.categoryId || null);
  const [paymentLabel, setPaymentLabel] = useState<string>(initialValues?.paymentLabel || '');
  const [note, setNote] = useState<string>(initialValues?.note || '');
  const [receiptFileId, setReceiptFileId] = useState<string | null>(
    initialValues?.receiptFileId || null
  );
  const [originalExpenseId, setOriginalExpenseId] = useState<string | null>(
    initialValues?.originalExpenseId || null
  );
  const [timezone, setTimezone] = useState<string>(
    initialValues?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );

  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setKind(initialValues?.kind || 'expense');
      setAmount(initialValues?.amount || '');
      setCurrency(initialValues?.currency || 'USD');
      setTransactionDate(initialValues?.transactionDate || getLocalCalendarDate());
      setCategoryId(initialValues?.categoryId || null);
      setPaymentLabel(initialValues?.paymentLabel || '');
      setNote(initialValues?.note || '');
      setReceiptFileId(initialValues?.receiptFileId || null);
      setOriginalExpenseId(initialValues?.originalExpenseId || null);
      setTimezone(
        initialValues?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      );
      setFeedback(null);
    }
  }, [isOpen, initialValues]);

  // When selecting an original expense for a refund, auto-sync category and currency
  const handleOriginalExpenseChange = (origId: string) => {
    setOriginalExpenseId(origId);
    const orig = availableOriginalExpenses.find((e) => e.id === origId);
    if (orig) {
      setCurrency(orig.currency);
      if (orig.categoryId) {
        setCategoryId(orig.categoryId);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    // Exact string validation: strictly decimal string, non-negative
    const trimmedAmount = amount.trim();
    if (!trimmedAmount || !/^\d+(\.\d{1,4})?$/.test(trimmedAmount)) {
      setFeedback({
        severity: 'danger',
        message: 'Amount must be an exact non-negative decimal string (e.g. 15.50 or 0).',
      });
      return;
    }

    if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      setFeedback({
        severity: 'danger',
        message: 'Transaction date must be a valid calendar date in YYYY-MM-DD format.',
      });
      return;
    }

    if (kind === 'refund' && !originalExpenseId) {
      setFeedback({
        severity: 'danger',
        message: 'Refund records must reference an original expense transaction.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        kind,
        amount: trimmedAmount,
        currency,
        transactionDate,
        categoryId: categoryId || null,
        paymentLabel: paymentLabel.trim() || null,
        note: note.trim() || null,
        receiptFileId: receiptFileId || null,
        originalExpenseId: kind === 'refund' ? originalExpenseId : null,
        timezone,
      });
      onClose();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to save expense record.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const palette = colors.light;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: radii.sheet,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: spacing.xl,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.md,
          fontFamily: typography.fontFamily.sans,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2
            id={titleId}
            style={{
              fontSize: typography.webScale.pageTitle,
              fontWeight: 'bold',
              color: palette.text.primary,
              margin: 0,
            }}
          >
            {mode === 'create' ? 'Record Transaction' : 'Edit Transaction'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: palette.text.secondary,
              padding: spacing.xs,
              minWidth: touchTargets.webMin,
              minHeight: touchTargets.webMin,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" />
          </button>
        </div>

        <p
          id={descId}
          style={{
            fontSize: typography.webScale.supporting,
            color: palette.text.secondary,
            margin: 0,
          }}
        >
          {mode === 'create'
            ? 'Quickly record an expense, income, or refund with exact currency arithmetic.'
            : 'Update this transaction with durable versioning and conflict detection.'}
        </p>

        {feedback && <Feedback severity={feedback.severity} message={feedback.message} />}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}
        >
          {/* Kind Selector */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: typography.webScale.supporting,
                fontWeight: '500',
                marginBottom: spacing.xs,
                color: palette.text.primary,
              }}
            >
              Transaction Type
            </label>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              {(['expense', 'income', 'refund'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  style={{
                    flex: 1,
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    borderRadius: radii.sm,
                    border: `2px solid ${kind === k ? '#2563EB' : '#E2E8F0'}`,
                    backgroundColor: kind === k ? '#EFF6FF' : '#F8FAFC',
                    color: kind === k ? '#1D4ED8' : '#475569',
                    fontWeight: kind === k ? 'bold' : 'normal',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    minHeight: touchTargets.webMin,
                  }}
                >
                  {k === 'expense' ? (
                    <>
                      <Icon name="wallet" /> Expense
                    </>
                  ) : k === 'income' ? (
                    <>
                      <Icon name="wallet" /> Income
                    </>
                  ) : (
                    <>
                      <Icon name="undo" /> Refund
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Amount & Currency */}
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <div style={{ flex: 2 }}>
              <TextField
                label="Amount"
                name="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                aria-label="Transaction Amount"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: typography.webScale.supporting,
                  fontWeight: '500',
                  marginBottom: spacing.xs,
                  color: palette.text.primary,
                }}
              >
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radii.sm,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: palette.text.primary,
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

          {/* Refund: Select Original Expense */}
          {kind === 'refund' && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: typography.webScale.supporting,
                  fontWeight: '500',
                  marginBottom: spacing.xs,
                  color: '#DC2626',
                }}
              >
                Original Expense to Refund *
              </label>
              <select
                value={originalExpenseId || ''}
                onChange={(e) => handleOriginalExpenseChange(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radii.sm,
                  border: '1px solid #DC2626',
                  backgroundColor: '#FEF2F2',
                  color: '#991B1B',
                  height: touchTargets.webMin,
                  fontSize: typography.webScale.supporting,
                }}
              >
                <option value="">-- Select Original Expense --</option>
                {availableOriginalExpenses.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.transactionDate} - {exp.amountFormatted || exp.amount} {exp.currency} (
                    {exp.note || exp.paymentLabel || 'No note'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category & Date */}
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: typography.webScale.supporting,
                  fontWeight: '500',
                  marginBottom: spacing.xs,
                  color: palette.text.primary,
                }}
              >
                Category
              </label>
              <select
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value || null)}
                disabled={kind === 'refund' && Boolean(originalExpenseId)}
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radii.sm,
                  border: '1px solid #CBD5E1',
                  backgroundColor:
                    kind === 'refund' && Boolean(originalExpenseId) ? '#F1F5F9' : '#FFFFFF',
                  color: palette.text.primary,
                  height: touchTargets.webMin,
                  fontSize: typography.webScale.body,
                }}
              >
                <option value="">(Uncategorized)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <TextField
                label="Date"
                name="transactionDate"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Payment Label & Timezone */}
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <div style={{ flex: 2 }}>
              <TextField
                label="Payment Label / Method"
                name="paymentLabel"
                value={paymentLabel}
                onChange={(e) => setPaymentLabel(e.target.value)}
                placeholder="e.g. Credit Card, Cash, bKash"
              />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                label="Timezone"
                name="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <TextField
              label="Note / Description"
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Grocery shopping at Agora, Client lunch"
            />
          </div>

          {/* Receipt Attachment Selector */}
          {availableReceipts.length > 0 && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: typography.webScale.supporting,
                  fontWeight: '500',
                  marginBottom: spacing.xs,
                  color: palette.text.primary,
                }}
              >
                Attach Receipt File
              </label>
              <select
                value={receiptFileId || ''}
                onChange={(e) => setReceiptFileId(e.target.value || null)}
                style={{
                  width: '100%',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radii.sm,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: palette.text.primary,
                  height: touchTargets.webMin,
                  fontSize: typography.webScale.supporting,
                }}
              >
                <option value="">(No Receipt Attached)</option>
                {availableReceipts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fileName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: spacing.sm,
              marginTop: spacing.sm,
            }}
          >
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : mode === 'create'
                  ? 'Record Transaction'
                  : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
