import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radii, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { Icon } from '@daynori/ui-mobile';
import type { NoriCompanionPosition, NoriCompanionPreferences, NoriCompanionState } from '@daynori/contracts';
import {
  calculateNoriSafeCoordinates,
  getNoriStateAccessibilityLabel,
  resolveNoriState,
} from '@daynori/domain';

export interface NoriCompanionLauncherProps {
  themeMode?: ThemeMode;
  onPress: () => void;
  isOpen?: boolean;
  preferences?: NoriCompanionPreferences;
  isListening?: boolean;
  isThinking?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  isOffline?: boolean;
  isQuietHours?: boolean;
  bottomNavHeight?: number;
  testID?: string;
}

export function NoriCompanionLauncher({
  themeMode = 'light',
  onPress,
  isOpen = false,
  preferences = { enabled: true, position: 'bottom-right', reducedMotion: false },
  isListening = false,
  isThinking = false,
  isSuccess = false,
  isError = false,
  isOffline = false,
  isQuietHours = false,
  bottomNavHeight = 64,
  testID = 'nori-companion-launcher',
}: NoriCompanionLauncherProps) {
  const isDark = themeMode === 'dark';
  const palette = colors[themeMode];

  // If user disabled floating companion, do not render (labeled button in settings/menu remains available)
  if (preferences.enabled === false) {
    return null;
  }

  const currentState: NoriCompanionState = resolveNoriState({
    isAssistantOpen: isOpen,
    isListening,
    isThinking,
    isSuccess,
    isError,
    isOffline,
    isQuietHours,
  });

  const position: NoriCompanionPosition = preferences.position || 'bottom-right';
  const coords = calculateNoriSafeCoordinates(position, {
    bottomNavHeight,
    bottom: 16,
    right: 16,
    left: 16,
    top: 16,
  });

  const label = getNoriStateAccessibilityLabel(currentState);

  // Icon color derived from truthful state
  let iconColor = isDark ? '#2FA89A' : palette.action.primary;
  if (currentState === 'listening') {
    iconColor = isDark ? '#E5B55A' : '#D9A441';
  } else if (currentState === 'error') {
    iconColor = isDark ? colors.dark.status.danger : colors.light.status.danger;
  } else if (currentState === 'offline') {
    iconColor = isDark ? '#6B7C7C' : '#8A9B9B';
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: typeof coords.top === 'number' ? coords.top : undefined,
          bottom: typeof coords.bottom === 'number' ? coords.bottom : undefined,
          left: typeof coords.left === 'number' ? coords.left : undefined,
          right: typeof coords.right === 'number' ? coords.right : undefined,
        },
      ]}
    >
      <TouchableOpacity
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens Ask Nori daily assistant"
        activeOpacity={0.8}
        onPress={onPress}
        style={[
          styles.button,
          {
            backgroundColor: isDark ? palette.surfaceRaised : '#FFFFFF',
            borderColor: isDark ? '#3D4D4D' : '#D9DFDC',
          },
        ]}
      >
        <Icon name="nori" size={26} color={iconColor} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 90,
  },
  button: {
    width: 52,
    height: 52,
    minWidth: touchTargets.mobileMin,
    minHeight: touchTargets.mobileMin,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
});
