import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface MobileTypeBadgeProps {
  kind: 'folder' | 'note' | 'task' | 'routine' | 'journal' | string;
  themeMode?: ThemeMode;
  style?: StyleProp<ViewStyle>;
}

export const MobileTypeBadge: React.FC<MobileTypeBadgeProps> = ({
  kind,
  themeMode = 'light',
  style,
}) => {
  const palette = colors[themeMode];

  let bg: string = palette.surfaceRaised;
  let text: string = palette.text.secondary;
  let label = kind.toUpperCase();
  let icon = '📄';

  switch (kind) {
    case 'folder':
      bg = themeMode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#eff6ff';
      text = themeMode === 'dark' ? '#93c5fd' : '#1d4ed8';
      label = 'Folder';
      icon = '📁';
      break;
    case 'note':
      bg = themeMode === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#ecfdf5';
      text = themeMode === 'dark' ? '#6ee7b7' : '#047857';
      label = 'Note';
      icon = '📝';
      break;
    case 'task':
    case 'todo':
      bg = themeMode === 'dark' ? 'rgba(245, 158, 11, 0.2)' : '#fffbeb';
      text = themeMode === 'dark' ? '#fcd34d' : '#b45309';
      label = 'Task';
      icon = '✅';
      break;
    case 'routine':
      bg = themeMode === 'dark' ? 'rgba(139, 92, 246, 0.2)' : '#f5f3ff';
      text = themeMode === 'dark' ? '#c4b5fd' : '#6d28d9';
      label = 'Routine';
      icon = '🔄';
      break;
    case 'journal':
      bg = themeMode === 'dark' ? 'rgba(236, 72, 153, 0.2)' : '#fdf2f8';
      text = themeMode === 'dark' ? '#f472b6' : '#be185d';
      label = 'Journal';
      icon = '📖';
      break;
    case 'knowledge':
      bg = themeMode === 'dark' ? 'rgba(14, 165, 233, 0.2)' : '#f0f9ff';
      text = themeMode === 'dark' ? '#7dd3fc' : '#0369a1';
      label = 'Knowledge';
      icon = '💡';
      break;
    default:
      label = kind.charAt(0).toUpperCase() + kind.slice(1);
      break;
  }

  return (
    <View
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={`Item type: ${label}`}
      style={[styles.badge, { backgroundColor: bg }, style]}
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  icon: {
    fontSize: 10,
    marginRight: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
