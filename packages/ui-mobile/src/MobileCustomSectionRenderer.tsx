import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import {
  isBlockSupported,
  createFallbackBlockRepresentation,
  getArchivedFieldValues,
  type CustomBlockDefinition,
} from '@daynori/domain';
import type { ExistingRecordViewItemSummary } from '@daynori/contracts';
import { MobileButton } from './MobileButton.js';
import { MobileEmptyState } from './MobileEmptyState.js';
import { MobileTypeBadge } from './MobileTypeBadge.js';

export interface MobileCustomSectionRendererProps {
  section: {
    id: string;
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    placement: string;
  };
  blocks: (CustomBlockDefinition | Record<string, unknown>)[];
  records?: Array<{
    id: string;
    sectionId: string;
    schemaVersion: number;
    collectionBlockId?: string;
    values: Record<string, unknown>;
    archivedValues?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }>;
  existingRecordViewsData?: Record<string, ExistingRecordViewItemSummary[]>;
  themeMode?: ThemeMode;
  onAddEntry?: (collectionBlockId: string) => void;
  onOpenSourceItem?: (itemId: string, targetKind: string) => void;
  onEditEntry?: (record: {
    id: string;
    values: Record<string, unknown>;
    [key: string]: unknown;
  }) => void;
}

export const MobileCustomSectionRenderer: React.FC<MobileCustomSectionRendererProps> = ({
  section,
  blocks,
  records = [],
  existingRecordViewsData = {},
  themeMode = 'light',
  onAddEntry,
  onOpenSourceItem,
  onEditEntry,
}) => {
  const palette = colors[themeMode];

  return (
    <View style={{ gap: spacing.md, padding: spacing.md }}>
      {/* Section Header */}
      <View
        style={{
          borderBottomWidth: 1,
          borderColor: palette.border.subtle,
          paddingBottom: spacing.sm,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700', color: palette.text.primary }}>
          {section.title}
        </Text>
        {section.description && (
          <Text style={{ fontSize: 13, color: palette.text.secondary, marginTop: 2 }}>
            {section.description}
          </Text>
        )}
      </View>

      {/* Blocks */}
      {blocks.map((block) => {
        if (!isBlockSupported(block)) {
          const blockObj = block as { id?: string; type?: string; [key: string]: unknown };
          const fallback = createFallbackBlockRepresentation(blockObj);
          const blockKey = typeof blockObj.id === 'string' ? blockObj.id : 'unknown';
          return (
            <View
              key={blockKey}
              style={{
                padding: spacing.md,
                borderRadius: radii.sm,
                borderWidth: 1,
                borderColor: palette.border.strong,
                backgroundColor: palette.action.subtle,
              }}
            >
              <Text style={{ fontWeight: '600', color: palette.text.primary, marginBottom: 2 }}>
                {fallback.title} (Read-Only)
              </Text>
              <Text style={{ fontSize: 12, color: palette.text.secondary }}>
                {fallback.message}
              </Text>
            </View>
          );
        }

        if (block.type === 'field_collection') {
          const colBlock = block;
          const matching = records.filter(
            (r) => !r.collectionBlockId || r.collectionBlockId === colBlock.id
          );

          return (
            <View
              key={colBlock.id}
              style={{
                borderRadius: radii.sm,
                borderWidth: 1,
                borderColor: palette.border.subtle,
                backgroundColor: palette.surface,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '600', color: palette.text.primary, fontSize: 15 }}>
                  {colBlock.title}
                </Text>
                {onAddEntry && (
                  <MobileButton
                    variant="primary"
                    title="+ Add"
                    onPress={() => onAddEntry(colBlock.id)}
                  />
                )}
              </View>

              {matching.length === 0 ? (
                <MobileEmptyState
                  title="No entries yet"
                  description="Tap Add to record your first entry."
                  themeMode={themeMode}
                />
              ) : (
                matching.map((rec) => (
                  <Pressable
                    key={rec.id}
                    onPress={() => onEditEntry?.(rec)}
                    style={{
                      padding: spacing.sm,
                      borderRadius: radii.sm,
                      backgroundColor: palette.background,
                      borderWidth: 1,
                      borderColor: palette.border.subtle,
                      gap: 2,
                    }}
                  >
                    {colBlock.fields.map((f) => {
                      const val = rec.values[f.id];
                      const archives = getArchivedFieldValues(rec, f.id);
                      return (
                        <View
                          key={f.id}
                          style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                        >
                          <Text style={{ fontSize: 12, color: palette.text.secondary }}>
                            {f.label}:
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: '500',
                                color: palette.text.primary,
                              }}
                            >
                              {val !== undefined && val !== null ? String(val) : '—'}
                            </Text>
                            {archives.length > 0 && (
                              <Text style={{ fontSize: 10, color: palette.action.subtleText }}>
                                (+{archives.length} arch)
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </Pressable>
                ))
              )}
            </View>
          );
        }

        if (block.type === 'existing_record_view') {
          const viewBlock = block;
          const items = existingRecordViewsData[viewBlock.id] ?? [];

          return (
            <View
              key={viewBlock.id}
              style={{
                borderRadius: radii.sm,
                borderWidth: 1,
                borderColor: palette.border.subtle,
                backgroundColor: palette.surface,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <Text style={{ fontWeight: '600', color: palette.text.primary, fontSize: 15 }}>
                {viewBlock.title}
              </Text>
              <Text style={{ fontSize: 11, color: palette.text.secondary }}>
                Target: {viewBlock.targetKind}
              </Text>

              {items.length === 0 ? (
                <MobileEmptyState
                  title="No matching items"
                  description={`No active ${viewBlock.targetKind} found.`}
                  themeMode={themeMode}
                />
              ) : (
                items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => onOpenSourceItem?.(item.id, item.targetKind)}
                    style={{
                      padding: spacing.sm,
                      borderRadius: radii.sm,
                      borderWidth: 1,
                      borderColor: palette.border.strong,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.xs,
                        flex: 1,
                      }}
                    >
                      <MobileTypeBadge kind={item.targetKind} themeMode={themeMode} />
                      <Text
                        numberOfLines={1}
                        style={{
                          fontWeight: '600',
                          color: palette.text.primary,
                          flex: 1,
                          fontSize: 13,
                        }}
                      >
                        {item.title}
                      </Text>
                    </View>
                    {item.status && (
                      <Text style={{ fontSize: 11, color: palette.text.secondary }}>
                        {item.status}
                      </Text>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          );
        }

        return null;
      })}
    </View>
  );
};
