import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface MobileModalSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  themeMode?: ThemeMode;
  children: React.ReactNode;
}

export const MobileModalSheet: React.FC<MobileModalSheetProps> = ({
  visible,
  onClose,
  title,
  themeMode = 'light',
  children,
}) => {
  const palette = colors[themeMode];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border.subtle,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text.primary }]}>{title}</Text>
            <Pressable
              onPress={onClose}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, { color: palette.text.secondary }]}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: 1,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
  },
  content: {
    paddingBottom: spacing.base,
  },
});
