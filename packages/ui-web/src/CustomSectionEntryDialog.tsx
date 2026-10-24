'use client';

import { Icon } from './Icon.js';
import React, { useState, useEffect } from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type { CustomFieldDefinition, FieldCollectionBlock } from '@daynori/domain';
import { Dialog } from './Dialog.js';
import { TextField } from './TextField.js';
import { Button } from './Button.js';
import { Feedback } from './Feedback.js';

export interface CustomSectionEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  collection: FieldCollectionBlock;
  recordId?: string | null;
  initialValues?: Record<string, unknown>;
  initialFolderId?: string | null;
  availableFolders?: Array<{ id: string; name: string }>;
  themeMode?: ThemeMode;
  onSubmit: (data: {
    fieldValues: Record<string, unknown>;
    folderId?: string | null;
    collectionId: string;
  }) => Promise<void> | void;
}

export const CustomSectionEntryDialog: React.FC<CustomSectionEntryDialogProps> = ({
  isOpen,
  onClose,
  collection,
  recordId,
  initialValues = {},
  initialFolderId = null,
  availableFolders = [],
  themeMode = 'light',
  onSubmit,
}) => {
  const palette = colors[themeMode];
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset state when dialog opens or initialValues change
  useEffect(() => {
    if (isOpen) {
      setFieldValues({ ...initialValues });
      setFolderId(initialFolderId);
      setError(null);
    }
  }, [isOpen, initialValues, initialFolderId]);

  const handleFieldChange = (fieldId: string, value: unknown) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleChecklistToggle = (fieldId: string, itemIdx: number) => {
    const current = (fieldValues[fieldId] as Array<{ text: string; completed: boolean }>) || [];
    const updated = current.map((item, idx) =>
      idx === itemIdx ? { ...item, completed: !item.completed } : item
    );
    handleFieldChange(fieldId, updated);
  };

  const handleAddChecklistItem = (fieldId: string, text: string) => {
    if (!text.trim()) return;
    const current = (fieldValues[fieldId] as Array<{ text: string; completed: boolean }>) || [];
    const updated = [...current, { text: text.trim(), completed: false }];
    handleFieldChange(fieldId, updated);
  };

  const handleRemoveChecklistItem = (fieldId: string, itemIdx: number) => {
    const current = (fieldValues[fieldId] as Array<{ text: string; completed: boolean }>) || [];
    const updated = current.filter((_, idx) => idx !== itemIdx);
    handleFieldChange(fieldId, updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
    for (const field of collection.fields) {
      if (field.required) {
        const val = fieldValues[field.id];
        if (val === undefined || val === null || val === '') {
          setError(`"${field.label}" is required.`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        fieldValues,
        folderId: folderId || null,
        collectionId: collection.id,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={recordId ? `Edit Entry — ${collection.title}` : `New Entry — ${collection.title}`}
      description="Fill in the structured fields below. Values are saved securely within your workspace."
      themeMode={themeMode}
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}
      >
        {error && <Feedback severity="danger" message={error} themeMode={themeMode} />}

        {/* Folder Placement */}
        {availableFolders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            <label
              htmlFor="entry-folder-select"
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: palette.text.primary,
              }}
            >
              Folder Placement (Optional)
            </label>
            <select
              id="entry-folder-select"
              value={folderId || ''}
              onChange={(e) => setFolderId(e.target.value || null)}
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
                fontSize: '0.875rem',
              }}
            >
              <option value="">No folder (Inbox / Root)</option>
              {availableFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Dynamic Schema Fields */}
        {collection.fields.map((field: CustomFieldDefinition) => {
          const val = fieldValues[field.id];

          // 1. Text Field
          if (field.type === 'text') {
            return (
              <TextField
                key={field.id}
                id={`field-${field.id}`}
                label={`${field.label}${field.required ? ' *' : ''}`}
                value={typeof val === 'string' ? val : ''}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                themeMode={themeMode}
              />
            );
          }

          // 2. Number Field
          if (field.type === 'number') {
            return (
              <TextField
                key={field.id}
                id={`field-${field.id}`}
                label={`${field.label}${field.required ? ' *' : ''}`}
                type="number"
                value={val !== undefined && val !== null ? String(val) : ''}
                onChange={(e) => {
                  const num = e.target.value === '' ? undefined : Number(e.target.value);
                  handleFieldChange(field.id, num);
                }}
                themeMode={themeMode}
              />
            );
          }

          // 3. Date Field
          if (field.type === 'date') {
            return (
              <TextField
                key={field.id}
                id={`field-${field.id}`}
                label={`${field.label}${field.required ? ' *' : ''}`}
                type="date"
                value={typeof val === 'string' ? val.split('T')[0] : ''}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                themeMode={themeMode}
              />
            );
          }

          // 4. Checklist Field
          if (field.type === 'checklist') {
            const items = (Array.isArray(val) ? val : []) as Array<{
              text: string;
              completed: boolean;
            }>;
            return (
              <div
                key={field.id}
                style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}
              >
                <label
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: palette.text.primary,
                  }}
                >
                  {field.label}
                  {field.required ? ' *' : ''}
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing.xs,
                    padding: spacing.sm,
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                  }}
                >
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: spacing.sm,
                      }}
                    >
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: spacing.xs,
                          fontSize: '0.85rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={it.completed}
                          onChange={() => handleChecklistToggle(field.id, idx)}
                        />
                        <span style={{ textDecoration: it.completed ? 'line-through' : 'none' }}>
                          {it.text}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(field.id, idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                        aria-label={`Remove ${it.text}`}
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs }}>
                    <input
                      type="text"
                      placeholder="Add item..."
                      id={`new-checklist-item-${field.id}`}
                      style={{
                        flex: 1,
                        padding: `${spacing.xs}px ${spacing.sm}px`,
                        borderRadius: radii.sm,
                        border: `1px solid ${palette.border.subtle}`,
                        fontSize: '0.8rem',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          handleAddChecklistItem(field.id, input.value);
                          input.value = '';
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="compact"
                      variant="secondary"
                      onClick={() => {
                        const input = document.getElementById(
                          `new-checklist-item-${field.id}`
                        ) as HTMLInputElement;
                        if (input && input.value) {
                          handleAddChecklistItem(field.id, input.value);
                          input.value = '';
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            );
          }

          // 6. Link Field
          if (field.type === 'link') {
            return (
              <TextField
                key={field.id}
                id={`field-${field.id}`}
                label={`${field.label}${field.required ? ' *' : ''}`}
                type="url"
                placeholder="https://example.com"
                value={typeof val === 'string' ? val : ''}
                onChange={(e) => handleFieldChange(field.id, e.target.value)}
                themeMode={themeMode}
              />
            );
          }

          // 7. Attachment Field
          if (field.type === 'attachment') {
            const currentAttachment =
              typeof val === 'object' && val !== null
                ? (val as { fileName?: string; fileId?: string; byteSize?: number })
                : typeof val === 'string'
                  ? { fileName: val }
                  : null;

            return (
              <div
                key={field.id}
                style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}
              >
                <label
                  htmlFor={`field-${field.id}`}
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: palette.text.primary,
                  }}
                >
                  {field.label}
                  {field.required ? ' *' : ''}
                </label>
                {currentAttachment ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      borderRadius: radii.sm,
                      border: `1px solid ${palette.border.subtle}`,
                      backgroundColor: palette.surface,
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', color: palette.text.primary }}>
                      <Icon name="attachment" /> {currentAttachment.fileName || 'Attached File'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleFieldChange(field.id, null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    id={`field-${field.id}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFieldChange(field.id, {
                          fileName: file.name,
                          byteSize: file.size,
                          mimeType: file.type || 'application/octet-stream',
                        });
                      }
                    }}
                    style={{
                      fontSize: '0.85rem',
                      color: palette.text.secondary,
                    }}
                  />
                )}
              </div>
            );
          }

          return null;
        })}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: spacing.sm,
            marginTop: spacing.sm,
          }}
        >
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : recordId ? 'Save Changes' : 'Create Entry'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
