import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileModalSheet, MobileTextField } from '@daynori/ui-mobile';
import type { CreateDraft } from '../navigation/types';

export interface CreateSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  initialDraft?: CreateDraft;
  onDraftChange?: (draft: CreateDraft) => void;
  onCreateItem: (item: CreateDraft) => void;
  testID?: string;
}

export const CreateSheet: React.FC<CreateSheetProps> = ({
  visible,
  onClose,
  themeMode,
  initialDraft,
  onDraftChange,
  onCreateItem,
  testID = 'create-sheet',
}) => {
  const palette = colors[themeMode];
  const [itemType, setItemType] = useState<CreateDraft['type']>(initialDraft?.type || 'task');
  const [title, setTitle] = useState(initialDraft?.title || '');
  const [details, setDetails] = useState(initialDraft?.details || '');
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = () => {
    if (!title.trim()) {
      setError('Please provide a title for the item');
      return;
    }
    onCreateItem({
      type: itemType,
      title: title.trim(),
      details: details.trim(),
    });
    // Clear draft after creation
    setTitle('');
    setDetails('');
    setError(null);
    onClose();
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
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
          ).map((t) => {
            const isSelected = itemType === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`create-type-${t.key}`}
                accessibilityRole="button"
                accessibilityLabel={`Create ${t.label}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => handleTypeSelect(t.key)}
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

        {/* Inputs */}
        <MobileTextField
          label="Title"
          placeholder={`Give your ${itemType} a clear title...`}
          value={title}
          onChangeText={handleTitleChange}
          errorMessage={error || undefined}
          themeMode={themeMode}
        />

        <MobileTextField
          label="Details or Notes (optional)"
          placeholder="Add tags, deadlines, or additional context..."
          value={details}
          onChangeText={handleDetailsChange}
          multiline={true}
          numberOfLines={3}
          themeMode={themeMode}
        />

        <View style={styles.actionRow}>
          <MobileButton
            variant="primary"
            themeMode={themeMode}
            onPress={handleSubmit}
            accessibilityLabel={`Create ${itemType}`}
          >
            Create {itemType.charAt(0).toUpperCase() + itemType.slice(1)}
          </MobileButton>
          <View style={{ height: spacing.xs }} />
          <MobileButton
            variant="subtle"
            themeMode={themeMode}
            onPress={onClose}
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
