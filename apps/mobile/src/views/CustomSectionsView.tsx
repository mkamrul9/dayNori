import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileButton,
  MobileCard,
  MobileCustomSectionEntrySheet,
  MobileCustomSectionRenderer,
  MobileEmptyState,
  MobileFeedback,
} from '@daynori/ui-mobile';
import {
  APPROVED_CUSTOM_SECTION_TEMPLATES,
  type CustomBlockDefinition,
  type ExistingRecordViewBlock,
  type FieldCollectionBlock,
  type CustomSectionStarterTemplate,
} from '@daynori/domain';
import type {
  CreateCustomSectionRequest,
  CustomSectionItem,
  CustomSectionRecordItem,
  ExistingRecordViewItemSummary,
} from '@daynori/contracts';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface MobileRecordViewData {
  id: string;
  sectionId: string;
  schemaVersion: number;
  collectionBlockId?: string;
  collectionId?: string;
  folderId?: string | null;
  values?: Record<string, unknown>;
  fieldValues?: Record<string, unknown>;
  archivedValues?: Record<string, unknown>;
  revision?: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface CustomSectionsViewProps {
  themeMode: ThemeMode;
  workspaceId: string;
  apiClient: DaynoriApiClient | null;
  onClose: () => void;
  onOpenSourceItem?: (itemId: string, targetKind: string) => void;
}

export const CustomSectionsView: React.FC<CustomSectionsViewProps> = ({
  themeMode,
  workspaceId,
  apiClient,
  onClose,
  onOpenSourceItem,
}) => {
  const palette = colors[themeMode];

  const [sections, setSections] = useState<CustomSectionItem[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [records, setRecords] = useState<MobileRecordViewData[]>([]);
  const [existingRecordViewsData, setExistingRecordViewsData] = useState<
    Record<string, ExistingRecordViewItemSummary[]>
  >({});
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string }>>([]);

  const [isEntrySheetVisible, setIsEntrySheetVisible] = useState(false);
  const [activeCollectionBlock, setActiveCollectionBlock] = useState<FieldCollectionBlock | null>(null);
  const [activeEditingRecord, setActiveEditingRecord] = useState<MobileRecordViewData | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Load Sections & Folders
  const loadWorkspaceSections = useCallback(async () => {
    if (!apiClient || !workspaceId) return;
    setIsLoading(true);
    try {
      const [secRes, foldRes] = await Promise.all([
        apiClient.listCustomSections(workspaceId),
        apiClient.listFolders(workspaceId).catch(() => ({ data: [] })),
      ]);

      const loaded = secRes.data || [];
      setSections(loaded);
      setAvailableFolders(
        (foldRes.data || []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
      );

      if (loaded.length > 0 && !selectedSectionId) {
        setSelectedSectionId(loaded[0]!.id);
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load sections.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, workspaceId, selectedSectionId]);

  useEffect(() => {
    loadWorkspaceSections();
  }, [loadWorkspaceSections]);

  const activeSection = sections.find((s) => s.id === selectedSectionId) || null;

  // 2. Load Records and Views
  const loadSectionData = useCallback(async () => {
    if (!apiClient || !workspaceId || !activeSection) return;

    try {
      const recRes = await apiClient.listCustomSectionRecords(workspaceId, activeSection.id);
      const mapped: MobileRecordViewData[] = (recRes.data || []).map((r: CustomSectionRecordItem) => ({
        id: r.id,
        sectionId: r.sectionId,
        schemaVersion: r.schemaVersion,
        collectionBlockId: r.collectionId,
        collectionId: r.collectionId,
        folderId: r.folderId,
        values: r.fieldValues || {},
        fieldValues: r.fieldValues || {},
        archivedValues: r.archivedValues,
        revision: r.revision,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
      setRecords(mapped);

      const viewsMap: Record<string, ExistingRecordViewItemSummary[]> = {};
      const viewBlocks = (activeSection.currentSchema?.blocks || []).filter(
        (b: CustomBlockDefinition) => b.type === 'existing_record_view'
      );
      for (const b of viewBlocks) {
        const vb = b as ExistingRecordViewBlock;
        try {
          const filter = vb.filter;
          const queryPayload = filter
            ? {
                status: filter.status,
                folderId: filter.folderId,
                tags: filter.tags,
              }
            : undefined;
          const vRes = await apiClient.queryExistingRecordView(workspaceId, activeSection.id, vb.id, queryPayload);
          viewsMap[vb.id] = vRes.data || [];
        } catch {
          viewsMap[vb.id] = [];
        }
      }
      setExistingRecordViewsData(viewsMap);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load records.',
      });
    }
  }, [apiClient, workspaceId, activeSection]);

  useEffect(() => {
    if (activeSection) {
      loadSectionData();
    } else {
      setRecords([]);
      setExistingRecordViewsData({});
    }
  }, [activeSection, loadSectionData]);

  // 3. Create from Starter
  const handleCreateFromStarter = async (starter: CustomSectionStarterTemplate) => {
    if (!apiClient || !workspaceId) return;
    try {
      setIsLoading(true);
      const res = await apiClient.createCustomSection(workspaceId, {
        name: starter.name,
        description: starter.description,
        icon: starter.icon,
        layoutMode: starter.layoutMode || 'single_column',
        initialSchema: starter.schema as unknown as CreateCustomSectionRequest['initialSchema'],
      });
      setFeedback({ type: 'success', message: `Created "${starter.name}".` });
      await loadWorkspaceSections();
      setSelectedSectionId(res.data.id);
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create starter.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Entry Add / Edit
  const handleAddEntry = (colBlockId: string) => {
    if (!activeSection) return;
    const col = activeSection.currentSchema?.blocks.find(
      (b: CustomBlockDefinition) => b.id === colBlockId && b.type === 'field_collection'
    ) as FieldCollectionBlock | undefined;

    if (col) {
      setActiveCollectionBlock(col);
      setActiveEditingRecord(null);
      setIsEntrySheetVisible(true);
    }
  };

  const handleEditEntry = (rec: {
    id: string;
    values?: Record<string, unknown>;
    fieldValues?: Record<string, unknown>;
    [key: string]: unknown;
  }) => {
    if (!activeSection) return;
    const colId = (rec.collectionId || rec.collectionBlockId) as string | undefined;
    const col = activeSection.currentSchema?.blocks.find(
      (b: CustomBlockDefinition) => b.id === colId && b.type === 'field_collection'
    ) as FieldCollectionBlock | undefined;

    if (col) {
      setActiveCollectionBlock(col);
      const fullRecord = records.find((r) => r.id === rec.id) || null;
      setActiveEditingRecord(fullRecord);
      setIsEntrySheetVisible(true);
    }
  };

  const handleSaveEntry = async (data: {
    fieldValues: Record<string, unknown>;
    folderId?: string | null;
    collectionId: string;
  }) => {
    if (!apiClient || !workspaceId || !activeSection) return;

    if (activeEditingRecord) {
      await apiClient.updateCustomSectionRecord(
        workspaceId,
        activeSection.id,
        activeEditingRecord.id,
        {
          expectedRevision: activeEditingRecord.revision ?? 1,
          fieldValues: data.fieldValues,
          folderId: data.folderId,
          collectionId: data.collectionId,
        }
      );
      setFeedback({ type: 'success', message: 'Entry updated.' });
    } else {
      await apiClient.createCustomSectionRecord(workspaceId, activeSection.id, {
        collectionId: data.collectionId,
        fieldValues: data.fieldValues,
        folderId: data.folderId,
      });
      setFeedback({ type: 'success', message: 'Entry added.' });
    }
    await loadSectionData();
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: spacing.md,
          borderBottomWidth: 1,
          borderColor: palette.border.subtle,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: '700', color: palette.text.primary }}>
          Custom Sections
        </Text>
        <MobileButton variant="subtle" title="✕ Done" onPress={onClose} themeMode={themeMode} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {feedback && (
          <MobileFeedback
            severity={feedback.type === 'error' ? 'danger' : feedback.type}
            message={feedback.message}
            themeMode={themeMode}
          />
        )}

        {/* Section Tabs */}
        {sections.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {sections.map((sec) => {
                const isSelected = sec.id === selectedSectionId;
                return (
                  <Pressable
                    key={sec.id}
                    onPress={() => setSelectedSectionId(sec.id)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: radii.sm,
                      backgroundColor: isSelected ? palette.action.primary : palette.surface,
                      borderWidth: 1,
                      borderColor: palette.border.subtle,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected ? '700' : '400',
                        color: isSelected ? palette.action.label : palette.text.primary,
                      }}
                    >
                      {sec.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Starters quick add */}
        <MobileCard themeMode={themeMode}>
          <Text style={{ fontWeight: '600', color: palette.text.primary, marginBottom: spacing.xs }}>
            Approved Starters
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            {APPROVED_CUSTOM_SECTION_TEMPLATES.map((st) => (
              <MobileButton
                key={st.id}
                variant="secondary"
                title={`+ ${st.name}`}
                onPress={() => handleCreateFromStarter(st)}
                themeMode={themeMode}
              />
            ))}
          </View>
        </MobileCard>

        {/* Active Section Canvas */}
        {activeSection ? (
          <View style={{ gap: spacing.sm }}>
            <MobileCustomSectionRenderer
              section={{
                id: activeSection.id,
                title: activeSection.name,
                name: activeSection.name,
                description: activeSection.description || undefined,
                icon: activeSection.icon || undefined,
                placement: activeSection.layoutMode,
              }}
              blocks={activeSection.currentSchema?.blocks || []}
              records={records}
              existingRecordViewsData={existingRecordViewsData}
              themeMode={themeMode}
              onAddEntry={handleAddEntry}
              onEditEntry={handleEditEntry}
              onOpenSourceItem={onOpenSourceItem}
            />
          </View>
        ) : (
          !isLoading && (
            <MobileEmptyState
              title="No custom sections"
              description="Tap a starter above to add your first custom section."
              themeMode={themeMode}
            />
          )
        )}
      </ScrollView>

      {/* Entry Sheet */}
      {activeCollectionBlock && (
        <MobileCustomSectionEntrySheet
          visible={isEntrySheetVisible}
          onClose={() => {
            setIsEntrySheetVisible(false);
            setActiveCollectionBlock(null);
            setActiveEditingRecord(null);
          }}
          collection={activeCollectionBlock}
          recordId={activeEditingRecord?.id}
          initialValues={activeEditingRecord ? (activeEditingRecord.values || {}) : {}}
          initialFolderId={activeEditingRecord?.folderId}
          availableFolders={availableFolders}
          themeMode={themeMode}
          onSubmit={handleSaveEntry}
        />
      )}
    </View>
  );
};
