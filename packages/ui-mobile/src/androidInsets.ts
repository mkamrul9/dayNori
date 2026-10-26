/**
 * Lightweight Android inset / keyboard adapter.
 * Prefer measured safe-area insets from react-native-safe-area-context when available.
 * StatusBar.currentHeight is a fallback for unit tests / providers not mounted —
 * it can under-report on edge-to-edge Android 15+ (targetSdk ≥ 35).
 */
import {
  Keyboard,
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
 * @param measuredTopInset — layout pixels from `useSafeAreaInsets().top` (preferred).
 *   Do not pass physical-screen / adb tap coordinates here; RN layout and input coords
 *   share the same density-scaled space for View padding, but adb `input tap` uses
 *   display pixels which already match RN bounds dumps on standard AVDs.
 */
export function androidStatusBarTopPad(measuredTopInset?: number): number {
  if (Platform.OS !== 'android') return 0;
  if (typeof measuredTopInset === 'number' && Number.isFinite(measuredTopInset) && measuredTopInset >= 0) {
    return Math.ceil(measuredTopInset);
  }
  // Fallback only: no AVD-specific floor. Prefer mounting SafeAreaProvider in App.
  return Math.max(0, Math.ceil(StatusBar.currentHeight ?? 0));
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
