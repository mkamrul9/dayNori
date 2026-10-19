import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type { CurrencyMonthlySummary } from '@daynori/contracts';
import { MobileCard } from './MobileCard.js';

export interface MobileExpenseReportViewProps {
  summary: CurrencyMonthlySummary;
  themeMode?: ThemeMode;
}

export const MobileExpenseReportView: React.FC<MobileExpenseReportViewProps> = ({
  summary,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}>
      {/* Metric Cards */}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', flex: 1 }]}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#166534' }}>Income</Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#15803D', marginTop: 2 }}>
            {summary.totalIncomeFormatted} {summary.currency}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', flex: 1 }]}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#991B1B' }}>Gross Spending</Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#B91C1C', marginTop: 2 }}>
            {summary.grossExpenseFormatted} {summary.currency}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={[styles.card, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', flex: 1 }]}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#1E40AF' }}>Refunds</Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1D4ED8', marginTop: 2 }}>
            {summary.totalRefundFormatted} {summary.currency}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF', flex: 1 }]}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B21A8' }}>Net Spending</Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#7E22CE', marginTop: 2 }}>
            {summary.netExpenseFormatted} {summary.currency}
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle }]}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: palette.text.secondary }}>
          Net Savings (Income - Net Spending)
        </Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: summary.netSavingsMinorUnits.startsWith('-') ? '#DC2626' : '#059669',
            marginTop: 4,
          }}
        >
          {summary.netSavingsFormatted} {summary.currency}
        </Text>
      </View>

      {/* Category Breakdown */}
      <MobileCard themeMode={themeMode}>
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          <Text style={{ fontSize: 15, fontWeight: 'bold', color: palette.text.primary }}>
            Category Spending ({summary.categoryBreakdown.length})
          </Text>

          {summary.categoryBreakdown.map((cat, idx) => {
            const defaultColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
            const dotColor = cat.categoryColor || defaultColors[idx % defaultColors.length]!;

            return (
              <View
                key={cat.categoryId || `cat-${idx}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: spacing.xs,
                  borderBottomWidth: idx < summary.categoryBreakdown.length - 1 ? 1 : 0,
                  borderBottomColor: palette.border.subtle,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
                  <Text style={{ fontSize: 14, color: palette.text.primary, fontWeight: '500' }}>
                    {cat.categoryName || '(Uncategorized)'}
                  </Text>
                </View>

                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    color: cat.spentMinorUnits.startsWith('-') ? '#059669' : palette.text.primary,
                  }}
                >
                  {cat.spentFormatted} {summary.currency}
                </Text>
              </View>
            );
          })}
        </View>
      </MobileCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.md,
  },
});
