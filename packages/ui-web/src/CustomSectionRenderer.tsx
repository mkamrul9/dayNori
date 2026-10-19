'use client';

import React, { useState } from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import {
  isBlockSupported,
  createFallbackBlockRepresentation,
  getArchivedFieldValues,
  type CustomBlockDefinition,
  type CustomFieldDefinition,
  type ArchivedFieldValue,
} from '@daynori/domain';
import type { ExistingRecordViewItemSummary } from '@daynori/contracts';
import { Button } from './Button.js';
import { EmptyState } from './EmptyState.js';
import { ItemTypeBadge } from './ItemTypeBadge.js';

export interface CustomSectionRecordViewData {
  id: string;
  sectionId: string;
  schemaVersion: number;
  collectionBlockId?: string;
  folderId?: string | null;
  values: Record<string, unknown>;
  archivedValues?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomSectionRendererProps {
  section: {
    id: string;
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    placement: string;
  };
  blocks: (CustomBlockDefinition | Record<string, unknown>)[];
  records?: CustomSectionRecordViewData[];
  existingRecordViewsData?: Record<string, ExistingRecordViewItemSummary[]>;
  themeMode?: ThemeMode;
  onAddEntry?: (collectionBlockId: string) => void;
  onEditEntry?: (record: CustomSectionRecordViewData) => void;
  onDeleteEntry?: (recordId: string) => void;
  onRecoverArchive?: (
    recordId: string,
    fieldId: string,
    archiveEntry: ArchivedFieldValue
  ) => void;
  onOpenSourceItem?: (itemId: string, targetKind: string) => void;
  onEditSchema?: () => void;
}

export const CustomSectionRenderer: React.FC<CustomSectionRendererProps> = ({
  section,
  blocks,
  records = [],
  existingRecordViewsData = {},
  themeMode = 'light',
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onRecoverArchive,
  onOpenSourceItem,
  onEditSchema,
}) => {
  const palette = colors[themeMode];
  const [activeArchiveModal, setActiveArchiveModal] = useState<{
    recordId: string;
    fieldId: string;
    fieldLabel: string;
    archives: ArchivedFieldValue[];
  } | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.base,
        width: '100%',
      }}
    >
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: spacing.md,
          borderBottom: `1px solid ${palette.border.subtle}`,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 700,
              color: palette.text.primary,
            }}
          >
            {section.title}
          </h2>
          {section.description && (
            <p
              style={{
                margin: 0,
                marginTop: spacing.xs,
                fontSize: '0.85rem',
                color: palette.text.secondary,
              }}
            >
              {section.description}
            </p>
          )}
        </div>

        {onEditSchema && (
          <Button variant="secondary" size="compact" onClick={onEditSchema}>
            Edit Fields / Layout
          </Button>
        )}
      </div>

      {/* Render Blocks */}
      {blocks.map((block) => {
        // Fallback for newer / unknown block types
        if (!isBlockSupported(block)) {
          const blockObj = block as { id?: string; type?: string; [key: string]: unknown };
          const fallback = createFallbackBlockRepresentation(blockObj);
          const blockKey = typeof blockObj.id === 'string' ? blockObj.id : 'unknown';
          return (
            <div
              key={blockKey}
              style={{
                padding: spacing.base,
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.strong}`,
                backgroundColor: palette.action.subtle,
              }}
            >
              <div
                style={{ fontWeight: 600, color: palette.text.primary, marginBottom: spacing.xs }}
              >
                {fallback.title} (Read-Only)
              </div>
              <div style={{ fontSize: '0.85rem', color: palette.text.secondary }}>
                {fallback.message}
              </div>
            </div>
          );
        }

        // 1. Field Collection Block
        if (block.type === 'field_collection') {
          const colBlock = block;
          const matchingRecords = records.filter(
            (r) => !r.collectionBlockId || r.collectionBlockId === colBlock.id
          );

          return (
            <div
              key={colBlock.id}
              style={{
                padding: spacing.base,
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: spacing.md,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: palette.text.primary,
                  }}
                >
                  {colBlock.title}
                </h3>
                {onAddEntry && (
                  <Button size="compact" variant="primary" onClick={() => onAddEntry(colBlock.id)}>
                    + Add Entry
                  </Button>
                )}
              </div>

              {matchingRecords.length === 0 ? (
                <EmptyState
                  title="No entries yet"
                  description="Add your first entry to this structured collection."
                  themeMode={themeMode}
                />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.875rem',
                      color: palette.text.primary,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: `2px solid ${palette.border.strong}`,
                          textAlign: 'left',
                        }}
                      >
                        {colBlock.fields.map((f) => (
                          <th
                            key={f.id}
                            style={{
                              padding: `${spacing.sm}px ${spacing.md}px`,
                              fontWeight: 600,
                              color: palette.text.secondary,
                            }}
                          >
                            {f.label}
                          </th>
                        ))}
                        <th
                          style={{ padding: `${spacing.sm}px ${spacing.md}px`, textAlign: 'right' }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingRecords.map((rec) => {
                        return (
                          <tr
                            key={rec.id}
                            style={{
                              borderBottom: `1px solid ${palette.border.subtle}`,
                            }}
                          >
                            {colBlock.fields.map((f) => {
                              const val = rec.values[f.id];
                              const archives = getArchivedFieldValues(
                                { archivedValues: rec.archivedValues },
                                f.id
                              );
                              return (
                                <td
                                  key={f.id}
                                  style={{
                                    padding: `${spacing.sm}px ${spacing.md}px`,
                                    verticalAlign: 'top',
                                  }}
                                >
                                  <div>
                                    {renderFieldValue(f, val)}
                                    {archives.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setActiveArchiveModal({
                                            recordId: rec.id,
                                            fieldId: f.id,
                                            fieldLabel: f.label,
                                            archives,
                                          })
                                        }
                                        style={{
                                          display: 'inline-block',
                                          marginLeft: spacing.xs,
                                          padding: '1px 6px',
                                          borderRadius: radii.sm,
                                          fontSize: '0.7rem',
                                          backgroundColor: palette.action.subtle,
                                          color: palette.action.subtleText,
                                          border: `1px solid ${palette.border.subtle}`,
                                          cursor: 'pointer',
                                        }}
                                        title={`${archives.length} historical value(s) preserved in archive`}
                                      >
                                        +{archives.length} archived
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td
                              style={{
                                padding: `${spacing.sm}px ${spacing.md}px`,
                                textAlign: 'right',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {onEditEntry && (
                                <Button
                                  size="compact"
                                  variant="subtle"
                                  onClick={() => onEditEntry(rec)}
                                >
                                  Edit
                                </Button>
                              )}
                              {onDeleteEntry && (
                                <Button
                                  size="compact"
                                  variant="danger"
                                  onClick={() => onDeleteEntry(rec.id)}
                                >
                                  Delete
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        }

        // 2. Existing Record View Block
        if (block.type === 'existing_record_view') {
          const viewBlock = block;
          const items = existingRecordViewsData[viewBlock.id] ?? [];

          return (
            <div
              key={viewBlock.id}
              style={{
                padding: spacing.base,
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: spacing.sm,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: palette.text.primary,
                    }}
                  >
                    {viewBlock.title}
                  </h3>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: palette.text.secondary,
                      marginTop: spacing.xs,
                    }}
                  >
                    Target: <strong>{viewBlock.targetKind}</strong>
                    {viewBlock.filter?.folderId && ` • Folder: ${viewBlock.filter.folderId}`}
                    {viewBlock.filter?.tags && ` • Tag: ${viewBlock.filter.tags.join(', ')}`}
                    {viewBlock.filter?.status && ` • Status: ${viewBlock.filter.status}`}
                  </div>
                </div>
              </div>

              {items.length === 0 ? (
                <EmptyState
                  title="No matching items"
                  description={`No active ${viewBlock.targetKind} found matching the view filter.`}
                  themeMode={themeMode}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing.sm,
                  }}
                >
                  {items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onOpenSourceItem?.(item.id, item.targetKind)}
                      style={{
                        padding: `${spacing.sm}px ${spacing.md}px`,
                        borderRadius: radii.sm,
                        border: `1px solid ${palette.border.strong}`,
                        backgroundColor: palette.surface,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: onOpenSourceItem ? 'pointer' : 'default',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <ItemTypeBadge kind={item.targetKind} themeMode={themeMode} />
                        <span style={{ fontWeight: 600, color: palette.text.primary }}>
                          {item.title}
                        </span>
                        {item.status && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 6px',
                              borderRadius: radii.sm,
                              backgroundColor: palette.action.subtle,
                              color: palette.text.secondary,
                            }}
                          >
                            {item.status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: palette.text.secondary }}>
                        {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return null;
      })}

      {/* Archive Inspection Modal */}
      {activeArchiveModal && (
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
              padding: spacing.base,
              maxWidth: 440,
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.md,
            }}
          >
            <h3 style={{ margin: 0, color: palette.text.primary }}>
              Archived Values for "{activeArchiveModal.fieldLabel}"
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: palette.text.secondary }}>
              These values were preserved from earlier schema migrations. They are never lost.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.sm,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {activeArchiveModal.archives.map((arch, idx) => (
                <div
                  key={arch.archiveId || `arch-${idx}`}
                  style={{
                    padding: spacing.sm,
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: palette.text.primary }}>
                      {String(arch.value)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: palette.text.secondary }}>
                      Archived at:{' '}
                      {arch.archivedAt
                        ? new Date(arch.archivedAt).toLocaleString()
                        : 'Unknown'}{' '}
                      ({arch.previousFieldType || arch.type || 'legacy'})
                    </div>
                  </div>
                  {onRecoverArchive && (
                    <Button
                      size="compact"
                      variant="secondary"
                      onClick={() => {
                        onRecoverArchive(
                          activeArchiveModal.recordId,
                          activeArchiveModal.fieldId,
                          arch
                        );
                        setActiveArchiveModal(null);
                      }}
                    >
                      Recover
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setActiveArchiveModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function renderFieldValue(field: CustomFieldDefinition, value: unknown): React.ReactNode {
  if (value === undefined || value === null) {
    return <span style={{ color: '#9ca3af' }}>—</span>;
  }

  if (field.type === 'checklist' && Array.isArray(value)) {
    return (
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {value.map((item: unknown, idx: number) => {
          const itemObj = (typeof item === 'object' && item !== null ? item : {}) as {
            completed?: boolean;
            checked?: boolean;
            text?: string;
            label?: string;
          };
          const text = itemObj.text || itemObj.label || String(item);
          const isDone = itemObj.completed || itemObj.checked;
          return (
            <li key={idx} style={{ textDecoration: isDone ? 'line-through' : 'none' }}>
              {text}
            </li>
          );
        })}
      </ul>
    );
  }

  if (field.type === 'link') {
    const url = String(value);
    // Safe link rendering
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2563eb', textDecoration: 'underline' }}
        >
          {url}
        </a>
      );
    }
    return <span>{url}</span>;
  }

  if (field.type === 'attachment') {
    return <span>📎 {String(value)}</span>;
  }

  return <span>{String(value)}</span>;
}
