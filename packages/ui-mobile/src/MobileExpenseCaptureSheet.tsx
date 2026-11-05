import { Icon } from './Icon.js';
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, ScrollView, Pressable, StyleSheet } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';

export interface MobileExpenseCaptureSheetProps {
  visible: boolean;
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
  }) => Promise<void> | void;
  categories: Array<{ id: string; name: string; color?: string | null }>;
  availableOriginalExpenses?: Array<{
    id: string;
    amountFormatted?: string;
    amount?: string;
    currency: string;
    transactionDate: string;
    categoryId?: string | null;
  }>;
  availableReceipts?: Array<{ id: string; fileName?: string; filename?: string }>;
  /** When false, receipt picker is hidden and an honest unavailable message is shown. */
  receiptsEnabled?: boolean;
  receiptsUnavailableMessage?: string;
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
  };
  themeMode?: ThemeMode;
}

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'JPY', 'CAD', 'AUD', 'INR', 'SGD'];

function getLocalCalendarDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const MobileExpenseCaptureSheet: React.FC<MobileExpenseCaptureSheetProps> = ({
  visible,
  onClose,
  onSubmit,
  categories,
  availableOriginalExpenses = [],
  availableReceipts = [],
  receiptsEnabled = true,
  receiptsUnavailableMessage = 'Receipt attachment is unavailable here. You can still save without a receipt.',
  initialValues,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];

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

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);

  useEffect(() => {
    if (visible && initialValues) {
      setKind(initialValues.kind || 'expense');
      setAmount(initialValues.amount || '');
      setCurrency(initialValues.currency || 'USD');
      setTransactionDate(initialValues.transactionDate || getLocalCalendarDate());
      setCategoryId(initialValues.categoryId || null);
      setPaymentLabel(initialValues.paymentLabel || '');
      setNote(initialValues.note || '');
      setReceiptFileId(initialValues.receiptFileId || null);
      setOriginalExpenseId(initialValues.originalExpenseId || null);
      setErrorMsg(null);
    }
  }, [visible, initialValues]);

  const handleSubmit = async () => {
    setErrorMsg(null);
    const trimmed = amount.trim();
    if (!trimmed || !/^\d+(\.\d{1,4})?$/.test(trimmed)) {
      setErrorMsg('Amount must be an exact non-negative decimal string (e.g. 25.50 or 0).');
      return;
    }

    if (kind === 'refund' && !originalExpenseId) {
      setErrorMsg('Refund records must reference an original expense transaction.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        kind,
        amount: trimmed,
        currency,
        transactionDate,
        categoryId: categoryId || null,
        paymentLabel: paymentLabel.trim() || null,
        note: note.trim() || null,
        receiptFileId: receiptFileId || null,
        originalExpenseId: kind === 'refund' ? originalExpenseId : null,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text.primary }]}>Record Transaction</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <Text style={{ fontSize: 18, color: palette.text.secondary }}>
                <Icon name="x" color={palette.text.secondary} size={18} />
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
          >
            {errorMsg && (
              <MobileFeedback severity="danger" message={errorMsg} themeMode={themeMode} />
            )}

            {/* Kind Switcher */}
            <View style={styles.segmentContainer}>
              {(['expense', 'income', 'refund'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  accessibilityRole="button"
                  accessibilityLabel={k}
                  style={[
                    styles.segmentButton,
                    kind === k && { backgroundColor: palette.action.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: kind === k ? palette.action.label : palette.text.secondary },
                    ]}
                  >
                    {k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Refund'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Amount & Currency */}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 2 }}>
                <Text style={[styles.label, { color: palette.text.primary }]}>Amount</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={palette.text.muted}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Amount"
                  style={[
                    styles.input,
                    {
                      borderColor: palette.border.strong,
                      color: palette.text.primary,
                      backgroundColor: palette.surfaceRaised,
                    },
                  ]}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: palette.text.primary }]}>Currency</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCurrency(c)}
                      accessibilityRole="button"
                      accessibilityLabel={`Currency ${c}`}
                      accessibilityState={{ selected: currency === c }}
                      style={[
                        styles.chip,
                        currency === c && { backgroundColor: palette.action.primary },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: currency === c ? '#fff' : palette.text.primary,
                        }}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Refund Original Expense Picker */}
            {kind === 'refund' && availableOriginalExpenses.length > 0 && (
              <View>
                <Text style={[styles.label, { color: '#DC2626' }]}>Original Expense to Refund</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.xs }}
                >
                  {availableOriginalExpenses.map((exp) => (
                    <Pressable
                      key={exp.id}
                      onPress={() => {
                        setOriginalExpenseId(exp.id);
                        setCurrency(exp.currency);
                        if (exp.categoryId) setCategoryId(exp.categoryId);
                      }}
                      style={[
                        styles.chip,
                        originalExpenseId === exp.id && {
                          backgroundColor: '#DC2626',
                          borderColor: '#DC2626',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: originalExpenseId === exp.id ? '#fff' : palette.text.primary,
                        }}
                      >
                        {exp.transactionDate} ({exp.amountFormatted || exp.amount} {exp.currency})
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Date (required) */}
            <View>
              <Text style={[styles.label, { color: palette.text.primary }]}>Date (YYYY-MM-DD)</Text>
              <TextInput
                value={transactionDate}
                onChangeText={setTransactionDate}
                placeholder="2026-10-19"
                placeholderTextColor={palette.text.muted}
                accessibilityLabel="Transaction date"
                style={[
                  styles.input,
                  {
                    borderColor: palette.border.strong,
                    color: palette.text.primary,
                    backgroundColor: palette.surfaceRaised,
                  },
                ]}
              />
            </View>

            {!receiptsEnabled && (
              <MobileFeedback
                severity="info"
                message={receiptsUnavailableMessage}
                themeMode={themeMode}
              />
            )}

            <Pressable
              onPress={() => setDetailsOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              accessibilityLabel={
                detailsOpen
                  ? 'Hide optional details'
                  : 'Show details for category, note, receipt, and payment'
              }
            >
              <Text style={{ fontWeight: '600', color: palette.action.primary }}>
                {detailsOpen ? 'Hide details' : 'Details'} — category, note, receipt, payment
              </Text>
            </Pressable>

            {detailsOpen && (
              <>
                <View>
                  <Text style={[styles.label, { color: palette.text.primary }]}>Category</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: spacing.xs }}
                  >
                    <Pressable
                      onPress={() => setCategoryId(null)}
                      style={[
                        styles.chip,
                        categoryId === null && { backgroundColor: palette.action.primary },
                      ]}
                    >
                      <Text style={{ color: categoryId === null ? '#fff' : palette.text.primary }}>
                        Uncategorized
                      </Text>
                    </Pressable>
                    {categories.map((cat) => (
                      <Pressable
                        key={cat.id}
                        onPress={() => setCategoryId(cat.id)}
                        style={[
                          styles.chip,
                          categoryId === cat.id && { backgroundColor: palette.action.primary },
                        ]}
                      >
                        <Text
                          style={{ color: categoryId === cat.id ? '#fff' : palette.text.primary }}
                        >
                          {cat.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <View>
                  <Text style={[styles.label, { color: palette.text.primary }]}>
                    Payment Method / Label
                  </Text>
                  <TextInput
                    value={paymentLabel}
                    onChangeText={setPaymentLabel}
                    placeholder="e.g. Card, Cash, bKash"
                    placeholderTextColor={palette.text.muted}
                    style={[
                      styles.input,
                      {
                        borderColor: palette.border.strong,
                        color: palette.text.primary,
                        backgroundColor: palette.surfaceRaised,
                      },
                    ]}
                  />
                </View>

                <View>
                  <Text style={[styles.label, { color: palette.text.primary }]}>Note</Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Description of transaction"
                    placeholderTextColor={palette.text.muted}
                    style={[
                      styles.input,
                      {
                        borderColor: palette.border.strong,
                        color: palette.text.primary,
                        backgroundColor: palette.surfaceRaised,
                      },
                    ]}
                  />
                </View>

                {receiptsEnabled && availableReceipts.length > 0 ? (
                  <View>
                    <Text style={[styles.label, { color: palette.text.primary }]}>
                      Attached Receipt
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: spacing.xs }}
                    >
                      <Pressable
                        onPress={() => setReceiptFileId(null)}
                        style={[
                          styles.chip,
                          receiptFileId === null && { backgroundColor: palette.action.primary },
                        ]}
                      >
                        <Text
                          style={{ color: receiptFileId === null ? '#fff' : palette.text.primary }}
                        >
                          None
                        </Text>
                      </Pressable>
                      {availableReceipts.map((file) => (
                        <Pressable
                          key={file.id}
                          onPress={() => setReceiptFileId(file.id)}
                          style={[
                            styles.chip,
                            receiptFileId === file.id && {
                              backgroundColor: palette.action.primary,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: receiptFileId === file.id ? '#fff' : palette.text.primary,
                            }}
                          >
                            <Icon
                              name="attachment"
                              color={receiptFileId === file.id ? '#fff' : palette.text.primary}
                            />{' '}
                            {file.fileName || file.filename}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : receiptsEnabled ? (
                  <MobileFeedback
                    severity="info"
                    message={receiptsUnavailableMessage}
                    themeMode={themeMode}
                  />
                ) : null}
              </>
            )}

            {/* Actions */}
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <MobileButton
                title={isSubmitting ? 'Saving...' : 'Save Transaction'}
                onPress={handleSubmit}
                disabled={isSubmitting}
                themeMode={themeMode}
              />
              <MobileButton
                title="Cancel"
                variant="secondary"
                onPress={onClose}
                disabled={isSubmitting}
                themeMode={themeMode}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    maxHeight: '85%',
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  body: {
    marginTop: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    height: touchTargets.mobileMin,
    fontSize: 15,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: radii.sm,
    backgroundColor: '#E2E8F0',
    padding: 2,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: radii.sm - 2,
    minHeight: 36,
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
