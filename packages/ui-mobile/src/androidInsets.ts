/**
 * Lightweight Android inset / keyboard adapter (no extra native module required).
 *
 * Inset unit contract:
 * - Values are React Native layout pixels (density-scaled), suitable for View padding.
 * - Do not mix adb physical tap coordinates into this helper; on standard AVDs,
 *   uiautomator bounds already match RN layout space for `input tap`.
 *
 * Top clearance policy:
 * 1. Prefer an explicitly measured top inset when a platform provider supplies one
 *    (e.g. react-native-safe-area-context once linked into the Dev Client APK).
 * 2. Otherwise use max(StatusBar.currentHeight, ceil(48dp × PixelRatio)).
 *    Edge-to-edge Android 15+ often under-reports StatusBar.currentHeight while the
 *    system statusBars window still intercepts taps; 48dp is the Material status-bar
 *    touch target, density-portable across AVDs/devices (not a hard-coded 128/160px
 *    single-AVD floor).
 */
import {
  Keyboard,
  PixelRatio,
  Platform,
  StatusBar,
  type EmitterSubscription,
} from 'react-native';

export interface AndroidInsetsSnapshot {
  statusBarHeight: number;
  keyboardHeight: number;
  /** Suggested bottom padding for sticky chrome above the IME / nav bar. */
  bottomChromePad: number;
}

export function readAndroidInsets(keyboardHeight = 0): AndroidInsetsSnapshot {
  const statusBarHeight =
    Platform.OS === 'android' ? Math.max(0, StatusBar.currentHeight ?? 0) : 0;
  const bottomChromePad =
    Platform.OS === 'android' ? Math.max(8, keyboardHeight > 0 ? 8 : 12) + keyboardHeight : 0;
  return { statusBarHeight, keyboardHeight, bottomChromePad };
}

/**
 * Top padding so header chrome sits below the system status bar on Android edge-to-edge.
 *
 * @param measuredTopInset — optional layout pixels from a measured inset provider.
 */
export function androidStatusBarTopPad(measuredTopInset?: number): number {
  if (Platform.OS !== 'android') return 0;
  if (
    typeof measuredTopInset === 'number' &&
    Number.isFinite(measuredTopInset) &&
    measuredTopInset > 0
  ) {
    return Math.ceil(measuredTopInset);
  }
  const reported = Math.max(0, StatusBar.currentHeight ?? 0);
  const density =
    typeof PixelRatio?.get === 'function' ? Math.min(3.5, Math.max(1, PixelRatio.get())) : 1;
  const materialStatusBarPx = Math.ceil(48 * density);
  return Math.max(reported, materialStatusBarPx);
}

/**
 * Subscribe to keyboard show/hide. Returns unsubscribe.
 * On non-Android platforms the callback receives zeros and no listeners are attached.
 */
export function subscribeAndroidKeyboardInsets(
  onChange: (snapshot: AndroidInsetsSnapshot) => void
): () => void {
  onChange(readAndroidInsets(0));

  // Vitest / mini renderer may stub Platform as android without a Keyboard emitter.
  if (Platform.OS !== 'android' || typeof Keyboard?.addListener !== 'function') {
    return () => undefined;
  }

  const showSub: EmitterSubscription = Keyboard.addListener('keyboardDidShow', (e) => {
    onChange(readAndroidInsets(Math.round(e.endCoordinates?.height ?? 0)));
  });
  const hideSub: EmitterSubscription = Keyboard.addListener('keyboardDidHide', () => {
    onChange(readAndroidInsets(0));
  });

  return () => {
    showSub.remove();
    hideSub.remove();
  };
}

/** Prefer padding avoidance on both platforms so Android IME does not cover Save. */
export function keyboardAvoidingBehavior(): 'padding' | 'height' | undefined {
  if (Platform.OS === 'ios') return 'padding';
  if (Platform.OS === 'android') return 'padding';
  return undefined;
}
