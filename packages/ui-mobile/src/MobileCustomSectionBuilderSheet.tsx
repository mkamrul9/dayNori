import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  APPROVED_CUSTOM_SECTION_TEMPLATES,
  type CustomBlockDefinition,
  type CustomFieldDefinition,
  type CustomFieldType,
  type CustomSectionStarterTemplate,
  type ExistingRecordTargetKind,
} from '@daynori/domain';
import { MobileModalSheet } from './MobileModalSheet.js';
import { MobileButton } from './MobileButton.js';
import { MobileTextField } from './MobileTextField.js';
import { MobileFeedback } from './MobileFeedback.js';

export interface MobileCustomSectionBuilderSheetProps {
  visible: boolean;
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

export const MobileCustomSectionBuilderSheet: React.FC<MobileCustomSectionBuilderSheetProps> = ({
  visible,
  onClose,
  themeMode = 'light',
  availableTemplates = APPROVED_CUSTOM_SECTION_TEMPLATES,
  onCreateSection,
}) => {
  const palette = colors[themeMode];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<'collection' | 'existing_view' | 'combined'>('collection');

  // Step 1: Basics
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [placement, setPlacement] = useState<'dashboard' | 'sidebar' | 'quick_access'>('dashboard');

  // Step 2: Collection Fields
  const [fields, setFields] = useState<CustomFieldDefinition[]>([
    { id: 'field_title', label: 'Title', type: 'text', required: true },
  ]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  // Step 2: View Filter
  const [targetKind, setTargetKind] = useState<ExistingRecordTargetKind>('tasks');
  const [folderFilter, setFolderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'archived'>(
    'all'
  );

  // Step 3: Template save
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setMode('collection');
    setTitle('');
    setDescription('');
    setPlacement('dashboard');
    setFields([{ id: 'field_title', label: 'Title', type: 'text', required: true }]);
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldRequired(false);
    setTargetKind('tasks');
    setFolderFilter('');
    setStatusFilter('all');
    setSaveAsTemplate(false);
    setTemplateName('');
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleApplyTemplate = (tmpl: CustomSectionStarterTemplate) => {
    setTitle(tmpl.name);
    setDescription(tmpl.description);
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
        setMode('combined');
        setFields([...colBlock.fields]);
        setTargetKind(viewBlock.targetKind);
      } else if (colBlock) {
        setMode('collection');
        setFields([...colBlock.fields]);
      } else if (viewBlock) {
        setMode('existing_view');
        setTargetKind(viewBlock.targetKind);
      }
    }
  };

  const handleAddField = () => {
    const trimmed = newFieldLabel.trim();
    if (!trimmed) {
      setError('Field name is required');
      return;
    }
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (['__proto__', 'constructor', 'prototype'].includes(slug)) {
      setError('Reserved field name not allowed');
      return;
    }

    const base = {
      id: `field_${slug}_${Date.now().toString(36)}`,
      label: trimmed,
      required: newFieldRequired,
    };
    let newField: CustomFieldDefinition;
    switch (newFieldType) {
      case 'checklist':
        newField = { ...base, type: 'checklist' };
        break;
      case 'date':
        newField = { ...base, type: 'date' };
        break;
      case 'number':
        newField = { ...base, type: 'number' };
        break;
      case 'link':
        newField = { ...base, type: 'link' };
        break;
      case 'attachment':
        newField = { ...base, type: 'attachment' };
        break;
      case 'text':
      default:
        newField = { ...base, type: 'text' };
        break;
    }

    setFields([...fields, newField]);
    setNewFieldLabel('');
    setNewFieldRequired(false);
    setError(null);
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= fields.length) return;
    const reordered = [...fields];
    const temp = reordered[index]!;
    reordered[index] = reordered[target]!;
    reordered[target] = temp;
    setFields(reordered);
  };

  const handleRemoveField = (id: string) => {
    if (fields.length <= 1) {
      setError('At least one field is required');
      return;
    }
    setFields(fields.filter((f) => f.id !== id));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      setStep(1);
      return;
    }

    const blocks: CustomBlockDefinition[] = [];
    if (mode === 'collection' || mode === 'combined') {
      blocks.push({
        id: `block_col_${Date.now().toString(36)}`,
        type: 'field_collection',
        title: `${title.trim()} Entries`,
        fields,
      });
    }

    if (mode === 'existing_view' || mode === 'combined') {
      blocks.push({
        id: `block_view_${Date.now().toString(36)}`,
        type: 'existing_record_view',
        title: `${title.trim()} View`,
        targetKind,
        filter: {
          folderId: folderFilter.trim() || undefined,
          status: statusFilter,
        },
        displayMode: 'card',
      });
    }

    try {
      setSubmitting(true);
      setError(null);
      await onCreateSection({
        title: title.trim(),
        description: description.trim() || undefined,
        placement,
        blocks,
        saveAsTemplate:
          saveAsTemplate && templateName.trim() ? { name: templateName.trim() } : undefined,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create section');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={handleClose}
      title="Create Custom Section"
      themeMode={themeMode}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {error && <MobileFeedback severity="danger" message={error} themeMode={themeMode} />}

        {/* Step Tabs */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.xs,
            borderBottomWidth: 1,
            borderColor: palette.border.subtle,
            paddingBottom: spacing.sm,
          }}
        >
          <MobileButton
            variant={step === 1 ? 'primary' : 'subtle'}
            title="1. Basics"
            onPress={() => setStep(1)}
            style={{ flex: 1 }}
          />
          <MobileButton
            variant={step === 2 ? 'primary' : 'subtle'}
            title="2. Fields"
            onPress={() => setStep(2)}
            style={{ flex: 1 }}
          />
          <MobileButton
            variant={step === 3 ? 'primary' : 'subtle'}
            title="3. Review"
            onPress={() => setStep(3)}
            style={{ flex: 1 }}
          />
        </View>

        {/* STEP 1 */}
        {step === 1 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontWeight: '600', color: palette.text.primary, fontSize: 14 }}>
              Choose a Starter Template
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {availableTemplates.map((t: CustomSectionStarterTemplate) => (
                <Pressable
                  key={t.id}
                  onPress={() => handleApplyTemplate(t)}
                  style={{
                    padding: spacing.sm,
                    borderRadius: radii.sm,
                    borderWidth: 1,
                    borderColor: palette.border.strong,
                    backgroundColor: palette.surface,
                    minWidth: 140,
                  }}
                >
                  <Text style={{ fontWeight: '600', color: palette.text.primary, fontSize: 13 }}>
                    {t.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: palette.text.secondary }}>{t.category}</Text>
                </Pressable>
              ))}
            </View>

