'use client';

import { Icon } from './Icon.js';
import React, { useState } from 'react';
import { colors, radii, spacing, typography, touchTargets } from '@daynori/design-tokens';
import type { CurrencyMonthlySummary } from '@daynori/contracts';
import { Button } from './Button.js';
import { Card } from './Card.js';

export interface ExpenseReportViewProps {
  summaries: CurrencyMonthlySummary[];
  year: number;
  month: number;
  onExportCsv?: (currency?: string) => void;
  isLoading?: boolean;
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

export const ExpenseReportView: React.FC<ExpenseReportViewProps> = ({
  summaries,
  year,
  month,
  onExportCsv,
  isLoading = false,
}) => {
  const [selectedCurrencyIndex, setSelectedCurrencyIndex] = useState<number>(0);
  const palette = colors.light;

  if (isLoading) {
    return (
      <Card>
        <div style={{ padding: spacing.xl, textAlign: 'center', color: palette.text.secondary }}>
          Loading monthly expense report...
        </div>
      </Card>
    );
  }

  if (summaries.length === 0) {
    return (
      <Card>
        <div style={{ padding: spacing.xl, textAlign: 'center', color: palette.text.secondary }}>
          <p style={{ fontSize: typography.webScale.sectionHeading, margin: 0 }}>
            No recorded transactions for {MONTH_NAMES[month - 1]} {year}.
          </p>
          <p style={{ fontSize: typography.webScale.supporting, marginTop: spacing.xs }}>
            Transactions recorded in this month will appear here segregated by currency.
          </p>
        </div>
      </Card>
    );
  }

  const activeSummary = summaries[selectedCurrencyIndex] || summaries[0]!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      {/* Currency Switcher & Export */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: spacing.sm,
        }}
      >
        <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
          <span
            style={{
              fontSize: typography.webScale.supporting,
              fontWeight: '500',
              color: palette.text.secondary,
            }}
          >
            Currency:
          </span>
          {summaries.map((s, idx) => (
            <button
              key={s.currency}
              type="button"
              onClick={() => setSelectedCurrencyIndex(idx)}
              style={{
                padding: `${spacing.xs}px ${spacing.md}px`,
                borderRadius: radii.sm,
                border: `2px solid ${idx === selectedCurrencyIndex ? '#2563EB' : '#CBD5E1'}`,
                backgroundColor: idx === selectedCurrencyIndex ? '#EFF6FF' : '#FFFFFF',
                color: idx === selectedCurrencyIndex ? '#1D4ED8' : '#334155',
                fontWeight: idx === selectedCurrencyIndex ? 'bold' : 'normal',
                cursor: 'pointer',
                minHeight: touchTargets.webMin,
              }}
            >
              {s.currency} ({s.transactionCount})
            </button>
          ))}
        </div>

