import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type { CustomFieldDefinition, FieldCollectionBlock } from '@daynori/domain';
import { MobileModalSheet } from './MobileModalSheet.js';
import { MobileTextField } from './MobileTextField.js';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';

export interface MobileCustomSectionEntrySheetProps {
  visible: boolean;
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

export const MobileCustomSectionEntrySheet: React.FC<MobileCustomSectionEntrySheetProps> = ({
  visible,
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

  useEffect(() => {
    if (visible) {
      setFieldValues({ ...initialValues });
      setFolderId(initialFolderId);
      setError(null);
    }
  }, [visible, initialValues, initialFolderId]);

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

  const handleSubmit = async () => {
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
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
      title={recordId ? `Edit ${collection.title}` : `New ${collection.title}`}
      themeMode={themeMode}
    >
      <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
        {error && <MobileFeedback severity="danger" message={error} themeMode={themeMode} />}

        {/* Folder selection */}
        {availableFolders.length > 0 && (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: palette.text.primary }}>
              Folder Placement (Optional)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Pressable
                onPress={() => setFolderId(null)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: radii.sm,
                  backgroundColor: folderId === null ? palette.action.primary : palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border.subtle,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: folderId === null ? palette.action.label : palette.text.primary,
                    fontWeight: folderId === null ? '600' : '400',
                  }}
                >
                  No folder (Inbox)
                </Text>
              </Pressable>
              {availableFolders.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => setFolderId(f.id)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: radii.sm,
                    backgroundColor: folderId === f.id ? palette.action.primary : palette.surface,
                    borderWidth: 1,
                    borderColor: palette.border.subtle,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: folderId === f.id ? palette.action.label : palette.text.primary,
                      fontWeight: folderId === f.id ? '600' : '400',
                    }}
                  >
                    {f.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Fields */}
        {collection.fields.map((field: CustomFieldDefinition) => {
          const val = fieldValues[field.id];

          if (field.type === 'text') {
            return (
              <MobileTextField
                key={field.id}
                label={`${field.label}${field.required ? ' *' : ''}`}
                value={typeof val === 'string' ? val : ''}
                onChangeText={(text) => handleFieldChange(field.id, text)}
                themeMode={themeMode}
              />
            );
          }

          if (field.type === 'number') {
            return (
              <MobileTextField
                key={field.id}
                label={`${field.label}${field.required ? ' *' : ''}`}
                keyboardType="numeric"
                value={val !== undefined && val !== null ? String(val) : ''}
                onChangeText={(text) => {
                  const num = text === '' ? undefined : Number(text);
                  handleFieldChange(field.id, num);
                }}
                themeMode={themeMode}
              />
            );
          }

          if (field.type === 'date') {
            return (
              <MobileTextField
                key={field.id}
                label={`${field.label}${field.required ? ' *' : ''} (YYYY-MM-DD)`}
                placeholder="2026-10-19"
                value={typeof val === 'string' ? val.split('T')[0] : ''}
                onChangeText={(text) => handleFieldChange(field.id, text)}
                themeMode={themeMode}
              />
            );
          }

          if (field.type === 'link') {
            return (
              <MobileTextField
                key={field.id}
                label={`${field.label}${field.required ? ' *' : ''}`}
                placeholder="https://"
                keyboardType="url"
                autoCapitalize="none"
                value={typeof val === 'string' ? val : ''}
                onChangeText={(text) => handleFieldChange(field.id, text)}
                themeMode={themeMode}
              />
            );
          }

          if (field.type === 'checklist') {
            const items = (Array.isArray(val) ? val : []) as Array<{ text: string; completed: boolean }>;
            return (
              <View key={field.id} style={{ gap: spacing.xs }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: palette.text.primary }}>
                  {field.label}
                  {field.required ? ' *' : ''}
                </Text>
                {items.map((it, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => handleChecklistToggle(field.id, idx)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.xs,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{it.completed ? '☑' : '☐'}</Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: it.completed ? palette.text.secondary : palette.text.primary,
                        textDecorationLine: it.completed ? 'line-through' : 'none',
                      }}
                    >
                      {it.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            );
          }

          if (field.type === 'attachment') {
            return (
              <MobileTextField
                key={field.id}
                label={`${field.label} (Attachment Reference)`}
                placeholder="Enter file or attachment name"
                value={typeof val === 'string' ? val : typeof val === 'object' && val !== null ? (val as { fileName?: string }).fileName || '' : ''}
                onChangeText={(text) => handleFieldChange(field.id, text ? { fileName: text } : null)}
                themeMode={themeMode}
              />
            );
          }

          return null;
        })}

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md }}>
          <MobileButton variant="secondary" title="Cancel" onPress={onClose} themeMode={themeMode} />
          <MobileButton
            variant="primary"
            title={isSubmitting ? 'Saving...' : recordId ? 'Save' : 'Add Entry'}
            onPress={handleSubmit}
            disabled={isSubmitting}
            themeMode={themeMode}
          />
        </View>
      </ScrollView>
    </MobileModalSheet>
  );
};
