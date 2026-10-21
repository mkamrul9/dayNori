'use client';

import { Icon } from './Icon.js';
import React, { useState } from 'react';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  APPROVED_CUSTOM_SECTION_TEMPLATES,
  APPROVED_FIELD_TYPES,
  type CustomBlockDefinition,
  type CustomFieldDefinition,
  type CustomFieldType,
  type CustomSectionStarterTemplate,
  type ExistingRecordTargetKind,
} from '@daynori/domain';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';
import { TextField } from './TextField.js';
import { Feedback } from './Feedback.js';

export interface CustomSectionBuilderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  themeMode?: ThemeMode;
  availableTemplates?: CustomSectionStarterTemplate[];
  onCreateSection: (data: {
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
  }) => Promise<void> | void;
}

export type BuilderMode = 'collection' | 'existing_view' | 'combined';

export const CustomSectionBuilderDialog: React.FC<CustomSectionBuilderDialogProps> = ({
  isOpen,
  onClose,
  themeMode = 'light',
  availableTemplates = APPROVED_CUSTOM_SECTION_TEMPLATES,
  onCreateSection,
}) => {
  const palette = colors[themeMode];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [builderMode, setBuilderMode] = useState<BuilderMode>('collection');

  // Step 1: Basics
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState('#2563eb');
  const [placement, setPlacement] = useState<'dashboard' | 'sidebar' | 'quick_access'>('dashboard');

  // Step 2: Collection Fields
  const [fields, setFields] = useState<CustomFieldDefinition[]>([
    {
      id: 'field_title',
      label: 'Title',
      type: 'text',
      required: true,
      description: 'Main entry title',
    },
  ]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldDescription, setNewFieldDescription] = useState('');

  // Step 2: Existing View Config
  const [viewTargetKind, setViewTargetKind] = useState<ExistingRecordTargetKind>('tasks');
  const [viewFolder, setViewFolder] = useState('');
  const [viewTag, setViewTag] = useState('');
  const [viewStatus, setViewStatus] = useState<'all' | 'active' | 'completed' | 'archived'>('all');
  const [viewDisplayStyle, setViewDisplayStyle] = useState<'list' | 'card' | 'compact'>('list');

  // Personal template saving
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Feedback & Loading
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setStep(1);
    setBuilderMode('collection');
    setTitle('');
    setDescription('');
    setIcon('folder');
    setColor('#2563eb');
    setPlacement('dashboard');
    setFields([
      {
        id: 'field_title',
        label: 'Title',
        type: 'text',
        required: true,
        description: 'Main entry title',
      },
    ]);
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldRequired(false);
    setNewFieldDescription('');
    setViewTargetKind('tasks');
    setViewFolder('');
    setViewTag('');
    setViewStatus('all');
    setViewDisplayStyle('list');
    setSaveAsTemplate(false);
    setTemplateName('');
    setTemplateDescription('');
    setError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleApplyTemplate = (tmpl: CustomSectionStarterTemplate) => {
    setTitle(tmpl.name);
    setDescription(tmpl.description);
    if (tmpl.icon) setIcon(tmpl.icon);
    if (tmpl.color) setColor(tmpl.color);
    if (tmpl.schema.blocks.length > 0) {
      const colBlock = tmpl.schema.blocks.find(
        (b): b is Extract<CustomBlockDefinition, { type: 'field_collection' }> =>
          b.type === 'field_collection'
      );
      const viewBlock = tmpl.schema.blocks.find(
        (b): b is Extract<CustomBlockDefinition, { type: 'existing_record_view' }> =>
          b.type === 'existing_record_view'
      );

      if (colBlock && viewBlock) {
        setBuilderMode('combined');
        setFields([...colBlock.fields]);
        setViewTargetKind(viewBlock.targetKind);
      } else if (colBlock) {
        setBuilderMode('collection');
        setFields([...colBlock.fields]);
      } else if (viewBlock) {
        setBuilderMode('existing_view');
        setViewTargetKind(viewBlock.targetKind);
      }
    }
  };

  const handleAddField = () => {
    const trimmed = newFieldLabel.trim();
    if (!trimmed) {
      setError('Please provide a field name.');
      return;
    }
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const fieldId = `field_${slug}_${Date.now().toString(36)}`;

    // Reject reserved keys
    if (['__proto__', 'constructor', 'prototype', 'toString', 'valueOf'].includes(slug)) {
      setError('Field name contains a reserved identifier.');
      return;
    }

    const baseField = {
      id: fieldId,
      label: trimmed,
      required: newFieldRequired,
      description: newFieldDescription.trim() || undefined,
    };

    let newField: CustomFieldDefinition;
    switch (newFieldType) {
      case 'checklist':
        newField = { ...baseField, type: 'checklist' };
        break;
      case 'date':
        newField = { ...baseField, type: 'date' };
        break;
      case 'number':
        newField = { ...baseField, type: 'number' };
        break;
      case 'link':
        newField = { ...baseField, type: 'link' };
        break;
      case 'attachment':
        newField = { ...baseField, type: 'attachment' };
        break;
      case 'text':
      default:
        newField = { ...baseField, type: 'text' };
        break;
    }

    setFields([...fields, newField]);
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldRequired(false);
    setNewFieldDescription('');
    setError(null);
  };

  const handleRemoveField = (id: string) => {
    if (fields.length <= 1) {
      setError('A structured collection must have at least one field.');
      return;
    }
    setFields(fields.filter((f) => f.id !== id));
    setError(null);
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    const reordered = [...fields];
    const temp = reordered[index]!;
    reordered[index] = reordered[targetIndex]!;
    reordered[targetIndex] = temp;
    setFields(reordered);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Section title is required.');
      setStep(1);
      return;
    }

    const blocks: CustomBlockDefinition[] = [];

    if (builderMode === 'collection' || builderMode === 'combined') {
      if (fields.length === 0) {
        setError('At least one field is required in a structured collection.');
        setStep(2);
        return;
      }
      blocks.push({
        id: `block_col_${Date.now().toString(36)}`,
        type: 'field_collection',
        title: `${title.trim()} Entries`,
        fields,
      });
    }

    if (builderMode === 'existing_view' || builderMode === 'combined') {
      blocks.push({
        id: `block_view_${Date.now().toString(36)}`,
        type: 'existing_record_view',
        title: `${title.trim()} View`,
        targetKind: viewTargetKind,
        filter: {
          folderId: viewFolder.trim() || undefined,
          tags: viewTag.trim() ? [viewTag.trim()] : undefined,
          status: viewStatus,
        },
        displayMode: viewDisplayStyle,
      });
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onCreateSection({
        title: title.trim(),
        description: description.trim() || undefined,
        icon,
        color,
        placement,
        blocks,
        saveAsTemplate:
          saveAsTemplate && templateName.trim()
            ? {
                name: templateName.trim(),
                description: templateDescription.trim() || undefined,
              }
            : undefined,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create section.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Custom Section"
      description="Design a personal section with structured data, existing item views, or starter templates."
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base, minWidth: 380 }}>
        {error && <Feedback severity="danger" message={error} themeMode={themeMode} />}

        {/* Step Navigation Bar */}
        <div
          role="tablist"
          aria-label="Creation Steps"
          style={{
            display: 'flex',
            borderBottom: `1px solid ${palette.border.subtle}`,
            paddingBottom: spacing.sm,
            gap: spacing.sm,
          }}
        >
          <Button
            size="compact"
            variant={step === 1 ? 'primary' : 'subtle'}
            onClick={() => setStep(1)}
            aria-selected={step === 1}
            role="tab"
          >
            1. Basics & Template
          </Button>
          <Button
            size="compact"
            variant={step === 2 ? 'primary' : 'subtle'}
            onClick={() => setStep(2)}
            aria-selected={step === 2}
            role="tab"
          >
            2. Fields & Views
          </Button>
          <Button
            size="compact"
            variant={step === 3 ? 'primary' : 'subtle'}
            onClick={() => setStep(3)}
            aria-selected={step === 3}
            role="tab"
          >
            3. Review & Placement
          </Button>
        </div>

        {/* STEP 1: Basics & Template */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: spacing.xs,
                }}
              >
                Choose Starter Template (Optional)
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: spacing.sm,
                  marginBottom: spacing.md,
                }}
              >
                {availableTemplates.map((t: CustomSectionStarterTemplate) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleApplyTemplate(t)}
                    style={{
                      padding: spacing.sm,
                      borderRadius: radii.sm,
                      border: `1px solid ${palette.border.strong}`,
                      backgroundColor: palette.surface,
                      color: palette.text.primary,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: palette.text.secondary,
                        marginTop: spacing.xs,
                      }}
                    >
                      {t.category}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <TextField
              label="Section Name"
              placeholder="e.g., Reading List, Study Hub, Project Tracker"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              themeMode={themeMode}
              required
            />

            <TextField
              label="Description (Optional)"
              placeholder="What this section tracks..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              themeMode={themeMode}
            />

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: spacing.xs,
                }}
              >
                Section Kind
              </label>
              <div style={{ display: 'flex', gap: spacing.sm }}>
                <Button
                  size="compact"
                  variant={builderMode === 'collection' ? 'primary' : 'secondary'}
                  onClick={() => setBuilderMode('collection')}
                >
                  Structured Collection
                </Button>
                <Button
                  size="compact"
                  variant={builderMode === 'existing_view' ? 'primary' : 'secondary'}
                  onClick={() => setBuilderMode('existing_view')}
                >
                  Existing Items View
                </Button>
                <Button
                  size="compact"
                  variant={builderMode === 'combined' ? 'primary' : 'secondary'}
                  onClick={() => setBuilderMode('combined')}
                >
                  Both / Combined
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.md }}>
              <Button
                variant="primary"
                onClick={() => {
                  if (!title.trim()) {
                    setError('Please provide a section name.');
                    return;
                  }
                  setError(null);
                  setStep(2);
                }}
              >
                Next: Configure Fields <Icon name="arrow-right" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Fields & Views */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {(builderMode === 'collection' || builderMode === 'combined') && (
              <div
                style={{
                  border: `1px solid ${palette.border.subtle}`,
                  borderRadius: radii.sm,
                  padding: spacing.md,
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    marginBottom: spacing.sm,
                    color: palette.text.primary,
                    fontSize: '0.95rem',
                  }}
                >
                  Structured Fields
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {fields.map((f, idx) => (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `${spacing.sm}px ${spacing.md}px`,
                        backgroundColor: palette.surface,
                        border: `1px solid ${palette.border.strong}`,
                        borderRadius: radii.sm,
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: palette.text.primary }}>
                          {f.label}
                        </span>{' '}
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: palette.text.secondary,
                            marginLeft: spacing.xs,
                          }}
                        >
                          ({f.type})
                        </span>
                        {f.required && (
                          <span
                            style={{
                              marginLeft: spacing.xs,
                              fontSize: '0.75rem',
                              color: palette.status.danger,
                            }}
                          >
                            *required
                          </span>
                        )}
                      </div>

                      {/* Accessible ordering buttons (no drag required!) */}
                      <div style={{ display: 'flex', gap: spacing.xs }}>
                        <Button
                          size="compact"
                          variant="subtle"
                          disabled={idx === 0}
                          onClick={() => handleMoveField(idx, 'up')}
                          aria-label={`Move ${f.label} up`}
                        >
                          <Icon name="arrow-up" /> Up
                        </Button>
                        <Button
                          size="compact"
                          variant="subtle"
                          disabled={idx === fields.length - 1}
                          onClick={() => handleMoveField(idx, 'down')}
                          aria-label={`Move ${f.label} down`}
                        >
                          <Icon name="arrow-down" /> Down
                        </Button>
                        <Button
                          size="compact"
                          variant="danger"
                          onClick={() => handleRemoveField(f.id)}
                          aria-label={`Remove ${f.label}`}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Field Inline Form */}
                <div
                  style={{
                    marginTop: spacing.md,
                    paddingTop: spacing.md,
                    borderTop: `1px dashed ${palette.border.subtle}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing.sm,
                  }}
                >
                  <div
                    style={{ fontWeight: 600, fontSize: '0.85rem', color: palette.text.primary }}
                  >
                    Add New Field
                  </div>
                  <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'flex-end' }}>
                    <div style={{ flex: 2 }}>
                      <TextField
                        label="Field Name"
                        placeholder="e.g., Rating, Status, Due Date"
                        value={newFieldLabel}
                        onChange={(e) => setNewFieldLabel(e.target.value)}
                        themeMode={themeMode}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: palette.text.secondary,
                          marginBottom: spacing.xs,
                        }}
                      >
                        Type
                      </label>
                      <select
                        value={newFieldType}
                        onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)}
                        style={{
                          width: '100%',
                          minHeight: touchTargets.webMin,
                          padding: `0 ${spacing.sm}px`,
                          borderRadius: radii.sm,
                          border: `1px solid ${palette.border.strong}`,
                          backgroundColor: palette.surface,
                          color: palette.text.primary,
                        }}
                      >
                        {APPROVED_FIELD_TYPES.map((t: CustomFieldType) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', height: touchTargets.webMin }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.xs,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          color: palette.text.primary,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newFieldRequired}
                          onChange={(e) => setNewFieldRequired(e.target.checked)}
                        />
                        Required
                      </label>
                    </div>
                    <Button variant="secondary" size="compact" onClick={handleAddField}>
                      + Add
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {(builderMode === 'existing_view' || builderMode === 'combined') && (
              <div
                style={{
                  border: `1px solid ${palette.border.subtle}`,
                  borderRadius: radii.sm,
                  padding: spacing.md,
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    marginBottom: spacing.sm,
                    color: palette.text.primary,
                    fontSize: '0.95rem',
                  }}
                >
                  Existing Items View Filter
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: palette.text.secondary,
                        marginBottom: spacing.xs,
                      }}
                    >
                      Target Items
                    </label>
                    <select
                      value={viewTargetKind}
                      onChange={(e) =>
                        setViewTargetKind(e.target.value as ExistingRecordTargetKind)
                      }
                      style={{
                        width: '100%',
                        minHeight: touchTargets.webMin,
                        padding: `0 ${spacing.sm}px`,
                        borderRadius: radii.sm,
                        border: `1px solid ${palette.border.strong}`,
                        backgroundColor: palette.surface,
                        color: palette.text.primary,
                      }}
                    >
                      <option value="tasks">Tasks</option>
                      <option value="notes">Notes</option>
                      <option value="routines">Routines</option>
                      <option value="journals">Journal Entries</option>
                      <option value="files">Files & Documents</option>
                      <option value="expenses">Expenses & Transactions</option>
                    </select>
                  </div>

                  <TextField
                    label="Folder Filter (Optional)"
                    placeholder="e.g., Software, Personal, Research"
                    value={viewFolder}
                    onChange={(e) => setViewFolder(e.target.value)}
                    themeMode={themeMode}
                  />

                  <TextField
                    label="Tag Filter (Optional)"
                    placeholder="e.g., reading, urgent"
                    value={viewTag}
                    onChange={(e) => setViewTag(e.target.value)}
                    themeMode={themeMode}
                  />

                  <div style={{ display: 'flex', gap: spacing.sm }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: palette.text.secondary,
                          marginBottom: spacing.xs,
                        }}
                      >
                        Status
                      </label>
                      <select
                        value={viewStatus}
                        onChange={(e) =>
                          setViewStatus(
                            e.target.value as 'all' | 'active' | 'completed' | 'archived'
                          )
                        }
                        style={{
                          width: '100%',
                          minHeight: touchTargets.webMin,
                          padding: `0 ${spacing.sm}px`,
                          borderRadius: radii.sm,
                          border: `1px solid ${palette.border.strong}`,
                          backgroundColor: palette.surface,
                          color: palette.text.primary,
                        }}
                      >
                        <option value="all">All</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>

                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: palette.text.secondary,
                          marginBottom: spacing.xs,
                        }}
                      >
                        Display Style
                      </label>
                      <select
                        value={viewDisplayStyle}
                        onChange={(e) =>
                          setViewDisplayStyle(e.target.value as 'list' | 'card' | 'compact')
                        }
                        style={{
                          width: '100%',
                          minHeight: touchTargets.webMin,
                          padding: `0 ${spacing.sm}px`,
                          borderRadius: radii.sm,
                          border: `1px solid ${palette.border.strong}`,
                          backgroundColor: palette.surface,
                          color: palette.text.primary,
                        }}
                      >
                        <option value="list">List</option>
                        <option value="card">Cards</option>
                        <option value="compact">Compact</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginTop: spacing.md }}
            >
              <Button variant="secondary" onClick={() => setStep(1)}>
                <Icon name="arrow-left" /> Back: Basics
              </Button>
              <Button variant="primary" onClick={() => setStep(3)}>
                Next: Review & Placement <Icon name="arrow-right" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Review, Placement & Template Save */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: spacing.xs,
                }}
              >
                Placement in App Navigation
              </label>
              <div style={{ display: 'flex', gap: spacing.sm }}>
                <Button
                  size="compact"
                  variant={placement === 'dashboard' ? 'primary' : 'secondary'}
                  onClick={() => setPlacement('dashboard')}
                >
                  Dashboard
                </Button>
                <Button
                  size="compact"
                  variant={placement === 'sidebar' ? 'primary' : 'secondary'}
                  onClick={() => setPlacement('sidebar')}
                >
                  Sidebar
                </Button>
                <Button
                  size="compact"
                  variant={placement === 'quick_access' ? 'primary' : 'secondary'}
                  onClick={() => setPlacement('quick_access')}
                >
                  Quick Access
                </Button>
              </div>
            </div>

            {/* Personal Template Save Option */}
            <div
              style={{
                padding: spacing.md,
                border: `1px solid ${palette.border.subtle}`,
                borderRadius: radii.sm,
                backgroundColor: palette.surface,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  fontWeight: 600,
                  color: palette.text.primary,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => {
                    setSaveAsTemplate(e.target.checked);
                    if (e.target.checked && !templateName) {
                      setTemplateName(title);
                    }
                  }}
                />
                Save this configuration as a reusable Personal Template
              </label>

              {saveAsTemplate && (
                <div
                  style={{
                    marginTop: spacing.sm,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing.sm,
                  }}
                >
                  <TextField
                    label="Template Name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    themeMode={themeMode}
                    required
                  />
                  <TextField
                    label="Template Description (Optional)"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    themeMode={themeMode}
                  />
                  <p style={{ margin: 0, fontSize: '0.75rem', color: palette.text.secondary }}>
                    Note: Private entries and data are never copied into the template. Only the
                    structure is saved.
                  </p>
                </div>
              )}
            </div>

            {/* Summary */}
            <div
              style={{
                padding: spacing.md,
                backgroundColor: palette.action.subtle,
                borderRadius: radii.sm,
                fontSize: '0.85rem',
                color: palette.text.primary,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: spacing.xs }}>Configuration Summary</div>
              <div>
                Title: <strong>{title}</strong>
              </div>
              <div>
                Placement: <strong>{placement}</strong>
              </div>
              {(builderMode === 'collection' || builderMode === 'combined') && (
                <div>Fields: {fields.map((f) => f.label).join(', ')}</div>
              )}
              {(builderMode === 'existing_view' || builderMode === 'combined') && (
                <div>
                  Existing View Target: <strong>{viewTargetKind}</strong>
                </div>
              )}
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginTop: spacing.md }}
            >
              <Button variant="secondary" onClick={() => setStep(2)}>
                <Icon name="arrow-left" /> Back: Fields
              </Button>
              <Button variant="primary" loading={isSubmitting} onClick={handleSubmit}>
                Confirm & Create Section
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
