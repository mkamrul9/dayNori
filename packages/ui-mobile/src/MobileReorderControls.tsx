import { View } from 'react-native';
import { spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileIconButton } from './MobileIconButton.js';

export function MobileReorderControls({
  label,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  themeMode = 'light',
}: {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  themeMode?: ThemeMode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`Reorder ${label}`}
      style={{ flexDirection: 'row', gap: spacing.xs }}
    >
      <MobileIconButton
        label={`Move ${label} up`}
        icon="arrow-up"
        themeMode={themeMode}
        disabled={!canMoveUp}
        onPress={onMoveUp}
      />
      <MobileIconButton
        label={`Move ${label} down`}
        icon="arrow-down"
        themeMode={themeMode}
        disabled={!canMoveDown}
        onPress={onMoveDown}
      />
    </View>
  );
}
