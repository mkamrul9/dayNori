'use client';

import { IconText, Icon } from '@daynori/ui-web';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { colors, radii, spacing } from '@daynori/design-tokens';
import {
  Button,
  CustomSectionBuilderDialog,
  CustomSectionEntryDialog,
  CustomSectionRenderer,
  EmptyState,
  Feedback,
  SchemaMigrationPreviewModal,
  type CustomSectionRecordViewData,
} from '@daynori/ui-web';
import {
  APPROVED_CUSTOM_SECTION_TEMPLATES,
  generateSchemaMigrationPreview,
  type ArchivedFieldValue,
  type CustomBlockDefinition,
  type ExistingRecordViewBlock,
  type FieldCollectionBlock,
  type CustomSectionStarterTemplate,
  type SchemaMigrationPreview,
} from '@daynori/domain';
import type {
  CreateCustomSectionRequest,
  CreateCustomSectionSchemaRequest,
  CreateCustomSectionTemplateRequest,
  CustomSectionItem,
  CustomSectionRecordItem,
  CustomSectionTemplateResponse,
  ExistingRecordViewItemSummary,
} from '@daynori/contracts';
import { useAuth } from '../../components/AuthContext';
import { useShell } from '../../components/ShellContext';
import { createWebApiClient } from '../../data/webApiClient';

