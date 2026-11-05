import { Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export type MobileSyncStatusKind = 'device' | 'waiting' | 'synced' | 'offline' | 'error';

const COPY: Record<MobileSyncStatusKind, string> = {
  device: 'Saved on this device',
  waiting: 'Waiting to sync',
  synced: 'Synchronized',
  offline: 'Offline',
  error: 'Sync error — retry',
};

export function MobileSyncStatusBadge({
  status,
  themeMode = 'light',
}: {
  status: MobileSyncStatusKind;
  themeMode?: ThemeMode;
}) {
  const palette = colors[themeMode];
  let bg: string = palette.action.subtle;
  let fg: string = palette.action.subtleText;
  if (status === 'device' || status === 'waiting' || status === 'offline') {
    bg = palette.status.warningBg;
    fg = palette.status.warning;
  } else if (status === 'synced') {
    bg = palette.status.successBg;
    fg = palette.status.success;
  } else if (status === 'error') {
    bg = palette.status.dangerBg;
    fg = palette.status.danger;
  }
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={COPY[status]}
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radii.pill,
        backgroundColor: bg,
      }}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{COPY[status]}</Text>
    </View>
  );
}
