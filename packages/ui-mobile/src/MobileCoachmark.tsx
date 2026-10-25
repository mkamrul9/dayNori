import { Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from './MobileButton.js';

/** Visual/accessibility foundation only — full tour engine is Phase 79. */
export function MobileCoachmark({
  open,
  title,
  description,
  stepLabel,
  themeMode = 'light',
  onContinue,
  onSkip,
  onExit,
}: {
  open: boolean;
  title: string;
  description: string;
  stepLabel?: string;
  themeMode?: ThemeMode;
  onContinue?: () => void;
  onSkip?: () => void;
  onExit?: () => void;
}) {
  const palette = colors[themeMode];
  if (!open) return null;
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${description}`}
      style={{
        maxWidth: 360,
        padding: spacing.base,
        borderRadius: radii.card,
        backgroundColor: palette.surface,
        borderWidth: 2,
        borderColor: palette.border.focus,
        gap: spacing.sm,
      }}
    >
      {stepLabel ? (
        <Text style={{ color: palette.text.secondary, fontSize: 12 }}>{stepLabel}</Text>
      ) : null}
      <Text style={{ fontWeight: '700', fontSize: 16, color: palette.text.primary }}>{title}</Text>
      <Text style={{ color: palette.text.secondary }}>{description}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {onContinue ? (
          <MobileButton themeMode={themeMode} title="Continue" onPress={onContinue} />
        ) : null}
        {onSkip ? (
          <MobileButton themeMode={themeMode} variant="secondary" title="Skip" onPress={onSkip} />
        ) : null}
        {onExit ? (
          <MobileButton themeMode={themeMode} variant="subtle" title="Exit" onPress={onExit} />
        ) : null}
      </View>
    </View>
  );
}