export default function CustomSectionsPage() {
  const router = useRouter();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { workspaceId } = useAuth();
  const apiClient = createWebApiClient();

  // Sections State
  const [sections, setSections] = useState<CustomSectionItem[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [personalTemplates, setPersonalTemplates] = useState<
    CustomSectionTemplateResponse['data'][]
  >([]);
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string }>>([]);

  // Active Section Data
  const [records, setRecords] = useState<CustomSectionRecordViewData[]>([]);
  const [existingRecordViewsData, setExistingRecordViewsData] = useState<
    Record<string, ExistingRecordViewItemSummary[]>
  >({});

  // Loading & Feedback
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    severity: 'success' | 'danger' | 'info';
    message: string;
  } | null>(null);

  // Dialog States
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [isEntryDialogOpen, setIsEntryDialogOpen] = useState(false);
  const [activeCollectionBlock, setActiveCollectionBlock] = useState<FieldCollectionBlock | null>(
    null
  );
  const [activeEditingRecord, setActiveEditingRecord] =
    useState<CustomSectionRecordViewData | null>(null);

  // Schema Migration Preview
  const [migrationPreview, setMigrationPreview] = useState<SchemaMigrationPreview | null>(null);
  const [pendingProposedBlocks, setPendingProposedBlocks] = useState<
    CustomBlockDefinition[] | null
  >(null);
  const [isApplyingMigration, setIsApplyingMigration] = useState(false);

  // Starter Selection Modal
  const [isStarterModalOpen, setIsStarterModalOpen] = useState(false);

  // 1. Load Workspace Sections, Folders, and Templates
  const loadWorkspaceSections = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const [sectionsRes, templatesRes, foldersRes] = await Promise.all([
        apiClient.listCustomSections(workspaceId),
        apiClient.listCustomSectionTemplates(workspaceId).catch(() => ({ data: [] })),
        apiClient.listFolders(workspaceId).catch(() => ({ data: [] })),
      ]);

      const loadedSections = sectionsRes.data || [];
      setSections(loadedSections);
      setPersonalTemplates(templatesRes.data || []);
      setAvailableFolders(
        (foldersRes.data || []).map((f: { id: string; name: string }) => ({
          id: f.id,
          name: f.name,
        }))
      );

      // Auto-select first active section if none selected
      if (loadedSections.length > 0 && !selectedSectionId) {
        setSelectedSectionId(loadedSections[0]!.id);
      }
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to load custom sections.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, selectedSectionId]);

  useEffect(() => {
    loadWorkspaceSections();
  }, [loadWorkspaceSections]);

  // Selected section object
  const activeSection = sections.find((s) => s.id === selectedSectionId) || null;

  // 2. Load Records and Views for the Active Section
  const loadSectionContent = useCallback(async () => {
    if (!workspaceId || !activeSection) return;

    try {
      // A. Load records
      const recsRes = await apiClient.listCustomSectionRecords(workspaceId, activeSection.id);
      const rawRecords = recsRes.data || [];
      const mappedRecords: CustomSectionRecordViewData[] = rawRecords.map(
        (r: CustomSectionRecordItem) => ({
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
        })
      );
      setRecords(mappedRecords);

      // B. Query existing record view blocks
      const viewsMap: Record<string, ExistingRecordViewItemSummary[]> = {};
      const viewBlocks = (activeSection.currentSchema?.blocks || []).filter(
        (b) => b.type === 'existing_record_view'
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
          const viewRes = await apiClient.queryExistingRecordView(
            workspaceId,
            activeSection.id,
            vb.id,
            queryPayload
          );
          viewsMap[vb.id] = viewRes.data || [];
        } catch {
          viewsMap[vb.id] = [];
        }
      }
      setExistingRecordViewsData(viewsMap);
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to load section records.',
      });
    }
  }, [workspaceId, activeSection]);

  useEffect(() => {
    if (activeSection) {
      loadSectionContent();
    } else {
      setRecords([]);
      setExistingRecordViewsData({});
    }
  }, [activeSection, loadSectionContent]);

  // 3. Create Section from Starter
  const handleCreateFromStarter = async (starter: CustomSectionStarterTemplate) => {
    if (!workspaceId) return;
    try {
      setIsLoading(true);
      const created = await apiClient.createCustomSection(workspaceId, {
        name: starter.name,
        description: starter.description,
        icon: starter.icon,
        layoutMode: starter.layoutMode || 'single_column',
        initialSchema: starter.schema as unknown as CreateCustomSectionRequest['initialSchema'],
      });

      setFeedback({ severity: 'success', message: `Created section "${starter.name}".` });
      setIsStarterModalOpen(false);
      await loadWorkspaceSections();
      setSelectedSectionId(created.data.id);
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to create section.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Create Section from Personal Template
  const handleCreateFromPersonalTemplate = async (
    template: CustomSectionTemplateResponse['data']
  ) => {
    if (!workspaceId) return;
    try {
      setIsLoading(true);
      const created = await apiClient.createCustomSection(workspaceId, {
        name: template.name,
        description: template.description || undefined,
        icon: template.icon || 'folder',
        layoutMode: template.layoutMode || 'single_column',
        initialSchema: template.schema as unknown as CreateCustomSectionRequest['initialSchema'],
      });

      setFeedback({
        severity: 'success',
        message: `Created section from template "${template.name}".`,
      });
      setIsStarterModalOpen(false);
      await loadWorkspaceSections();
      setSelectedSectionId(created.data.id);
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to create section from template.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Create Custom Section from Builder Dialog
  const handleBuilderSubmit = async (data: {
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    placement: 'dashboard' | 'sidebar' | 'quick_access';
    blocks: CustomBlockDefinition[];
    saveAsTemplate?: {
      name: string;
      description?: string;
    };
  }) => {
    if (!workspaceId) return;
    try {
      const created = await apiClient.createCustomSection(workspaceId, {
        name: data.title,
        description: data.description,
        icon: data.icon,
        layoutMode: data.placement === 'sidebar' ? 'two_column' : 'single_column',
        initialSchema: {
          version: 1,
          blocks: data.blocks as unknown as CreateCustomSectionRequest['initialSchema']['blocks'],
        },
      });

      // Save personal template if requested
      if (data.saveAsTemplate) {
        await apiClient.createCustomSectionTemplate(workspaceId, {
          name: data.saveAsTemplate.name,
          description: data.saveAsTemplate.description,
          icon: data.icon,
          layoutMode: 'single_column',
          schema: {
            version: 1,
            blocks:
              data.blocks as unknown as CreateCustomSectionTemplateRequest['schema']['blocks'],
          },
        });
      }

      setFeedback({ severity: 'success', message: `Created section "${data.title}".` });
      setIsBuilderOpen(false);
      await loadWorkspaceSections();
      setSelectedSectionId(created.data.id);
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to create custom section.',
      });
    }
  };

  // 6. Save Active Section as Personal Template
  const handleSaveActiveAsTemplate = async () => {
    if (!workspaceId || !activeSection || !activeSection.currentSchema) return;
    const name = window.prompt('Enter template name:', activeSection.name);
    if (!name) return;
    try {
      await apiClient.createCustomSectionTemplate(workspaceId, {
        name,
        description: activeSection.description || undefined,
        icon: activeSection.icon || 'folder',
        layoutMode: activeSection.layoutMode,
        schema:
          activeSection.currentSchema as unknown as CreateCustomSectionTemplateRequest['schema'],
      });
      setFeedback({
        severity: 'success',
        message: `Saved section as personal template "${name}".`,
      });
      await loadWorkspaceSections();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to save template.',
      });
    }
  };

  // 7. Entry Management: Add / Edit Record
  const handleAddEntry = (collectionBlockId: string) => {
    if (!activeSection) return;
    const colBlock = activeSection.currentSchema?.blocks.find(
      (b) => b.id === collectionBlockId && b.type === 'field_collection'
    ) as FieldCollectionBlock | undefined;

    if (colBlock) {
      setActiveCollectionBlock(colBlock);
      setActiveEditingRecord(null);
      setIsEntryDialogOpen(true);
    }
  };

  const handleEditEntry = (rec: CustomSectionRecordViewData) => {
    if (!activeSection) return;
    const colId = rec.collectionId || rec.collectionBlockId;
    const colBlock = activeSection.currentSchema?.blocks.find(
      (b) => b.id === colId && b.type === 'field_collection'
    ) as FieldCollectionBlock | undefined;

    if (colBlock) {
      setActiveCollectionBlock(colBlock);
      setActiveEditingRecord(rec);
      setIsEntryDialogOpen(true);
    }
  };

  const handleSaveEntry = async (data: {
    fieldValues: Record<string, unknown>;
    folderId?: string | null;
    collectionId: string;
  }) => {
    if (!workspaceId || !activeSection) return;

    if (activeEditingRecord) {
      // Update
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
      setFeedback({ severity: 'success', message: 'Entry updated successfully.' });
    } else {
      // Create
      await apiClient.createCustomSectionRecord(workspaceId, activeSection.id, {
        collectionId: data.collectionId,
        fieldValues: data.fieldValues,
        folderId: data.folderId,
      });
      setFeedback({ severity: 'success', message: 'Entry created successfully.' });
    }
    await loadSectionContent();
  };

  const handleDeleteEntry = async (recordId: string) => {
    if (!workspaceId || !activeSection) return;
    if (!window.confirm('Delete this entry? Historical archives will remain preserved.')) return;
    try {
      await apiClient.deleteCustomSectionRecord(workspaceId, activeSection.id, recordId);
      setFeedback({ severity: 'success', message: 'Entry deleted.' });
      await loadSectionContent();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to delete entry.',
      });
    }
  };

  // 8. Recover Archived Value
  const handleRecoverArchive = async (
    recordId: string,
    fieldId: string,
    archiveEntry: ArchivedFieldValue
  ) => {
    if (!workspaceId || !activeSection) return;
    const rec = records.find((r) => r.id === recordId);
    if (!rec) return;

    try {
      const currentValues = rec.fieldValues || rec.values || {};
      const updatedValues = {
        ...currentValues,
        [fieldId]: archiveEntry.value,
      };

      await apiClient.updateCustomSectionRecord(workspaceId, activeSection.id, recordId, {
        expectedRevision: rec.revision ?? 1,
        fieldValues: updatedValues,
        collectionId: rec.collectionId || rec.collectionBlockId || '',
      });

      setFeedback({
        severity: 'success',
        message: `Recovered archived value "${String(archiveEntry.value)}" into field "${fieldId}".`,
      });
      await loadSectionContent();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to recover archived value.',
      });
    }
  };

  // 9. Hide / Restore / Delete Section
  const handleToggleHideSection = async () => {
    if (!workspaceId || !activeSection) return;
    try {
      const willArchive = activeSection.status !== 'archived';
      await apiClient.updateCustomSection(workspaceId, activeSection.id, {
        expectedRevision: activeSection.revision,
        status: willArchive ? 'archived' : 'active',
      });
      setFeedback({
        severity: 'success',
        message: willArchive ? 'Section hidden (archived).' : 'Section restored.',
      });
      await loadWorkspaceSections();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to update section status.',
      });
    }
  };

  const handleDeleteSection = async () => {
    if (!workspaceId || !activeSection) return;
    if (!window.confirm(`Permanently remove section "${activeSection.name}" and its entries?`))
      return;
    try {
      await apiClient.deleteCustomSection(workspaceId, activeSection.id);
      setFeedback({ severity: 'success', message: 'Section removed.' });
      setSelectedSectionId(null);
      await loadWorkspaceSections();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to remove section.',
      });
    }
  };

  // 10. Canonical Source Navigation
  const handleOpenSourceItem = (itemId: string, targetKind: string) => {
    if (targetKind === 'note') router.push(`/library?itemId=${itemId}`);
    else if (targetKind === 'task') router.push(`/plan?taskId=${itemId}`);
    else if (targetKind === 'routine') router.push(`/plan?routineId=${itemId}`);
    else if (targetKind === 'expense') router.push(`/expenses?expenseId=${itemId}`);
    else if (targetKind === 'journal') router.push(`/journal?entryId=${itemId}`);
    else if (targetKind === 'file') router.push(`/files?fileId=${itemId}`);
    else router.push(`/library`);
  };

  // 11. Schema Evolution: Preview and Apply
  const handleInitiateSchemaEvolution = () => {
    if (!activeSection?.currentSchema) return;
    const currentBlocks = activeSection.currentSchema.blocks;
    const proposed = currentBlocks.map((b) => {
      if (b.type === 'field_collection') {
        const col = b as FieldCollectionBlock;
        return {
          ...col,
          fields: [
            ...col.fields,
            {
              id: `field_notes_${Date.now()}`,
              label: 'Field Notes',
              type: 'text' as const,
              required: false,
              description: 'Evolution added note field',
            },
          ],
        };
      }
      return b;
    });

    const preview = generateSchemaMigrationPreview(
      activeSection.currentSchema,
      proposed,
      records.length
    );
    setPendingProposedBlocks(proposed);
    setMigrationPreview(preview);
  };

  const handleApplyMigration = async () => {
    if (!workspaceId || !activeSection || !pendingProposedBlocks) return;
    setIsApplyingMigration(true);
    try {
      await apiClient.createCustomSectionSchema(workspaceId, activeSection.id, {
        blocks: pendingProposedBlocks as unknown as CreateCustomSectionSchemaRequest['blocks'],
      });
      setFeedback({
        severity: 'success',
        message: 'Schema evolved successfully with non-destructive archive retention.',
      });
      setMigrationPreview(null);
      setPendingProposedBlocks(null);
      await loadWorkspaceSections();
      await loadSectionContent();
    } catch (err: unknown) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to evolve schema.',
      });
    } finally {
      setIsApplyingMigration(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.base,
        padding: `${spacing.lg}px ${spacing.xl}px`,
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Page Header */}
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
              margin: 0,
              fontSize: '1.75rem',
              fontWeight: 800,
              color: palette.text.primary,
            }}
          >
            Custom Sections
          </h1>
          <p
            style={{
              margin: 0,
              marginTop: spacing.xs,
              fontSize: '0.9rem',
              color: palette.text.secondary,
            }}
          >
            Create flexible structured workspaces, reading lists, study hubs, and aggregated views.
          </p>
        </div>

        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          <Button variant="secondary" onClick={() => setIsStarterModalOpen(true)}>
            + From Template / Starter
          </Button>
          <Button variant="primary" onClick={() => setIsBuilderOpen(true)}>
            + Create Section
          </Button>
        </div>
      </div>

      {feedback && (
        <Feedback
          severity={feedback.severity}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Main Content Layout */}
      {sections.length === 0 && !isLoading ? (
        <EmptyState
          title="No custom sections yet"
          description="Create your first section using an approved starter like Reading List or Study Dashboard, or build your own."
          themeMode={themeMode}
          actionLabel="Choose a Starter"
          onAction={() => setIsStarterModalOpen(true)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          {/* Section Selection Bar */}
          <div
            style={{
              display: 'flex',
              gap: spacing.xs,
              borderBottom: `1px solid ${palette.border.subtle}`,
              overflowX: 'auto',
              paddingBottom: spacing.xs,
            }}
          >
            {sections.map((sec) => {
              const isSelected = sec.id === selectedSectionId;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSelectedSectionId(sec.id)}
                  style={{
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    borderRadius: `${radii.sm}px ${radii.sm}px 0 0`,
                    border: 'none',
                    borderBottom: isSelected
                      ? `3px solid ${palette.action.primary}`
                      : '3px solid transparent',
                    backgroundColor: isSelected ? palette.surface : 'transparent',
                    color: isSelected ? palette.action.primary : palette.text.secondary,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    fontSize: '0.9rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>
                    <Icon name={sec.icon ? 'clipboard' : 'folder'} />
                  </span>
                  <span>{sec.name}</span>
                  {sec.status === 'archived' && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '1px 5px',
                        borderRadius: radii.sm,
                        backgroundColor: palette.action.subtle,
                        color: palette.text.secondary,
                      }}
                    >
                      Hidden
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Section Canvas & Controls */}
          {activeSection && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {/* Section Management Toolbar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  borderRadius: radii.sm,
                  backgroundColor: palette.surface,
                  border: `1px solid ${palette.border.subtle}`,
                  flexWrap: 'wrap',
                  gap: spacing.sm,
                }}
              >
                <div style={{ fontSize: '0.85rem', color: palette.text.secondary }}>
                  Schema Version: <strong>v{activeSection.currentSchemaVersion}</strong> • Layout:{' '}
                  <strong>{activeSection.layoutMode}</strong>
                </div>

                <div style={{ display: 'flex', gap: spacing.xs }}>
                  <Button
                    size="compact"
                    variant="subtle"
                    onClick={handleSaveActiveAsTemplate}
                    title="Save this section's schema as a personal template for reuse"
                  >
                    Save as Template
                  </Button>
                  <Button
                    size="compact"
                    variant="subtle"
                    onClick={handleInitiateSchemaEvolution}
                    title="Evolve fields with non-destructive migration preview"
                  >
                    Evolve Schema
                  </Button>
                  <Button size="compact" variant="subtle" onClick={handleToggleHideSection}>
                    {activeSection.status === 'archived' ? 'Restore' : 'Hide'}
                  </Button>
                  <Button size="compact" variant="danger" onClick={handleDeleteSection}>
                    Remove
                  </Button>
                </div>
              </div>

              {/* Render Section */}
              <CustomSectionRenderer
                section={{
                  id: activeSection.id,
                  title: activeSection.name,
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
                onDeleteEntry={handleDeleteEntry}
                onRecoverArchive={handleRecoverArchive}
                onOpenSourceItem={handleOpenSourceItem}
              />
            </div>
          )}
        </div>
      )}

      {/* Builder Dialog */}
      <CustomSectionBuilderDialog
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        workspaceId={workspaceId || ''}
        themeMode={themeMode}
        onCreateSection={handleBuilderSubmit}
      />

      {/* Entry Create / Edit Dialog */}
      {activeCollectionBlock && (
        <CustomSectionEntryDialog
          isOpen={isEntryDialogOpen}
          onClose={() => {
            setIsEntryDialogOpen(false);
            setActiveCollectionBlock(null);
            setActiveEditingRecord(null);
          }}
          collection={activeCollectionBlock}
          recordId={activeEditingRecord?.id}
          initialValues={activeEditingRecord ? activeEditingRecord.values || {} : {}}
          initialFolderId={activeEditingRecord?.folderId}
          availableFolders={availableFolders}
          themeMode={themeMode}
          onSubmit={handleSaveEntry}
        />
      )}

      {/* Migration Preview Modal */}
      {migrationPreview && (
        <SchemaMigrationPreviewModal
          isOpen={!!migrationPreview}
          onClose={() => {
            setMigrationPreview(null);
            setPendingProposedBlocks(null);
          }}
          preview={migrationPreview}
          isApplying={isApplyingMigration}
          onConfirmMigration={handleApplyMigration}
          themeMode={themeMode}
        />
      )}

      {/* Starters & Personal Templates Selection Modal */}
      {isStarterModalOpen && (
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
          }}
        >
          <div
            style={{
              backgroundColor: palette.surface,
              borderRadius: radii.sheet,
              padding: spacing.lg,
              maxWidth: 580,
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.md,
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: palette.text.primary }}>
                Choose a Starter or Saved Template
              </h2>
              <button
                type="button"
                onClick={() => setIsStarterModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: palette.text.secondary,
                }}
              >
                <Icon name="x" />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.875rem', color: palette.text.secondary }}>
              Starters provide safe, pre-approved field collections and view blocks designed for
              common workflows.
            </p>

            {/* Approved Starters */}
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                color: palette.text.primary,
                marginTop: spacing.sm,
              }}
            >
              Approved Starters
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {APPROVED_CUSTOM_SECTION_TEMPLATES.map((starter) => (
                <div
                  key={starter.id}
                  style={{
                    padding: spacing.md,
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: palette.surfaceRaised,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: palette.text.primary }}>
                      {starter.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: palette.text.secondary }}>
                      {starter.description} • Category: {starter.category}
                    </div>
                  </div>
                  <Button
                    size="compact"
                    variant="primary"
                    onClick={() => handleCreateFromStarter(starter)}
                  >
                    Use Starter
                  </Button>
                </div>
              ))}
            </div>

            {/* Personal Templates */}
            {personalTemplates.length > 0 && (
              <>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    color: palette.text.primary,
                    marginTop: spacing.md,
                  }}
                >
                  Your Saved Templates
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {personalTemplates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      style={{
                        padding: spacing.md,
                        borderRadius: radii.sm,
                        border: `1px solid ${palette.border.subtle}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: palette.surfaceRaised,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: palette.text.primary }}>
                          {tmpl.name}
                        </div>
                        {tmpl.description && (
                          <div style={{ fontSize: '0.8rem', color: palette.text.secondary }}>
                            {tmpl.description}
                          </div>
                        )}
                      </div>
                      <Button
                        size="compact"
                        variant="primary"
                        onClick={() => handleCreateFromPersonalTemplate(tmpl)}
                      >
                        Use Template
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.sm }}>
              <Button variant="secondary" onClick={() => setIsStarterModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
