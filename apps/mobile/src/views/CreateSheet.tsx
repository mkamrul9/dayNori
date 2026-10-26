import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { Icon, MobileButton, MobileModalSheet, MobileTextField } from '@daynori/ui-mobile';
import type { CreateDraft } from '../navigation/types';
import { isCorePreview } from '../config/runtime.js';

export interface CreateSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  initialDraft?: CreateDraft;
  onDraftChange?: (draft: CreateDraft) => void;
  onCreateItem: (item: CreateDraft) => void | Promise<void>;
  onRecordAudio?: () => void;
  testID?: string;
}

export const CreateSheet: React.FC<CreateSheetProps> = ({
  visible,
  onClose,
  themeMode,
  initialDraft,
  onDraftChange,
  onCreateItem,
  onRecordAudio,
  testID = 'create-sheet',
}) => {
  const palette = colors[themeMode];
  const [itemType, setItemType] = useState<CreateDraft['type']>(initialDraft?.type || 'task');
  const [title, setTitle] = useState(initialDraft?.title || '');
  const [details, setDetails] = useState(initialDraft?.details || '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);

  const updateDraft = (newType: CreateDraft['type'], newTitle: string, newDetails: string) => {
    if (onDraftChange) {
      onDraftChange({ type: newType, title: newTitle, details: newDetails });
    }
  };

  const handleTypeSelect = (type: CreateDraft['type']) => {
    setItemType(type);
    updateDraft(type, title, details);
  };

  const handleTitleChange = (text: string) => {
    setTitle(text);
    if (error) setError(null);
    updateDraft(itemType, text, details);
  };

  const handleDetailsChange = (text: string) => {
    setDetails(text);
    updateDraft(itemType, title, text);
  };

  const handleSubmit = async () => {
    if (saving.current) return;
    if (!title.trim()) {
      setError('Please provide a title for the item');
      return;
    }
    saving.current = true;
    setIsSaving(true);
    try {
      await onCreateItem({ type: itemType, title: title.trim(), details: details.trim() });
      setTitle('');
      setDetails('');
      setError(null);
      onDraftChange?.({ type: itemType, title: '', details: '' });
      onClose();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Keep drafts; surface a safe actionable reason (never key material).
      const safe =
        raw.match(
          /\b(Sign in and open your workspace|Choose a file in Library|Please provide a title|NO_SECURE_RANDOM|KEY_NOT_FOUND|KEY_INVALIDATED_OR_MISMATCH|SQLCIPHER_UNAVAILABLE|StorageUnavailableError)\b/
        )?.[1] ?? null;
      setError(
        safe
          ? `Could not save (${safe}). Your draft is kept.`
          : 'Could not save. Sign in and open your workspace, or use Library for files. Your draft is kept.'
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={() => {
        if (!saving.current) onClose();
      }}
      title="Create New Item"
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.content}>
        {/* Type Selector Buttons */}
        <Text style={[styles.sectionLabel, { color: palette.text.secondary }]}>Item Type</Text>
        <View style={styles.typeSelectorRow}>
          {(
            [
              { key: 'task', label: 'Task' },
              { key: 'routine', label: 'Routine' },
              { key: 'note', label: 'Note' },
              { key: 'file', label: 'File' },
              { key: 'journal', label: 'Journal' },
            ] as const
          )
            .filter((t) => !isCorePreview || t.key !== 'file')
            .map((t) => {
              const isSelected = itemType === t.key;
              return (
                <Pressable
                  key={t.key}
                  testID={`create-type-${t.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Item type ${t.label}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => handleTypeSelect(t.key)}
                  disabled={isSaving}
                  style={[
                    styles.typeButton,
                    {
                      backgroundColor: isSelected ? palette.action.primary : palette.surfaceRaised,
                      borderColor: isSelected ? palette.action.primary : palette.border.subtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      { color: isSelected ? palette.action.label : palette.text.primary },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
        </View>

        {/* Inputs — stable testIDs distinct from type chips and submit */}
        <MobileTextField
          testID="create-title-input"
          label="Title"
          placeholder={`Give your ${itemType} a clear title...`}
          value={title}
          editable={!isSaving}
          onChangeText={handleTitleChange}
          errorMessage={error || undefined}
          themeMode={themeMode}
        />

        <MobileTextField
          testID="create-details-input"
          label="Details or Notes (optional)"
          placeholder="Add tags, deadlines, or additional context..."
          value={details}
          editable={!isSaving}
          onChangeText={handleDetailsChange}
          multiline={true}
          numberOfLines={3}
          themeMode={themeMode}
        />

        {onRecordAudio && (
          <View style={{ marginTop: spacing.sm }}>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={() => {
                onClose();
                onRecordAudio();
              }}
              disabled={isSaving}
              accessibilityLabel="Record voice memo"
            >
              <Icon name="microphone" /> Record Voice Memo
            </MobileButton>
          </View>
        )}

        <View style={styles.actionRow}>
          <MobileButton
            testID="create-submit-btn"
            variant="primary"
            themeMode={themeMode}
            onPress={() => void handleSubmit()}
            disabled={isSaving}
            accessibilityLabel={`Submit create ${itemType}`}
          >
            Create {itemType.charAt(0).toUpperCase() + itemType.slice(1)}
          </MobileButton>
          <View style={{ height: spacing.xs }} />
          <MobileButton
            testID="create-cancel-btn"
            variant="subtle"
            themeMode={themeMode}
            onPress={onClose}
            disabled={isSaving}
            accessibilityLabel="Cancel item creation"
          >
            Cancel
          </MobileButton>
        </View>
      </View>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  typeButton: {
    flex: 1,
    minHeight: touchTargets.mobileMin, // 48dp minimum touch target
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionRow: {
    marginTop: spacing.md,
  },
});
