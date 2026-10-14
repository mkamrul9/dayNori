import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';

export interface MobileModalSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  themeMode?: ThemeMode;
  children: React.ReactNode;
  testID?: string;
}

export const MobileModalSheet: React.FC<MobileModalSheetProps> = ({
  visible,
  onClose,
  title,
  themeMode = 'light',
  children,
  testID,
}) => {
  const palette = colors[themeMode];
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Check initial OS reduced motion preference (F09 fix)
    AccessibilityInfo.isReduceMotionEnabled()
      ?.then?.((enabled) => {
        if (isMounted) setReduceMotion(Boolean(enabled));
      })
      .catch?.(() => {});

    // Subscribe to runtime changes to the reduced motion preference
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled: boolean) => {
        if (isMounted) setReduceMotion(Boolean(enabled));
      }
    );

    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, []);

  return (
    <Modal
      testID={testID}
      visible={visible}
      transparent={true}
      animationType={reduceMotion ? 'none' : 'slide'}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
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
    maxHeight: '85%',
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
    minHeight: touchTargets.mobileMin, // 48dp minimum touch target (F08 fix)
    minWidth: touchTargets.mobileMin, // 48dp minimum touch target (F08 fix)
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
  },
  scrollArea: {
    maxHeight: '100%',
  },
  content: {
    paddingBottom: spacing.base,
  },
});