        {onExportCsv && (
          <Button
            variant="secondary"
            onClick={() => onExportCsv(activeSummary.currency)}
            aria-label={`Export ${activeSummary.currency} transactions to CSV`}
          >
            <Icon name="download" /> Export CSV ({activeSummary.currency})
          </Button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: spacing.md,
        }}
      >
        {/* Total Income */}
        <div
          style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: radii.card,
            padding: spacing.md,
          }}
        >
          <div
            style={{ fontSize: typography.webScale.metadata, color: '#166534', fontWeight: '500' }}
          >
            Total Income
          </div>
          <div
            style={{
              fontSize: typography.webScale.pageTitle,
              fontWeight: 'bold',
              color: '#15803D',
              marginTop: spacing.xs,
            }}
          >
            {activeSummary.totalIncomeFormatted} {activeSummary.currency}
          </div>
        </div>

        {/* Gross Expenses */}
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: radii.card,
            padding: spacing.md,
          }}
        >
          <div
            style={{ fontSize: typography.webScale.metadata, color: '#991B1B', fontWeight: '500' }}
          >
            Gross Spending
          </div>
          <div
            style={{
              fontSize: typography.webScale.pageTitle,
              fontWeight: 'bold',
              color: '#B91C1C',
              marginTop: spacing.xs,
            }}
          >
            {activeSummary.grossExpenseFormatted} {activeSummary.currency}
          </div>
        </div>

        {/* Total Refunds */}
        <div
          style={{
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: radii.card,
            padding: spacing.md,
          }}
        >
          <div
            style={{ fontSize: typography.webScale.metadata, color: '#1E40AF', fontWeight: '500' }}
          >
            Total Refunds Received
          </div>
          <div
            style={{
              fontSize: typography.webScale.pageTitle,
              fontWeight: 'bold',
              color: '#1D4ED8',
              marginTop: spacing.xs,
            }}
          >
            {activeSummary.totalRefundFormatted} {activeSummary.currency}
          </div>
        </div>

        {/* Net Spending */}
        <div
          style={{
            backgroundColor: '#FAF5FF',
            border: '1px solid #E9D5FF',
            borderRadius: radii.card,
            padding: spacing.md,
          }}
        >
          <div
            style={{ fontSize: typography.webScale.metadata, color: '#6B21A8', fontWeight: '500' }}
          >
            Net Spending (Gross - Refunds)
          </div>
          <div
            style={{
              fontSize: typography.webScale.pageTitle,
              fontWeight: 'bold',
              color: '#7E22CE',
              marginTop: spacing.xs,
            }}
          >
            {activeSummary.netExpenseFormatted} {activeSummary.currency}
          </div>
        </div>

        {/* Net Savings */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: radii.card,
            padding: spacing.md,
          }}
        >
          <div
            style={{ fontSize: typography.webScale.metadata, color: '#334155', fontWeight: '500' }}
          >
            Net Savings (Income - Net Spending)
          </div>
          <div
            style={{
              fontSize: typography.webScale.pageTitle,
              fontWeight: 'bold',
              color: activeSummary.netSavingsMinorUnits.startsWith('-') ? '#DC2626' : '#059669',
              marginTop: spacing.xs,
            }}
          >
            {activeSummary.netSavingsFormatted} {activeSummary.currency}
          </div>
        </div>
      </div>

      {/* Accessible Category Breakdown */}
      <Card>
        <div style={{ padding: spacing.lg }}>
          <h3
            style={{
              fontSize: typography.webScale.sectionHeading,
              fontWeight: 'bold',
              color: palette.text.primary,
              margin: `0 0 ${spacing.md}px 0`,
            }}
          >
            Category Net Spending Breakdown
          </h3>

          {/* Accessible visual bar */}
          <div
            role="img"
            aria-label={`Category breakdown bar chart for ${activeSummary.currency}`}
            style={{
              display: 'flex',
              height: '24px',
              borderRadius: radii.sm,
              overflow: 'hidden',
              backgroundColor: '#E2E8F0',
              marginBottom: spacing.lg,
            }}
          >
            {activeSummary.categoryBreakdown.map((cat, idx) => {
              const spentNum = parseFloat(cat.spentFormatted);
              const totalNetNum = parseFloat(activeSummary.netExpenseFormatted);
              const percentage =
                totalNetNum > 0 && spentNum > 0 ? (spentNum / totalNetNum) * 100 : 0;
              if (percentage <= 0) return null;

              const defaultColors = [
                '#3B82F6',
                '#10B981',
                '#F59E0B',
                '#8B5CF6',
                '#EC4899',
                '#6366F1',
              ];
              const barColor = cat.categoryColor || defaultColors[idx % defaultColors.length]!;

              return (
                <div
                  key={cat.categoryId || 'uncategorized'}
                  title={`${cat.categoryName || 'Uncategorized'}: ${cat.spentFormatted} ${activeSummary.currency} (${percentage.toFixed(1)}%)`}
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: barColor,
                    transition: 'width 0.3s ease',
                  }}
                />
              );
            })}
          </div>

          {/* Accessible Table alternative */}
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontFamily: typography.fontFamily.sans,
              }}
            >
              <caption
                style={{
                  textAlign: 'left',
                  marginBottom: spacing.xs,
                  fontSize: typography.webScale.metadata,
                  color: palette.text.secondary,
                }}
              >
                Detailed tabular spending by category with exact arithmetic
              </caption>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                  <th
                    style={{
                      padding: spacing.sm,
                      fontSize: typography.webScale.supporting,
                      color: palette.text.secondary,
                    }}
                  >
                    Category
                  </th>
                  <th
                    style={{
                      padding: spacing.sm,
                      fontSize: typography.webScale.supporting,
                      color: palette.text.secondary,
                      textAlign: 'right',
                    }}
                  >
                    Net Spent
                  </th>
                  <th
                    style={{
                      padding: spacing.sm,
                      fontSize: typography.webScale.supporting,
                      color: palette.text.secondary,
                      textAlign: 'right',
                    }}
                  >
                    Transactions
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeSummary.categoryBreakdown.map((cat, idx) => {
                  const defaultColors = [
                    '#3B82F6',
                    '#10B981',
                    '#F59E0B',
                    '#8B5CF6',
                    '#EC4899',
                    '#6366F1',
                  ];
                  const dotColor = cat.categoryColor || defaultColors[idx % defaultColors.length]!;

                  return (
                    <tr
                      key={cat.categoryId || `uncat-${idx}`}
                      style={{ borderBottom: '1px solid #F1F5F9' }}
                    >
                      <td
                        style={{
                          padding: spacing.sm,
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.xs,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: dotColor,
                          }}
                        />
                        <span style={{ fontWeight: '500', color: palette.text.primary }}>
                          {cat.categoryName || '(Uncategorized)'}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: spacing.sm,
                          textAlign: 'right',
                          fontWeight: 'bold',
                          color: cat.spentMinorUnits.startsWith('-')
                            ? '#059669'
                            : palette.text.primary,
                        }}
                      >
                        {cat.spentFormatted} {activeSummary.currency}
                      </td>
                      <td
                        style={{
                          padding: spacing.sm,
                          textAlign: 'right',
                          color: palette.text.secondary,
                        }}
                      >
                        {cat.transactionCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
};