            <MobileTextField
              label="Section Name"
              value={title}
              onChangeText={setTitle}
              themeMode={themeMode}
            />

            <MobileTextField
              label="Description (Optional)"
              value={description}
              onChangeText={setDescription}
              themeMode={themeMode}
            />

            <Text style={{ fontWeight: '600', color: palette.text.primary, fontSize: 14 }}>
              Section Kind
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <MobileButton
                variant={mode === 'collection' ? 'primary' : 'secondary'}
                title="Collection"
                onPress={() => setMode('collection')}
                style={{ flex: 1 }}
              />
              <MobileButton
                variant={mode === 'existing_view' ? 'primary' : 'secondary'}
                title="Existing View"
                onPress={() => setMode('existing_view')}
                style={{ flex: 1 }}
              />
              <MobileButton
                variant={mode === 'combined' ? 'primary' : 'secondary'}
                title="Both"
                onPress={() => setMode('combined')}
                style={{ flex: 1 }}
              />
            </View>

            <MobileButton
              variant="primary"
              title="Next: Fields"
              onPress={() => {
                if (!title.trim()) {
                  setError('Please enter a section name');
                  return;
                }
                setError(null);
                setStep(2);
              }}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <View style={{ gap: spacing.md }}>
            {(mode === 'collection' || mode === 'combined') && (
              <View style={{ gap: spacing.sm }}>
                <Text style={{ fontWeight: '600', color: palette.text.primary, fontSize: 14 }}>
                  Fields (Accessible Non-Drag Ordering)
                </Text>
                {fields.map((f, idx) => (
                  <View
                    key={f.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: spacing.sm,
                      backgroundColor: palette.surface,
                      borderRadius: radii.sm,
                      borderWidth: 1,
                      borderColor: palette.border.subtle,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: palette.text.primary }}>
                        {f.label} ({f.type})
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                      <MobileButton
                        variant="subtle"
                        title="Move up"
                        disabled={idx === 0}
                        onPress={() => handleMoveField(idx, 'up')}
                        accessibilityLabel={`Move ${f.label} up`}
                        style={{
                          minWidth: touchTargets.mobileMin,
                          minHeight: touchTargets.mobileMin,
                        }}
                      />
                      <MobileButton
                        variant="subtle"
                        title="Move down"
                        disabled={idx === fields.length - 1}
                        onPress={() => handleMoveField(idx, 'down')}
                        accessibilityLabel={`Move ${f.label} down`}
                        style={{
                          minWidth: touchTargets.mobileMin,
                          minHeight: touchTargets.mobileMin,
                        }}
                      />
                      <MobileButton
                        variant="danger"
                        title="Close"
                        onPress={() => handleRemoveField(f.id)}
                        accessibilityLabel={`Remove ${f.label}`}
                        style={{
                          minWidth: touchTargets.mobileMin,
                          minHeight: touchTargets.mobileMin,
                        }}
                      />
                    </View>
                  </View>
                ))}

                <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
                  <MobileTextField
                    label="New Field Name"
                    value={newFieldLabel}
                    onChangeText={setNewFieldLabel}
                    themeMode={themeMode}
                  />
                  <MobileButton variant="secondary" title="+ Add Field" onPress={handleAddField} />
                </View>
              </View>
            )}

            {(mode === 'existing_view' || mode === 'combined') && (
              <View style={{ gap: spacing.sm }}>
                <Text style={{ fontWeight: '600', color: palette.text.primary, fontSize: 14 }}>
                  Existing View Filter
                </Text>
                <MobileTextField
                  label="Target Folder (Optional)"
                  value={folderFilter}
                  onChangeText={setFolderFilter}
                  themeMode={themeMode}
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <MobileButton
                variant="secondary"
                title="Back"
                onPress={() => setStep(1)}
                style={{ flex: 1 }}
              />
              <MobileButton
                variant="primary"
                title="Next: Review"
                onPress={() => setStep(3)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <View style={{ gap: spacing.md }}>
            <View
              style={{
                padding: spacing.md,
                backgroundColor: palette.action.subtle,
                borderRadius: radii.sm,
              }}
            >
              <Text
                style={{ fontWeight: '600', color: palette.text.primary, marginBottom: spacing.xs }}
              >
                Summary
              </Text>
              <Text style={{ color: palette.text.primary, fontSize: 13 }}>Title: {title}</Text>
              <Text style={{ color: palette.text.secondary, fontSize: 12 }}>
                Placement: {placement}
              </Text>
              <Text style={{ color: palette.text.secondary, fontSize: 12 }}>
                Fields: {fields.map((f) => f.label).join(', ')}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <MobileButton
                variant="secondary"
                title="Back"
                onPress={() => setStep(2)}
                style={{ flex: 1 }}
              />
              <MobileButton
                variant="primary"
                title="Create Section"
                loading={submitting}
                onPress={handleSubmit}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </MobileModalSheet>
  );
};
